import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { runWithPlatformScope } from '../../../../libs/database/src';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorWebhookSecretService } from '../connectors/services/connector-webhook-secret.service';

/**
 * One-off operator task: give every existing webhook connector its own
 * signing secret.
 *
 * Connectors created before per-connector secrets existed are verified by a
 * shared or operator-supplied secret. This creates a secret for each one that
 * lacks it. The secrets are created UNREVEALED and the plaintext is never
 * printed: each tenant owner then uses "Reveal secret" on the connector's
 * panel, which shows it once. That keeps the operator from ever holding a
 * tenant's secret and needs no secure hand-off.
 *
 * It is additive. A connector keeps verifying against whatever it used before
 * (an entry in WEBHOOK_HMAC_SECRETS), so senders are not broken; that entry
 * can be removed once the sender has switched to the new secret.
 *
 * Dry run by default. Safe to run repeatedly: a connector that already has an
 * active secret is skipped.
 *
 *   node dist/apps/shield-ingest/main.js --backfill-webhook-secrets
 *   node dist/apps/shield-ingest/main.js --backfill-webhook-secrets --apply
 *   ...                                  --tenant <tenant id>      (limit to one)
 */
export interface BackfillOptions {
  apply: boolean;
  tenantId?: string;
}

export interface BackfillCandidate {
  id: string;
  tenant_id: string;
  name: string;
}

export interface BackfillResult {
  candidates: BackfillCandidate[];
  issued: number;
  failed: { id: string; error: string }[];
}

export function parseBackfillArgs(argv: string[]): BackfillOptions {
  const tenantFlag = argv.indexOf('--tenant');
  const tenantId = tenantFlag >= 0 ? argv[tenantFlag + 1] : undefined;
  if (tenantFlag >= 0 && (!tenantId || tenantId.startsWith('--'))) {
    throw new Error('--tenant needs a tenant id');
  }
  return { apply: argv.includes('--apply'), tenantId };
}

type Deps = {
  prisma: Pick<PrismaService, 'connectorInstance'>;
  secrets: Pick<ConnectorWebhookSecretService, 'issue' | 'isConfigured'>;
  out: (line: string) => void;
};

export async function runBackfill(
  { prisma, secrets, out }: Deps,
  options: BackfillOptions,
): Promise<BackfillResult> {
  const candidates = await prisma.connectorInstance.findMany({
    where: {
      authentication_type: 'WEBHOOK_SECRET',
      deletedAt: null,
      ...(options.tenantId ? { tenant_id: options.tenantId } : {}),
      webhookSecrets: { none: { status: 'ACTIVE' } },
    },
    select: { id: true, tenant_id: true, name: true },
    orderBy: [{ tenant_id: 'asc' }, { createdAt: 'asc' }],
  });

  out(
    `${candidates.length} webhook connector(s) have no signing secret` +
      (options.tenantId ? ` (tenant ${options.tenantId})` : '') +
      '.',
  );
  for (const c of candidates) out(`  ${c.tenant_id}  ${c.id}  ${c.name}`);

  const result: BackfillResult = { candidates, issued: 0, failed: [] };
  if (candidates.length === 0) return result;

  if (!options.apply) {
    out(
      secrets.isConfigured()
        ? 'Dry run: nothing was changed. Re-run with --apply to create them.'
        : 'Dry run: nothing was changed. NOTE: the secret vault is not configured here, so --apply would fail. Set CONNECTOR_SECRET_KMS_KEY first.',
    );
    return result;
  }

  if (!secrets.isConfigured()) {
    throw new Error(
      'The secret vault is not configured (CONNECTOR_SECRET_KMS_KEY in production). Nothing was changed.',
    );
  }

  for (const c of candidates) {
    try {
      await secrets.issue(c.tenant_id, c.id);
      result.issued += 1;
    } catch (error) {
      result.failed.push({
        id: c.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  out(`Created ${result.issued} of ${candidates.length} secret(s).`);
  for (const f of result.failed) out(`  FAILED ${f.id}: ${f.error}`);
  if (result.issued > 0) {
    out(
      'Each tenant owner can now open the connector and choose "Reveal secret" (shown once).',
    );
  }
  return result;
}

@Module({
  imports: [PrismaModule],
  providers: [ConnectorWebhookSecretService],
})
class BackfillModule {}

/** Returns the process exit code. */
export async function runBackfillCli(argv: string[]): Promise<number> {
  let options: BackfillOptions;
  try {
    options = parseBackfillArgs(argv);
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  // Only the database and the secret service: not the HTTP server, Kafka
  // consumers or pollers the full ingest module would start.
  const app = await NestFactory.createApplicationContext(BackfillModule, {
    logger: ['error', 'warn'],
  });
  try {
    const result = await runWithPlatformScope(
      'webhook secret backfill (operator tool)',
      () =>
        runBackfill(
          {
            prisma: app.get(PrismaService),
            secrets: app.get(ConnectorWebhookSecretService),
            out: (line) => console.log(line),
          },
          options,
        ),
    );
    return result.failed.length > 0 ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    await app.close();
  }
}
