import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

async function main() {
  const databaseUrl = process.env.DATABASE_URL || 'postgres://shield:shield@localhost:5433/shield_core';

  process.env.DATABASE_URL = databaseUrl;
  const prisma = new PrismaClient();

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: [],
    synchronize: false,
  });

  await dataSource.initialize();

  // 1. Check policy documents in TypeORM identity schema
  const policyDocs = await dataSource.query(`SELECT id, kind, version, active FROM identity.policy_documents WHERE kind = 'ACCESS_DISCLOSURE' AND active = true`);
  console.log('Active ACCESS_DISCLOSURE policy version(s):', policyDocs);

  // 2. Ensure CatalogVersion exists
  let catalogVersion = await prisma.catalogVersion.findFirst();
  if (!catalogVersion) {
    catalogVersion = await prisma.catalogVersion.create({
      data: {
        id: crypto.randomUUID(),
        version_label: 'v1.0',
        status: 'ACTIVE',
      }
    });
  }

  // 3. Ensure a Product exists
  let product = await prisma.product.findFirst({ where: { sku: 'SKU-ENTERPRISE-01' } });
  if (!product) {
    product = await prisma.product.create({
      data: {
        id: crypto.randomUUID(),
        catalog_version_id: catalogVersion.id,
        sku: 'SKU-ENTERPRISE-01',
        display_name: 'ZoikoShield Enterprise Edition',
        offer_family: 'ENTERPRISE_SUITE',
        metric_family: 'USER_LICENSES',
      }
    });
    console.log('Created test Product:', product.id);
  } else {
    console.log('Existing Product:', product.id);
  }

  // 4. Ensure CommercialAccount exists
  let account = await prisma.commercialAccount.findFirst();
  if (!account) {
    account = await prisma.commercialAccount.create({
      data: {
        id: crypto.randomUUID(),
        name: 'Demo Account',
        status: 'ACTIVE',
      }
    });
  }

  // 5. Ensure CommercialQuote exists
  let quote = await prisma.commercialQuote.findFirst();
  if (!quote) {
    quote = await prisma.commercialQuote.create({
      data: {
        id: crypto.randomUUID(),
        commercial_account_id: account.id,
        catalog_version_id: catalogVersion.id,
        requested_by: 'system',
        status: 'APPROVED',
      }
    });
  }

  // 6. Create a provisioned CommercialOrder
  const orderId = crypto.randomUUID();
  const order = await prisma.commercialOrder.create({
    data: {
      id: orderId,
      quote_id: quote.id,
      commercial_account_id: account.id,
      idempotency_key: crypto.randomUUID(),
      created_by: 'system',
      status: 'PROVISIONED',
      lines: {
        create: [
          {
            id: crypto.randomUUID(),
            product_id: product.id,
            quantity: 1,
            unit_price: 1000,
          }
        ]
      }
    }
  });

  console.log('\n========================================');
  console.log('✅ Created Provisioned Commercial Order:');
  console.log('orderId:', order.id);
  console.log('Active accessDisclosureVersion:', policyDocs[0]?.version || '1');
  console.log('========================================\n');

  await prisma.$disconnect();
  await dataSource.destroy();
}

main().catch(console.error);
