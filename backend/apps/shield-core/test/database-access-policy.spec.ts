import * as fs from 'fs';
import * as path from 'path';
import {
  BACKEND_ROOT,
  CatalogModel,
  delegateUsage,
  loadPrismaCatalog,
  sourceFiles,
} from './support/prisma-schema-catalog';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const policy = require('../../../prisma/access/access-policy') as {
  SERVICE_ROLES: Record<
    string,
    {
      service: string;
      allSchemas?: boolean;
      ownSchemas?: string[];
      tables?: Record<string, 'read' | 'readwrite'>;
    }
  >;
  TABLES: Record<
    string,
    {
      kind: string;
      parent?: string;
      fk?: string;
      column?: string;
      columns?: string[];
    }
  >;
};

/**
 * CI half of the database access policy (the other half is
 * scripts/apply-database-access.js, which enforces the same at deploy time).
 * ZoikoShield combined spec §11.1 and §15.
 */
describe('database access policy', () => {
  const catalog = loadPrismaCatalog();
  const byKey = new Map(catalog.map((m) => [m.key, m]));
  const byDelegate = new Map(catalog.map((m) => [m.delegate, m]));

  const hasRequiredTenant = (m: CatalogModel) =>
    ['tenant_id', 'tenantId'].some(
      (f) => m.fields.get(f) && !m.fields.get(f)!.optional,
    );

  it('gives every table an isolation decision', () => {
    const undecided = catalog
      .filter((m) => !policy.TABLES[m.key] && !hasRequiredTenant(m))
      .map((m) => m.key);
    expect(undecided).toEqual([]);
  });

  it('names only tables and columns that exist', () => {
    const problems: string[] = [];
    for (const [key, entry] of Object.entries(policy.TABLES)) {
      const model = byKey.get(key);
      if (!model) {
        problems.push(`${key}: no such table`);
        continue;
      }
      const needs = [
        entry.fk,
        entry.column,
        ...(entry.columns ?? []),
        ...(['account', 'account_or_shared', 'tenant_or_account'].includes(
          entry.kind,
        ) && !entry.column
          ? ['commercial_account_id']
          : []),
        ...(entry.kind.startsWith('tenant') && entry.kind !== 'tenant_pair'
          ? [model.fields.has('tenant_id') ? 'tenant_id' : 'tenantId']
          : []),
      ].filter((c): c is string => Boolean(c));
      for (const column of needs) {
        if (!model.fields.has(column))
          problems.push(`${key}: no column ${column}`);
      }
      if (entry.parent && !byKey.has(entry.parent))
        problems.push(`${key}: parent ${entry.parent} missing`);
    }
    expect(problems).toEqual([]);
  });

  it('classifies nullable tenant columns deliberately, never by default', () => {
    // A NULL tenant_id means different things per table (shared definition,
    // account-level record, platform bookkeeping): the policy must say which.
    const implicit = catalog
      .filter((m) =>
        ['tenant_id', 'tenantId'].some((f) => m.fields.get(f)?.optional),
      )
      .filter((m) => !policy.TABLES[m.key])
      .map((m) => m.key);
    expect(implicit).toEqual([]);
  });

  describe.each(
    Object.entries(policy.SERVICE_ROLES).filter(([, spec]) => !spec.allSchemas),
  )('%s', (role, spec) => {
    it(`holds a grant for every table ${spec.service} touches`, () => {
      const missing: string[] = [];
      for (const file of sourceFiles(
        path.join(BACKEND_ROOT, 'apps', spec.service),
      )) {
        const { reads, writes } = delegateUsage(fs.readFileSync(file, 'utf8'));
        for (const [delegate, needed] of [
          ...[...reads].map((d) => [d, 'read'] as const),
          ...[...writes].map((d) => [d, 'readwrite'] as const),
        ]) {
          const model = byDelegate.get(delegate);
          if (!model) continue; // not a Prisma delegate
          if (spec.ownSchemas?.includes(model.schema)) continue;
          const granted = spec.tables?.[model.key];
          if (!granted || (needed === 'readwrite' && granted !== 'readwrite')) {
            missing.push(
              `${model.key} (${needed}) in ${path.relative(BACKEND_ROOT, file)}`,
            );
          }
        }
      }
      expect({ role, missing: [...new Set(missing)].sort() }).toEqual({
        role,
        missing: [],
      });
    });
  });

  describe('module schema ownership (spec §11.1, §19.1: no cross-module direct writes)', () => {
    const OWNERS: Record<string, string[]> = {
      identity: ['identity-adapter'],
      authorization: ['authorization', 'jit-elevation'],
      tenant: [
        'tenant',
        'organization',
        'legal-entity',
        'environment',
        'customer',
      ],
      ingest: ['shield-ingest'],
      ai: ['shield-ai'],
      action: ['shield-action'],
      anchor: ['shield-anchor'],
    };
    // Transactional outbox/inbox: every module appends in its own transaction.
    const SHARED_SCHEMAS = new Set(['messaging']);
    const ownersOf = (schema: string) =>
      OWNERS[schema] ?? [schema.replace(/_/g, '-')];
    const writerOf = (file: string) => {
      const parts = path
        .relative(path.join(BACKEND_ROOT, 'apps'), file)
        .split(path.sep);
      if (parts[0] !== 'shield-core') return parts[0];
      return parts[2] === 'modules' ? parts[3] : `shield-core:${parts[2]}`;
    };

    const allowlistPath = path.join(
      __dirname,
      'support',
      'cross-module-write-allowlist.json',
    );

    it('adds no new cross-module writes, and the allowlist only shrinks', () => {
      const found = new Set<string>();
      for (const file of sourceFiles(path.join(BACKEND_ROOT, 'apps'))) {
        const writer = writerOf(file);
        for (const delegate of delegateUsage(fs.readFileSync(file, 'utf8'))
          .writes) {
          const model = byDelegate.get(delegate);
          if (!model || SHARED_SCHEMAS.has(model.schema)) continue;
          if (!ownersOf(model.schema).includes(writer))
            found.add(`${writer} -> ${model.key}`);
        }
      }
      const current = [...found].sort();
      if (process.env.UPDATE_CROSS_MODULE_ALLOWLIST === '1') {
        fs.writeFileSync(
          allowlistPath,
          JSON.stringify(current, null, 2) + '\n',
        );
      }
      const allowed: string[] = JSON.parse(
        fs.readFileSync(allowlistPath, 'utf8'),
      );
      expect({
        newCrossModuleWrites: current.filter((w) => !allowed.includes(w)),
        fixedButStillAllowlisted: allowed.filter((w) => !current.includes(w)),
      }).toEqual({ newCrossModuleWrites: [], fixedButStillAllowlisted: [] });
    });
  });
});
