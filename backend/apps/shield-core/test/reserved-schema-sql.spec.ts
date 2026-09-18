import * as fs from 'fs';
import * as path from 'path';

/**
 * `authorization` is a RESERVED keyword in PostgreSQL, so raw SQL must write
 * it as "authorization".<table> — unquoted it is a syntax error, not a schema
 * reference.
 *
 * This shipped unnoticed in the tenant offboarding and data-erasure paths from
 * 2026-08-13 until it was found by hand: every DELETE against that schema threw
 * at runtime, aborting the surrounding transaction so no tenant data was erased
 * at all. Nothing caught it because those services mock Prisma, so the SQL
 * strings were never parsed by a database in any test.
 *
 * A unit test cannot parse SQL without a database, so this guards the source
 * instead: no raw SQL anywhere may reference a reserved-word schema unquoted.
 */
describe('raw SQL must quote reserved-word schema names', () => {
  // PostgreSQL reserved words that are also schema names in this database.
  const RESERVED_SCHEMAS = ['authorization'];
  const APPS_DIR = path.resolve(__dirname, '../../');

  const collectTsFiles = (dir: string, found: string[] = []): string[] => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        collectTsFiles(full, found);
      } else if (entry.name.endsWith('.ts')) {
        found.push(full);
      }
    }
    return found;
  };

  it.each(RESERVED_SCHEMAS)(
    'never references the "%s" schema unquoted in raw SQL',
    (schema) => {
      // A bare `schema.` not preceded by a double quote, inside a SQL verb
      // context. Entity decorators use schema: 'authorization' and are fine.
      const unquoted = new RegExp(
        `(FROM|JOIN|INTO|UPDATE|DELETE FROM)\\s+(?!")${schema}\\.`,
        'i',
      );

      const offenders: string[] = [];
      for (const file of collectTsFiles(APPS_DIR)) {
        if (file.endsWith(path.basename(__filename))) continue;
        const contents = fs.readFileSync(file, 'utf8');
        contents.split('\n').forEach((line, index) => {
          if (unquoted.test(line)) {
            offenders.push(
              `${path.relative(APPS_DIR, file)}:${index + 1}: ${line.trim()}`,
            );
          }
        });
      }

      expect(offenders).toEqual([]);
    },
  );
});
