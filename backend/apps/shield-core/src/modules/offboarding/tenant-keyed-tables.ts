import { PrismaService } from '../../prisma/prisma.service';

export interface TenantKeyedTable {
  schema: string;
  table: string;
  /** Schema-qualified, identifier-quoted name, safe to interpolate into SQL. */
  qualified: string;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Every table, in every schema, with a tenant_id column.
 *
 * Tables live in one PostgreSQL schema per owning module, so discovery cannot
 * be limited to `public`: a filter that misses a schema makes erasure skip it
 * and verification report it clean. The system catalogue is read rather than
 * information_schema, which silently hides tables the current role holds no
 * privilege on; a table the role cannot read must fail the COUNT loudly, not
 * vanish from the verification.
 */
export async function discoverTenantKeyedTables(
  prisma: Pick<PrismaService, '$queryRaw'>,
): Promise<TenantKeyedTable[]> {
  const rows = await prisma.$queryRaw<
    Array<{ table_schema: string; table_name: string; qualified: string }>
  >`
    SELECT namespace_record.nspname AS table_schema,
           class_record.relname AS table_name,
           format('%I.%I', namespace_record.nspname, class_record.relname) AS qualified
    FROM pg_attribute attribute_record
    JOIN pg_class class_record ON class_record.oid = attribute_record.attrelid
    JOIN pg_namespace namespace_record ON namespace_record.oid = class_record.relnamespace
    WHERE attribute_record.attname = 'tenant_id'
      AND NOT attribute_record.attisdropped
      AND class_record.relkind IN ('r', 'p')
      AND NOT class_record.relispartition
      AND namespace_record.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace_record.nspname NOT LIKE 'pg_toast%'
    ORDER BY 1, 2
  `;
  return rows.map((row) => {
    if (
      !IDENTIFIER.test(row.table_schema) ||
      !IDENTIFIER.test(row.table_name)
    ) {
      throw new Error(
        `Unsafe tenant table identifier '${row.table_schema}.${row.table_name}'`,
      );
    }
    return {
      schema: row.table_schema,
      table: row.table_name,
      qualified: row.qualified,
    };
  });
}
