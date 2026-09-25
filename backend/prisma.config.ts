import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// The schema is split per module: prisma/schema.prisma holds the generator and
// datasource, prisma/schemas/<module>.prisma holds one PostgreSQL schema each.
//
// Migrations run as the schema-owner role (MIGRATION_DATABASE_URL). The
// services connect as the non-owner runtime role (DATABASE_URL), which is
// subject to tenant row-level security. Local setups that have only one URL
// fall back to DATABASE_URL.
export default defineConfig({
  schema: 'prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['MIGRATION_DATABASE_URL'] ?? process.env['DATABASE_URL'],
    shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'],
  },
});
