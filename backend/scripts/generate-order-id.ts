import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';

const prisma = new PrismaClient();

async function main() {
  console.log('===============================================================');
  console.log(' ZoikoShield Commercial Billing & Tenant Order Generator');
  console.log(' Standard: ZS-COM-BILL-001 (Two-Plane Commercial Doctrine)');
  console.log('===============================================================\n');

  const customerName = process.argv[2] || 'Acme Cyber Security Corp';
  const offerChoice = (process.argv[3] || 'MANAGED_DEFENSE').toUpperCase(); // MANAGED_DEFENSE | CONTINUOUS_ASSURANCE | BOTH

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ Error: DATABASE_URL environment variable is missing.');
    process.exit(1);
  }

  // 1. Ensure Postgres schemas and Policy Documents exist for TypeORM compatibility
  const pgClient = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });
  await pgClient.connect();
  await pgClient.query('CREATE SCHEMA IF NOT EXISTS "identity"');
  await pgClient.query('CREATE SCHEMA IF NOT EXISTS "authorization"');
  await pgClient.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  const disclosureHash = crypto.createHash('sha256').update('ZoikoShield Access Disclosure v1').digest('hex');
  const termsHash = crypto.createHash('sha256').update('ZoikoShield Terms of Service v1').digest('hex');

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS "identity"."policy_documents" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "kind" VARCHAR NOT NULL,
      "version" VARCHAR NOT NULL,
      "publishedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "contentHash" VARCHAR NOT NULL,
      "active" BOOLEAN NOT NULL DEFAULT true,
      CONSTRAINT "UQ_policy_kind_version" UNIQUE ("kind", "version")
    );
  `);

  await pgClient.query(`
    INSERT INTO "identity"."policy_documents" ("kind", "version", "contentHash", "active", "publishedAt")
    VALUES 
      ('ACCESS_DISCLOSURE', '1', $1, true, now()),
      ('TERMS_OF_SERVICE', '1', $2, true, now())
    ON CONFLICT ("kind", "version") DO UPDATE SET "active" = true, "publishedAt" = now();
  `, [disclosureHash, termsHash]);

  await pgClient.end();
  console.log('✔ Policy Documents verified in identity schema (ACCESS_DISCLOSURE v1, TERMS_OF_SERVICE v1)');

  // 2. Ensure Catalog Version exists (approved per ADR-06 / ZS-COM-BILL-001)
  let catalogVersion = await prisma.catalogVersion.findFirst({
    where: { version_label: '2026.1' },
  });

  if (!catalogVersion) {
    catalogVersion = await prisma.catalogVersion.create({
      data: {
        version_label: '2026.1',
        status: 'APPROVED',
        approved_by: 'commercial-finance-admin',
        approved_at: new Date(),
      },
    });
    console.log(`✔ Created Catalog Version: ${catalogVersion.version_label} (Status: APPROVED)`);
  } else {
    console.log(`✔ Found Catalog Version: ${catalogVersion.version_label} (ID: ${catalogVersion.id})`);
  }

  // 3. Ensure Products exist
  let mdProduct = await prisma.product.findFirst({
    where: { catalog_version_id: catalogVersion.id, sku: 'ZS-MD-BASE' },
  });
  if (!mdProduct) {
    mdProduct = await prisma.product.create({
      data: {
        catalog_version_id: catalogVersion.id,
        sku: 'ZS-MD-BASE',
        internal_product_key: 'managed-defense-base',
        offer_family: 'MANAGED_DEFENSE',
        display_name: 'ZoikoShield Managed Defense (Base)',
        metric_family: 'PROTECTED_RESOURCES',
        region_scope: JSON.stringify(['GLOBAL', 'us-east-1', 'eu-west-1']),
      },
    });
  }

  let caProduct = await prisma.product.findFirst({
    where: { catalog_version_id: catalogVersion.id, sku: 'ZS-CA-BASE' },
  });
  if (!caProduct) {
    caProduct = await prisma.product.create({
      data: {
        catalog_version_id: catalogVersion.id,
        sku: 'ZS-CA-BASE',
        internal_product_key: 'continuous-assurance-base',
        offer_family: 'CONTINUOUS_ASSURANCE',
        display_name: 'ZoikoShield Continuous Assurance (Base)',
        metric_family: 'PROTECTED_RESOURCES',
        region_scope: JSON.stringify(['GLOBAL', 'us-east-1', 'eu-west-1']),
      },
    });
  }

  // 4. Ensure PriceBooks exist
  let mdPriceBook = await prisma.priceBook.findFirst({
    where: { product_id: mdProduct.id, catalog_version_id: catalogVersion.id },
  });
  if (!mdPriceBook) {
    mdPriceBook = await prisma.priceBook.create({
      data: {
        catalog_version_id: catalogVersion.id,
        product_id: mdProduct.id,
        unit_price: 2500.0,
        status: 'APPROVED',
        margin_gate_passed: true,
      },
    });
  }

  let caPriceBook = await prisma.priceBook.findFirst({
    where: { product_id: caProduct.id, catalog_version_id: catalogVersion.id },
  });
  if (!caPriceBook) {
    caPriceBook = await prisma.priceBook.create({
      data: {
        catalog_version_id: catalogVersion.id,
        product_id: caProduct.id,
        unit_price: 1500.0,
        status: 'APPROVED',
        margin_gate_passed: true,
      },
    });
  }

  console.log('✔ Products and Approved Price Books verified (Managed Defense & Continuous Assurance)');

  // 5. Create Commercial Account
  const commercialAccount = await prisma.commercialAccount.create({
    data: {
      name: customerName,
      customer_legal_name: customerName,
      billing_source: 'DIRECT',
      billing_classification: 'COMMERCIAL_DIRECT',
      status: 'ACTIVE',
      region: 'us-east-1',
    },
  });
  console.log(`✔ Created Commercial Account: '${commercialAccount.name}' (ID: ${commercialAccount.id})`);

  // 6. Create Commercial Quote
  const quoteLines = [];
  if (offerChoice === 'MANAGED_DEFENSE' || offerChoice === 'BOTH') {
    quoteLines.push({
      product_id: mdProduct.id,
      price_book_id: mdPriceBook.id,
      quantity: 1,
      unit_price: mdPriceBook.unit_price,
    });
  }
  if (offerChoice === 'CONTINUOUS_ASSURANCE' || offerChoice === 'BOTH') {
    quoteLines.push({
      product_id: caProduct.id,
      price_book_id: caPriceBook.id,
      quantity: 1,
      unit_price: caPriceBook.unit_price,
    });
  }

  const quote = await prisma.commercialQuote.create({
    data: {
      tenant_id: 'platform',
      environment_id: 'default-env',
      quote_key: `order-gen-${Date.now()}`,
      configuration_hash: crypto.createHash('sha256').update(`order-gen-${commercialAccount.id}-${Date.now()}`).digest('hex'),
      commercial_account_id: commercialAccount.id,
      catalog_version_id: catalogVersion.id,
      status: 'APPROVED',
      approved_by: 'commercial-approver-lead',
      approved_at: new Date(),
      requested_by: 'sales-ops@zoiko.com',
      currency: 'USD',
      region: 'us-east-1',
      term_months: 12,
      lines: {
        create: quoteLines,
      },
    },
    include: { lines: true },
  });
  console.log(`✔ Created & Approved Commercial Quote (ID: ${quote.id}, Lines: ${quote.lines.length})`);

  // 7. Create Contract & Commercial Order (Atomic Provisioning)
  const termStart = new Date();
  const termEnd = new Date(termStart);
  termEnd.setFullYear(termEnd.getFullYear() + 1);

  const idempotencyKey = `order-gen-${crypto.randomUUID()}`;

  const order = await prisma.$transaction(async (tx) => {
    const createdOrder = await tx.commercialOrder.create({
      data: {
        quote_id: quote.id,
        commercial_account_id: commercialAccount.id,
        status: 'CREATED',
        idempotency_key: idempotencyKey,
        created_by: 'billing-automation',
        lines: {
          create: quote.lines.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            unit_price: l.unit_price,
          })),
        },
      },
      include: { lines: true },
    });

    const contract = await tx.contract.create({
      data: {
        commercial_account_id: commercialAccount.id,
        catalog_version_id: catalogVersion.id,
        term_start: termStart,
        term_end: termEnd,
        status: 'ACTIVE',
        snapshot_hash: crypto.createHash('sha256').update(JSON.stringify(createdOrder)).digest('hex'),
      },
    });

    await tx.commercialSubscription.create({
      data: {
        order_id: createdOrder.id,
        commercial_account_id: commercialAccount.id,
        contract_id: contract.id,
        status: 'ACTIVE',
        effective_from: termStart,
        effective_to: termEnd,
      },
    });

    const provisionedOrder = await tx.commercialOrder.update({
      where: { id: createdOrder.id },
      data: {
        status: 'PROVISIONED',
        contract_id: contract.id,
      },
      include: { lines: true },
    });

    return provisionedOrder;
  });

  console.log('\n===============================================================');
  console.log(' 🎉 PROVISIONED COMMERCIAL ORDER CREATED SUCCESSFULLY');
  console.log('===============================================================');
  console.log(`📦 Order ID:                ${order.id}`);
  console.log(`🏢 Commercial Account ID:   ${order.commercial_account_id}`);
  console.log(`📜 Contract ID:             ${order.contract_id}`);
  console.log(`📊 Status:                  ${order.status}`);
  console.log(`🛒 Offer Family Purchased:  ${offerChoice}`);
  console.log('===============================================================\n');

  console.log('💡 You can now use this Order ID in the Tenant Onboarding API / UI:\n');
  const samplePayload = {
    orderId: order.id,
    tenantName: `${customerName} Tenant`,
    tenantSlug: `tenant-${Date.now()}`,
    homeRegion: 'us-east-1',
    dataClass: 'CONFIDENTIAL',
    accessDisclosureVersion: '1',
    legalEntity: {
      legalName: `${customerName} Ltd`,
      countryOfRegistration: 'US',
      registeredAddress: '100 Cyber Way, San Francisco, CA',
    },
    environment: {
      name: 'Production-Primary',
      environmentType: 'PRODUCTION',
    },
  };

  console.log('JSON Payload for POST /api/v1/onboarding/tenant:');
  console.log(JSON.stringify(samplePayload, null, 2));
  console.log('\n');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Error executing order generator:', err);
  prisma.$disconnect();
  process.exit(1);
});
