# ZoikoShield — Payment Integration & Transactional Email Testing Guide

**Document Reference:** `ZS-GUIDE-PAYMENT-EMAIL-2026-10`  
**Security Classification:** Sovereign Commercial Billing & Operations Standard  
**Effective Date:** October 27, 2026  
**Commercial Standard:** Master Commercial Estate v2.0 (ADR-08) · Stripe Checkout API · 226 Notification Engine

---

## 1. Commercial Product & Plan Configuration

ZoikoShield offers four standardized commercial plan tiers alongside custom governed enterprise security packages:

| Plan Tier Key | Display Name | Standard Inclusions & Entitlements | Commercial Pricing Basis |
| :--- | :--- | :--- | :--- |
| `SHIELD_ESSENTIAL` | **Shield Essential** | Continuous SOC 2 & ISO 27001 Controls, Evidence Locker, Basic Incident Retainer | Reference Baseline: $2,000 / mo |
| `SHIELD_PROFESSIONAL` | **Shield Professional** *(Audit Target)* | **Managed Defense (MDR), Continuous Assurance, 4-Eyes Cedar Policies** | **Reference Rate: $4,000 / mo (or $1,250 / mo in governed bundle)** |
| `SHIELD_ADVANCED` | **Shield Advanced** | Full AI Model Armor, Attack Surface Management, Multi-Cloud Connectors | Reference Rate: $8,000 / mo |
| `SHIELD_ENTERPRISE` | **Shield Enterprise** | Dedicated Sovereign HSM Cell, Legal Privilege Retainer Escrow, 24/7 SLA | Custom Enterprise ACV (Governed Quote) |

### Tested Purchase Flow
During this audit, the **Shield Professional Plan** was selected for end-to-end checkout, entitlement provisioning, and receipt email delivery.

---

## 2. Stripe Configuration & Operational Modes

The ZoikoShield payment architecture supports two distinct operational modes:

### Mode 1: Automated Stripe Test-Mode Provider (Default for Automated QA)
- **Status:** **Fully Verified (100% Pass in `stripe-payment.provider.spec.ts` and `auth-registration-and-payment.spec.ts`).**
- **Characteristics:**
  - Emulates verified Stripe checkout sessions, payment intents, and cryptographic webhook signatures.
  - Automatically provisions checkout URLs returning to `/pricing/success?session_id={SESSION_ID}&status=success`.
  - Dispatches transactional emails through the internal 226 template engine without requiring external network access.
  - Safely verifies end-to-end database updates, idempotency deduplication, and commercial contract events.

### Mode 2: Live Stripe Sandbox / Test Mode API Keys
To connect live Stripe test-mode sandbox credentials:
1. Obtain your test keys from the [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys):
   - Secret Key: `sk_test_...`
   - Webhook Signing Secret: `whsec_...`
2. Configure the following environment variables in `backend/.env`:
   ```bash
   STRIPE_SECRET_KEY=sk_test_51...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_ALLOW_TEST_PRICING=true
   APP_BASE_URL=http://localhost:3000
   ```
3. Restart the backend service. `StripePaymentProvider` will automatically log:
   `"StripePaymentProvider initialized with active Stripe secret key."`

---

## 3. End-to-End Payment Workflow & State Machine

Every payment transition is validated server-side in [`payment.service.ts`](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/backend/apps/shield-core/src/modules/payments/payment.service.ts) against the canonical payment state machine:

```
[ PENDING ] ──► [ AUTHORIZED ] ──► [ PROCESSING ] ──► [ SUCCEEDED ] ──► [ SETTLED ]
     │                │                  │
     ▼                ▼                  ▼
 [ FAILED ]       [ FAILED ]         [ FAILED ]
```

### Complete Sequence of Operations
1. **User Selects Plan:** On `/pricing`, the user reviews entitlements and clicks **Subscribe to Shield Professional**.
2. **Backend Session Creation:** The frontend calls `POST /api/v1/payments/checkout-session`.
   - Backend validates the product, currency (`USD`), and tenant ID.
   - Enforces fail-closed pricing invariant C02 (requires `STRIPE_ALLOW_TEST_PRICING=true` or approved quote).
   - Generates a Stripe Checkout session ID (`cs_test_...`).
3. **Checkout Redirection:** The user is redirected to the Stripe-hosted or verified test-mode payment gateway.
4. **Server-Side Webhook Receipt:** When payment completes, Stripe emits `checkout.session.completed` to `POST /api/v1/payments/webhook`.
5. **Cryptographic Signature Verification:** `PaymentService.handleStripeWebhook` validates the raw body against the webhook secret. Forged or unsigned payloads are rejected with HTTP 409 Conflict.
6. **Idempotent Entitlement Provisioning:**
   - Database creates a `commercialEvent` with `event_type: 'subscription.activated'`.
   - The tenant's entitlements are atomically granted (`CONTINUOUS_ASSURANCE`, `MANAGED_DEFENSE`).
   - If the same webhook is re-sent by Stripe, the `IdempotencyService` recognizes the key and returns HTTP 200 without duplicate billing.
7. **Transactional Receipt Emails:** Two emails are dispatched:
   - `ZS-EML-BILL-001` (Subscription Activated Confirmation)
   - `ZS-EML-BILL-006` (Official Tax-Compliant Payment Receipt)

---

## 4. Transactional Email Triggers & Verification

The notification engine includes 226 production email templates managed in `backend/apps/shield-core/src/modules/notification`. Key transactional templates verified in this audit include:

| Trigger Event | Template Identifier | Email Subject & Contents | Delivery Verification Mechanism |
| :--- | :--- | :--- | :--- |
| **New User Registration** | `ZS-EML-IAM-001` | *ZoikoShield Identity Verification Code* — contains time-stamped 6-digit OTP | Challenge verification record created in DB; code required for activation |
| **Workspace Provisioned** | `ZS-EML-ORG-001` | *Welcome to Your ZoikoShield Sovereign Workspace* — contains tenant UUID & cell | Delivery ledger record created with recipient email |
| **Subscription Activated** | `ZS-EML-BILL-001` | *ZoikoShield Subscription Activated: Shield Professional* — confirms entitlements | Dispatched via `handleStripeWebhook` on `checkout.session.completed` |
| **Payment Received** | `ZS-EML-BILL-006` | *Payment Receipt & Tax Invoice* — includes invoice number, amount, and timestamp | Dispatched concurrently with activation email with idempotency stamp |
| **Payment Failed** | `ZS-EML-BILL-007` | *Action Required: ZoikoShield Payment Authorisation Failed* — retry link | Triggered on `payment_intent.payment_failed` |
| **Password Reset** | `ZS-EML-IAM-002` | *ZoikoShield Password Reset Request* — cryptographic reset token | Generated on `POST /api/v1/auth/forgot-password` |

---

## 5. Test Scenarios & Pass/Fail Criteria

### Test Case 1: Valid Checkout Session Creation
- **Action:** Call `POST /api/v1/payments/checkout-session` with `planTier: 'SHIELD_PROFESSIONAL'`.
- **Pass Criteria:** Returns HTTP 200/201 with `sessionId` matching `/^cs_/` and `orderSummary.totalAmount` matching the approved rate.

### Test Case 2: Cryptographic Webhook Tamper Rejection
- **Action:** Send raw webhook payload to `POST /api/v1/payments/webhook` with an invalid or empty `stripe-signature` header.
- **Pass Criteria:** Request is immediately rejected with HTTP 409 Conflict (`INVALID_STRIPE_WEBHOOK_SIGNATURE`). Database records and entitlements remain unchanged.

### Test Case 3: Replayed Webhook Idempotency
- **Action:** Submit identical `checkout.session.completed` payload twice with the same event ID (`evt_stripe_test_99881`).
- **Pass Criteria:** Both requests return HTTP 200, but database entitlement record count is strictly `1`. No duplicate charges or entitlement records created.

### Test Case 4: Delivery Ledger Visibility
- **Action:** Navigate to `/notifications` in the browser.
- **Pass Criteria:** The ledger displays real delivery records or an offline status banner if the backend is down. Never shows fabricated placeholder records.
