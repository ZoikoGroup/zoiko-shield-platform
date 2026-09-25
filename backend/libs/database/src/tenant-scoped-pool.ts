import { Logger } from '@nestjs/common';
import { Pool, PoolClient, PoolConfig } from 'pg';
import { currentDbScope, sessionSettingsForCurrentScope } from './db-scope';

type ConnectCallback = (
  err: Error | undefined,
  client?: PoolClient,
  done?: (release?: unknown) => void,
) => void;

const SCOPE_SQL =
  "SELECT set_config('app.tenant_id', $1, false), set_config('app.platform_scope', $2, false), set_config('app.scope_reason', $3, false)";

const logger = new Logger('TenantScopedPool');

/**
 * A pg Pool that stamps the caller's tenant scope (libs/database/src/db-scope.ts)
 * onto every connection it hands out, so PostgreSQL row-level security sees it.
 *
 * Both paths the Prisma pg adapter uses go through connect(): transactions
 * call it directly, and pool.query() calls it internally. The scope is read
 * synchronously at the call, in the caller's async context, and written on
 * every checkout, overwriting whatever the previous borrower left. A
 * connection is therefore never handed out carrying another unit of work's
 * tenant.
 *
 * Session-level settings require a direct connection or a session-mode pooler
 * (Cloud SQL Auth Proxy, private IP). A transaction-mode pooler such as
 * PgBouncer in transaction mode could run the setting and the query on
 * different server connections and is not supported.
 */
export class TenantScopedPool extends Pool {
  private readonly debugUnscoped = process.env.DB_SCOPE_DEBUG === 'true';

  constructor(config?: PoolConfig) {
    super(config);
  }

  connect(): Promise<PoolClient>;
  connect(callback: ConnectCallback): void;
  connect(callback?: ConnectCallback): Promise<PoolClient> | void {
    const settings = sessionSettingsForCurrentScope();
    const unscoped = !settings.tenantId && !settings.platform;
    const scopeKind = currentDbScope()?.kind ?? 'no scope';
    const scoped = super.connect().then(async (client) => {
      try {
        await client.query(SCOPE_SQL, [
          settings.tenantId,
          settings.platform ? 'on' : '',
          settings.reason,
        ]);
        if (this.debugUnscoped && unscoped)
          this.logFirstStatement(client, scopeKind);
        return client;
      } catch (error) {
        // A connection that could not be scoped is never reused.
        client.release(error as Error);
        throw error;
      }
    });
    if (!callback) return scoped;
    this.deliver(scoped, callback);
  }

  private deliver(
    scoped: Promise<PoolClient>,
    callback: ConnectCallback,
  ): void {
    scoped.then(
      (client) =>
        callback(undefined, client, (release) =>
          client.release(release as Error),
        ),
      (error: Error) => callback(error),
    );
  }

  /**
   * DB_SCOPE_DEBUG=true: name the statement an unscoped checkout runs, to find
   * code paths that reach tenant tables without a scope. Control-plane reads
   * (login, membership resolution) are expected here; tenant tables are not.
   */
  private logFirstStatement(client: PoolClient, scopeKind: string): void {
    const original = client.query.bind(client) as (
      ...args: unknown[]
    ) => unknown;
    const patched = (...args: unknown[]) => {
      // One statement only: drop the own property, back to the prototype method.
      delete (client as unknown as { query?: unknown }).query;
      const first = args[0];
      const text =
        typeof first === 'string'
          ? first
          : ((first as { text?: string } | undefined)?.text ?? '');
      logger.warn(
        `Unscoped database checkout (${scopeKind}): ${text.replace(/\s+/g, ' ').slice(0, 220)}`,
      );
      return original(...args);
    };
    (client as unknown as { query: unknown }).query = patched;
  }
}

/**
 * Re-scope an open transaction to a tenant, for the rare unit of work whose
 * tenant only exists once the transaction has created it (onboarding). The
 * setting is transaction-local and reverts at COMMIT or ROLLBACK.
 */
export async function scopeTransactionToTenant(
  tx: {
    $executeRaw: (
      query: TemplateStringsArray,
      ...values: unknown[]
    ) => Promise<number>;
  },
  tenantId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
}

/**
 * Declare a raw pg session (an operator script's own Client, outside
 * TenantScopedPool) as a platform-wide operation. Only effective for a
 * member of shield_platform_scope; the reason reaches the database logs.
 */
export async function declarePlatformSession(
  client: { query: (text: string, values: unknown[]) => Promise<unknown> },
  reason: string,
): Promise<void> {
  await client.query(
    "SELECT set_config('app.tenant_id', '', false), set_config('app.platform_scope', 'on', false), set_config('app.scope_reason', $1, false)",
    [reason],
  );
}
