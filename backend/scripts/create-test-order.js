require('dotenv/config');
const { Client } = require('pg');
const crypto = require('crypto');

async function main() {
  const databaseUrl = process.env.DATABASE_URL || 'postgres://shield:shield@localhost:5433/shield_core';
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // 1. Get active ACCESS_DISCLOSURE policy document version
    const policyRes = await client.query(`
      SELECT version FROM identity.policy_documents 
      WHERE kind = 'ACCESS_DISCLOSURE' AND active = true 
      LIMIT 1
    `);
    const activeVersion = policyRes.rows[0]?.version || '1';
    console.log('Active ACCESS_DISCLOSURE version:', activeVersion);

    // 2. Ensure CatalogVersion exists
    let catalogRes = await client.query(`SELECT id FROM public."CatalogVersion" LIMIT 1`);
    let catalogVersionId = catalogRes.rows[0]?.id;
    if (!catalogVersionId) {
      catalogVersionId = crypto.randomUUID();
      await client.query(`
        INSERT INTO public."CatalogVersion" (id, version_label, status, created_at)
        VALUES ($1, 'v1.0', 'ACTIVE', NOW())
      `, [catalogVersionId]);
    }

    // 3. Ensure Product exists
    let prodRes = await client.query(`SELECT id FROM public."Product" WHERE sku = 'SKU-ENTERPRISE-01' LIMIT 1`);
    let productId = prodRes.rows[0]?.id;
    if (!productId) {
      productId = crypto.randomUUID();
      await client.query(`
        INSERT INTO public."Product" (id, catalog_version_id, sku, offer_family, display_name, metric_family, created_at)
        VALUES ($1, $2, 'SKU-ENTERPRISE-01', 'ENTERPRISE_SUITE', 'ZoikoShield Enterprise', 'USER_LICENSES', NOW())
      `, [productId, catalogVersionId]);
    }

    // 4. Ensure CommercialAccount exists
    let accountRes = await client.query(`SELECT id FROM public."CommercialAccount" LIMIT 1`);
    let accountId = accountRes.rows[0]?.id;
    if (!accountId) {
      accountId = crypto.randomUUID();
      await client.query(`
        INSERT INTO public."CommercialAccount" (id, name, status, created_at, updated_at)
        VALUES ($1, 'Demo Account', 'ACTIVE', NOW(), NOW())
      `, [accountId]);
    }

    // 5. Ensure CommercialQuote exists
    let quoteRes = await client.query(`SELECT id FROM public."CommercialQuote" LIMIT 1`);
    let quoteId = quoteRes.rows[0]?.id;
    if (!quoteId) {
      quoteId = crypto.randomUUID();
      await client.query(`
        INSERT INTO public."CommercialQuote" (id, commercial_account_id, catalog_version_id, status, requested_by, created_at, updated_at)
        VALUES ($1, $2, $3, 'APPROVED', 'system', NOW(), NOW())
      `, [quoteId, accountId, catalogVersionId]);
    }

    // 6. Create PROVISIONED CommercialOrder
    const orderId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    await client.query(`
      INSERT INTO public."CommercialOrder" (id, quote_id, commercial_account_id, status, idempotency_key, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, 'PROVISIONED', $4, 'system', NOW(), NOW())
    `, [orderId, quoteId, accountId, idempotencyKey]);

    // 7. Create CommercialOrderLine
    const lineId = crypto.randomUUID();
    await client.query(`
      INSERT INTO public."CommercialOrderLine" (id, order_id, product_id, quantity, unit_price, created_at)
      VALUES ($1, $2, $3, 1, 1000.00, NOW())
    `, [lineId, orderId, productId]);

    console.log('\n===============================================================');
    console.log('✅ CREATED PROVISIONED COMMERCIAL ORDER SUCCESSFULLY!');
    console.log('===============================================================');
    console.log('orderId:                 ', orderId);
    console.log('accessDisclosureVersion: ', activeVersion);
    console.log('===============================================================\n');

  } finally {
    await client.end();
  }
}

main().catch(console.error);
