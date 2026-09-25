import * as fs from 'fs';
import * as path from 'path';

export const BACKEND_ROOT = path.resolve(__dirname, '../../../..');

export interface CatalogModel {
  model: string;
  /** Prisma client delegate, e.g. commercialInvoice. */
  delegate: string;
  schema: string;
  table: string;
  /** "schema.table", the key the access policy uses. */
  key: string;
  fields: Map<string, { type: string; optional: boolean }>;
}

/** Every model in prisma/schemas/*.prisma with its database location. */
export function loadPrismaCatalog(): CatalogModel[] {
  const dir = path.join(BACKEND_ROOT, 'prisma', 'schemas');
  const models: CatalogModel[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.prisma'))) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const match of source.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
      const [, model, body] = match;
      const schema = /@@schema\("(\w+)"\)/.exec(body)?.[1];
      if (!schema) throw new Error(`${model} has no @@schema`);
      const table = /@@map\("([^"]+)"\)/.exec(body)?.[1] ?? model;
      const fields = new Map<string, { type: string; optional: boolean }>();
      for (const line of body.split('\n')) {
        const field = /^\s+(\w+)\s+(\w+)(\?|\[\])?/.exec(line);
        if (field && !line.trim().startsWith('//')) {
          fields.set(field[1], { type: field[2], optional: field[3] === '?' });
        }
      }
      models.push({
        model,
        delegate: model[0].toLowerCase() + model.slice(1),
        schema,
        table,
        key: `${schema}.${table}`,
        fields,
      });
    }
  }
  return models;
}

/** Non-spec TypeScript sources under a directory. */
export function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', 'dist', 'test'].includes(entry.name)) walk(full);
      } else if (
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.spec.ts') &&
        !entry.name.endsWith('.e2e-spec.ts')
      ) {
        found.push(full);
      }
    }
  };
  walk(dir);
  return found;
}

const WRITE_METHODS =
  'create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany';
const READ_METHODS =
  'findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|findMany|count|aggregate|groupBy';

/** Delegates a source file reads and writes through the Prisma client. */
export function delegateUsage(source: string): {
  reads: Set<string>;
  writes: Set<string>;
} {
  const reads = new Set<string>();
  const writes = new Set<string>();
  for (const m of source.matchAll(
    new RegExp(`\\.(\\w+)\\.(${WRITE_METHODS})\\(`, 'g'),
  )) {
    writes.add(m[1]);
  }
  for (const m of source.matchAll(
    new RegExp(`\\.(\\w+)\\.(${READ_METHODS})\\(`, 'g'),
  )) {
    reads.add(m[1]);
  }
  return { reads, writes };
}
