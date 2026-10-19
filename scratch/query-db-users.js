require('dotenv').config({ path: 'backend/.env' });
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  console.log('Connecting to database...');
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const tenants = await prisma.tenant.findMany({ take: 10 });
    console.log('\n--- TENANTS IN DATABASE ---');
    console.log(JSON.stringify(tenants.map(t => ({ id: t.id, name: t.name, slug: t.slug })), null, 2));

    const principals = await prisma.principal.findMany({
      take: 10,
      include: {
        memberships: {
          include: {
            tenant: true,
          }
        }
      }
    });
    console.log('\n--- PRINCIPALS / USERS IN DATABASE ---');
    for (const p of principals) {
      console.log(`User: ${p.email} (ID: ${p.id}, status: ${p.status})`);
      for (const m of p.memberships) {
        console.log(`  -> Membership in Tenant: ${m.tenant?.name || m.tenantId} (Tenant ID: ${m.tenantId}, Role: ${m.roles || m.role})`);
      }
    }

  } catch (err) {
    console.error('Error querying database:', err.message);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
