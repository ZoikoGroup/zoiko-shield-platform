import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const roles = await client.query('SELECT id, name FROM "authorization"."roles";');
  console.log('Roles:');
  console.table(roles.rows);

  const urCols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='authorization' AND table_name='user_roles';");
  console.log('user_roles columns:', urCols.rows.map(r => r.column_name));

  await client.end();
}

main().catch(console.error);
