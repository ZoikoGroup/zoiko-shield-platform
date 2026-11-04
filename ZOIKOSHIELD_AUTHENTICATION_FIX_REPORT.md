# ZoikoShield Platform — Authentication, Registration & Session Resolution Fix Report

**Date:** October 26, 2026  
**Auditor / Engineering Lead:** AI Platform Engineering Team  
**Scope:** Identity Adapter, WebAuthn/Passkey Services, Session Context Engine, Cedar Policy Step-Up Boundaries, and Next.js Auth Handlers.

---

## 1. Executive Summary

Authentication and identity management represent the foundation of ZoikoShield's zero-trust assurance. Prior to this remediation, multiple architectural gaps caused critical issues during onboarding and authentication:

1. **Duplicate Registration Anomalies:** Re-registering with an existing email resulted in unhandled database exceptions (`P2002`) or silent creation of orphan tenants without informing the user.
2. **The "Step-Up Required" Modal Loop:** Users who registered but had not verified their email received an HTTP 403 response. The frontend mistakenly categorized all HTTP 403 responses as AWS Cedar Authorization Denials, presenting users with an inescapable "Step-Up Required" passkey prompt that failed with "Unknown passkey".
3. **Strict Tenant & Environment Friction:** Logging in required manually inputting an obscure UUID tenant identifier, and failed with `400 Bad Request` if the tenant lacked a configured environment.
4. **Proxy Masking:** The Next.js API proxy (`/api/v1/[...slug]/route.ts`) was intercepting 4xx client errors and replacing real error details with fabricated fallback payloads.

All underlying issues have been remedied, and verified against the live backend and database.

---

## 2. Root Cause Analysis & Deep-Dive Fixes

### 2.1 Duplicate Registration & Email Normalization

#### The Problem:
In `backend/apps/shield-core/src/modules/identity-adapter/auth.service.ts`, `register()` proceeded through tenant creation before attempting to create the `Principal` record. If the email was already registered, Prisma threw error `P2002 (Unique constraint failed on the fields: (email))`. Because this was an unhandled 500 in NestJS, the Next.js API proxy served mock registration data, leaving the user with a broken local state and creating an orphan tenant in the database.

#### The Solution:
1. **Case-Insensitive Normalization:**
   ```typescript
   const adminEmail = dto.adminEmail.trim().toLowerCase();
   ```
2. **Pre-Flight Existence Check:**
   ```typescript
   const existingPrincipal = await this.principalService.findByEmail(adminEmail);
   if (existingPrincipal) {
     throw new ConflictException(
       'An account with this email address already exists. Please sign in or use Forgot Password.',
     );
   }
   ```
3. **Prisma P2002 Exception Catching:**
   ```typescript
   try {
     // ... transactional tenant & principal creation ...
   } catch (error: any) {
     if (error?.code === 'P2002') {
       throw new ConflictException(
         'An account with this email address already exists. Please sign in or use Forgot Password.',
       );
     }
     throw error;
   }
   ```
4. **Default Environment Creation:** Automatically creates a production environment (`production`, `PRODUCTION`, `us-east-1`, `ACTIVE`) upon registration so subsequent logins never fail due to missing environment bindings.
5. **Enhanced Frontend Feedback:** `frontend/src/app/register/page.tsx` now captures HTTP 409 responses and renders a high-visibility banner offering "Sign In Now" and "Forgot Password?" buttons directly.

---

### 2.2 Unverified Accounts vs. Cedar Step-Up Policy Loop

#### The Problem:
When an unverified account attempted to sign in, `auth.service.ts` threw `ForbiddenException('Email not verified')`. The frontend `frontend/src/app/login/page.tsx` had an overzealous catch block:
```typescript
// BEFORE:
if (err.status === 403 || err.message?.includes('Forbidden')) {
  setIsUnauthorized(true); // Triggered Step-Up Passkey Modal!
}
```
Because the unverified user had no registered FIDO2 passkey credentials, clicking "Authenticate with Passkey" triggered a WebAuthn ceremony that failed with `Unknown passkey` or `No credential found`. The user was trapped in a modal loop with no way to proceed or resend verification.

#### The Solution:
1. **Frontend Error Branching:**
   ```typescript
   const msg = err.message || "Authentication failed";
   setError(msg);

   const isUnverified = msg.toLowerCase().includes("not verified");
   const isCedarStepUp = !isUnverified && (
     msg.includes("CEDAR_POLICY_DENY") ||
     msg.includes("Authentication Step-Up Required") ||
     msg.includes("Authentication step-up required")
   );

   if (isCedarStepUp) {
     setIsUnauthorized(true);
   }
   ```
2. **Inline Resend Verification Mechanism:**
   When `isUnverified` is detected, the login screen displays a prominent message with a one-click **"Resend Verification Email"** action:
   ```typescript
   const handleResendVerification = async () => {
     const res = await ZoikoShieldApiClient.resendVerificationEmail(targetEmail);
     setResendStatus(res.message || "Verification email sent. Please check your inbox.");
   };
   ```
3. **Resend Endpoint Added to API Client:** `ZoikoShieldApiClient.resendVerificationEmail` and `ZoikoShieldApiClient.verifyEmail` implemented in `frontend/src/lib/api-client.ts`.

---

### 2.3 Frictionless Tenant & Environment Session Resolution

#### The Problem:
`LoginDto` marked `tenantId` as mandatory. If omitted, the backend rejected the request with `400 Bad Request: tenantId must be a string`. Furthermore, if a tenant lacked an environment, `SessionContextService.resolveOnlyEnvironment()` rejected the session with `400 Bad Request: An active environment belonging to the tenant is required`.

#### The Solution:
1. **Optional Tenant in DTO:**
   ```typescript
   export class LoginDto {
     @IsEmail()
     email: string;

     @IsString()
     password: string;

     @IsOptional()
     @IsString()
     tenantId?: string;

     @IsOptional()
     @IsString()
     environmentId?: string;
   }
   ```
2. **Auto-Resolution in `SessionContextService.resolveBinding()`:**
   - If `dto.tenantId` is omitted, queries active memberships for `principalId`.
   - If the user has a single active membership, that tenant is automatically selected.
   - If `dto.tenantId` is passed as a slug (e.g. `acme-corp`), it is dynamically resolved to its canonical UUID.
3. **Auto-Provisioning in `SessionContextService.resolveOnlyEnvironment()`:**
   - If an existing tenant has 0 environments, the service automatically provisions a default `production` environment on the fly, logs an audit notice, and binds the session successfully without raising a 400.

---

### 2.4 WebAuthn Multi-Origin Support & Cookie Synchronization

1. **Multi-Origin RP Matching:** In `backend/apps/shield-core/src/modules/identity-adapter/webauthn.service.ts`, allowed origins now accommodate local development (`http://localhost:3000`, `http://127.0.0.1:3000`) and production origins (`https://zoikoshield.io`, `https://app.zoikoshield.io`).
2. **Cookie Synchronization:** In `AuthController.login` and `loginWithPasskey`, both HTTP-only and client-readable cookies are issued alongside the JSON body payload:
   - `access_token` (HTTP-only)
   - `refresh_token` (HTTP-only)
   - `zoiko_shield_access_token` (Lax, client-readable)
   - `zoiko_shield_tenant_id`
   - `zoiko_shield_user_email`
   - `zoiko_auth=true`

---

## 3. Verification Test Evidence

### Test Suite 1: Duplicate Registration & Proxy Passthrough
Executed via `backend/scripts/test-duplicate-registration.ts`:

```text
[TEST 1] Registering with existing email (owner@acme.com)...
Status: HTTP 409 Conflict
Response: {
  "message": "An account with this email address already exists. Please sign in or use Forgot Password.",
  "error": "Conflict",
  "statusCode": 409
}
✔ PASS: Expected HTTP 409 Conflict returned!

[TEST 2] Registering with uppercase existing email (OWNER@ACME.COM)...
Status: HTTP 409 Conflict
✔ PASS: Email normalization triggered 409 Conflict!

[TEST 3] Frontend Proxy duplicate registration passthrough...
Status: HTTP 409 Conflict
✔ PASS: Next.js frontend proxy forwarded HTTP 409 without fallback!
```

### Test Suite 2: Unverified Login, Resend & Auto-Resolved Session
Executed via `backend/scripts/verify-full-e2e-flows.ts`:

```text
[FLOW 1] Testing login with unverified account (testadmin282@gmail.com)...
Status: HTTP 403
Response: {
  "message": "Email not verified",
  "error": "Forbidden",
  "statusCode": 403
}
✔ PASS: Returned HTTP 403 with exact "Email not verified" message.

[FLOW 2] Testing resend-verification for unverified account...
Status: HTTP 201
Response: {
  "message": "If an unverified account exists, a verification email has been sent."
}
✔ PASS: Resend verification dispatched successfully.

[FLOW 3] Testing verified login with optional tenant auto-resolution (owner@acme.com)...
Status: HTTP 201
User: owner@acme.com Role: TENANT_OWNER
Resolved Tenant ID: 00000000-0000-4000-8000-000000000001
Access Token issued: true
✔ PASS: Successfully logged in without entering tenantId; tenant auto-resolved!
```

---

## 4. Summary of Modified Files

- [backend/apps/shield-core/src/modules/identity-adapter/auth.service.ts](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/backend/apps/shield-core/src/modules/identity-adapter/auth.service.ts) — Normalization, conflict prevention, production environment creation.
- [backend/apps/shield-core/src/modules/identity-adapter/auth.controller.ts](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/backend/apps/shield-core/src/modules/identity-adapter/auth.controller.ts) — Cookie synchronization, full token payload return.
- [backend/apps/shield-core/src/modules/identity-adapter/dto/login.dto.ts](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/backend/apps/shield-core/src/modules/identity-adapter/dto/login.dto.ts) — Made `tenantId` optional.
- [backend/apps/shield-core/src/modules/identity-adapter/session-context.service.ts](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/backend/apps/shield-core/src/modules/identity-adapter/session-context.service.ts) — Auto-resolve tenant binding, auto-provision environment.
- [backend/apps/shield-core/src/modules/identity-adapter/webauthn.service.ts](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/backend/apps/shield-core/src/modules/identity-adapter/webauthn.service.ts) — Multi-origin RP binding.
- [frontend/src/app/api/v1/[...slug]/route.ts](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/api/v1/[...slug]/route.ts) — Proxy passthrough for 4xx errors, timeout extensions.
- [frontend/src/app/register/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/register/page.tsx) — Conflict UI error banner with sign-in guidance.
- [frontend/src/app/login/page.tsx](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/app/login/page.tsx) — Decoupled unverified email from Cedar step-up modal, inline resend button.
- [frontend/src/lib/api-client.ts](file:///c:/Users/aparaziitha%20nitta/zoiko-shield-platform/frontend/src/lib/api-client.ts) — Added `resendVerificationEmail` and `verifyEmail`.
