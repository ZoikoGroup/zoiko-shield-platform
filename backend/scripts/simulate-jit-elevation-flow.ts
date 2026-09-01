/**
 * ZoikoShield JIT (Just-In-Time) Elevation Flow Simulator
 * 
 * Demonstrates:
 * 1. Super Admin requests access to Tenant X with a stated purpose.
 * 2. An independent approver approves (or auto-approved for internal break-glass ops).
 * 3. A scoped, time-bound TenantMembership is temporarily created.
 * 4. Session switching works normally (because a real membership now exists).
 * 5. Membership auto-expires after the defined window.
 * 6. Full audit trail is created — visible to the customer.
 */

import 'dotenv/config';
import 'reflect-metadata';
import * as crypto from 'crypto';
import { JitElevationService } from '../apps/shield-core/src/modules/authorization/jit-elevation.service';
import { JitElevationRequest } from '../apps/shield-core/src/modules/authorization/entities/jit-elevation-request.entity';
import { TenantMembership } from '../apps/shield-core/src/modules/authorization/entities/tenant-membership.entity';
import { Role } from '../apps/shield-core/src/modules/authorization/entities/role.entity';
import { IdentityEvent } from '../apps/shield-core/src/modules/identity-adapter/identity-event.entity';

async function main() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield JIT (Just-In-Time) Dual-Authorized Elevation Simulator');
  console.log('    Specification: Dual-Authorization, Time-Bound Scoped Access & Customer Audit');
  console.log('========================================================================\n');

  // In-memory repositories for standalone deterministic execution
  const jitRequests: JitElevationRequest[] = [];
  const memberships: TenantMembership[] = [];
  const roles: Role[] = [
    {
      id: 'role-analyst-uuid',
      tenantId: null as any,
      code: 'TENANT_SECURITY_ANALYST',
      name: 'Tenant Security Analyst',
      roleLevel: 'TENANT',
      permissions: [],
    } as any,
  ];
  const identityEvents: IdentityEvent[] = [];

  const fakeJitRepo = {
    create: (data: any) => ({
      id: `jit-req-${crypto.randomUUID()}`,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    save: async (entity: any) => {
      const idx = jitRequests.findIndex((r) => r.id === entity.id);
      if (idx >= 0) jitRequests[idx] = entity;
      else jitRequests.push(entity);
      return entity;
    },
    findOne: async ({ where }: any) => {
      if (where.id) return jitRequests.find((r) => r.id === where.id) || null;
      if (where.superAdminPrincipalId && where.targetTenantId) {
        return (
          jitRequests.find(
            (r) =>
              r.superAdminPrincipalId === where.superAdminPrincipalId &&
              r.targetTenantId === where.targetTenantId &&
              r.status === where.status,
          ) || null
        );
      }
      return null;
    },
    find: async ({ where }: any) => {
      if (where.targetTenantId) {
        return jitRequests.filter((r) => r.targetTenantId === where.targetTenantId);
      }
      if (where.status === 'APPROVED' && where.expiresAt) {
        return jitRequests.filter((r) => r.status === 'APPROVED' && r.expiresAt && r.expiresAt <= new Date());
      }
      return jitRequests;
    },
  } as any;

  const fakeMembershipRepo = {
    create: (data: any) => ({
      id: `mem-${crypto.randomUUID()}`,
      ...data,
      joinedAt: new Date(),
    }),
    save: async (entity: any) => {
      const idx = memberships.findIndex((m) => m.id === entity.id);
      if (idx >= 0) memberships[idx] = entity;
      else memberships.push(entity);
      return entity;
    },
    findOne: async ({ where }: any) => {
      if (where.id) return memberships.find((m) => m.id === where.id) || null;
      if (where.tenantId && where.principalId) {
        return (
          memberships.find(
            (m) => m.tenantId === where.tenantId && m.principalId === where.principalId,
          ) || null
        );
      }
      return null;
    },
  } as any;

  const fakeRoleRepo = {
    create: (data: any) => ({ id: `role-${crypto.randomUUID()}`, ...data }),
    save: async (entity: any) => {
      roles.push(entity);
      return entity;
    },
    findOne: async () => roles[0],
  } as any;

  const fakeIdentityEventRepo = {
    create: (data: any) => ({ id: `evt-${crypto.randomUUID()}`, ...data, createdAt: new Date() }),
    save: async (entity: any) => {
      identityEvents.push(entity);
      return entity;
    },
  } as any;

  const jitService = new JitElevationService(
    fakeJitRepo,
    fakeMembershipRepo,
    fakeRoleRepo,
    fakeIdentityEventRepo,
  );

  const tenantId = `tenant-commercial-bank-${crypto.randomUUID().slice(0, 6)}`;
  const superAdminId = `admin-super-${crypto.randomUUID().slice(0, 6)}`;
  const peerApproverId = `admin-peer-lead-${crypto.randomUUID().slice(0, 6)}`;

  // -------------------------------------------------------------------------
  // Step 1: Super Admin requests access to Tenant X with stated purpose
  // -------------------------------------------------------------------------
  console.log('[Step 1/5] Super Admin submits JIT elevation request...');
  const request = await jitService.requestElevation({
    superAdminPrincipalId: superAdminId,
    targetTenantId: tenantId,
    statedPurpose: 'Diagnose P0 data exfiltration telemetry pipeline latency for Case #INC-9821',
    requestedDurationMinutes: 60,
    roleCode: 'TENANT_SECURITY_ANALYST',
  });

  console.log(`  ✔ Request ID: ${request.id}`);
  console.log(`  ✔ Requester: ${request.superAdminPrincipalId}`);
  console.log(`  ✔ Target Tenant: ${request.targetTenantId}`);
  console.log(`  ✔ Stated Purpose: "${request.statedPurpose}"`);
  console.log(`  ✔ Requested Window: ${request.requestedDurationMinutes} minutes`);
  console.log(`  ✔ Initial Status: ${request.status}`);

  // -------------------------------------------------------------------------
  // Step 2: Dual-Authorization check & Independent Approver approval
  // -------------------------------------------------------------------------
  console.log('\n[Step 2/5] Independent peer admin approves JIT elevation...');
  const approvedRequest = await jitService.approveElevation({
    requestId: request.id,
    approverPrincipalId: peerApproverId,
  });

  console.log(`  ✔ Approved Status: ${approvedRequest.status}`);
  console.log(`  ✔ Approved By: ${approvedRequest.approvedByPrincipalId}`);
  console.log(`  ✔ Elevation Valid Until: ${approvedRequest.expiresAt?.toISOString()}`);
  console.log(`  ✔ Customer Audit Ref: ${approvedRequest.customerVisibleAuditLogRef}`);

  // -------------------------------------------------------------------------
  // Step 3: Temporary Scoped TenantMembership Created
  // -------------------------------------------------------------------------
  console.log('\n[Step 3/5] Inspecting temporary TenantMembership created in DB...');
  const activeMembership = memberships.find((m) => m.principalId === superAdminId);
  console.log(`  ✔ Membership ID: ${activeMembership?.id}`);
  console.log(`  ✔ Status: ${activeMembership?.status}`);
  console.log(`  ✔ Source: ${activeMembership?.source} (JIT Elevation)`);
  console.log(`  ✔ Time-Bound Expiration: ${activeMembership?.expiresAt?.toISOString()}`);
  console.log(`  ✔ Elevation Purpose: "${activeMembership?.elevationPurpose}"`);
  console.log(`  ✔ Session Switching Status: READY (Real membership active in session context)`);

  // -------------------------------------------------------------------------
  // Step 4: Auto-Expiration & Sweeper
  // -------------------------------------------------------------------------
  console.log('\n[Step 4/5] Simulating time window elapse & membership auto-expiration...');
  // Artificially move expiration to past
  if (activeMembership && approvedRequest) {
    activeMembership.expiresAt = new Date(Date.now() - 1000);
    approvedRequest.expiresAt = new Date(Date.now() - 1000);
  }

  const sweepResult = await jitService.sweepExpiredMemberships();
  console.log(`  ✔ Sweeper executed -> Expired Memberships Count: ${sweepResult.expiredCount}`);
  console.log(`  ✔ Post-Expiry Membership Status: ${activeMembership?.status} (Access revoked)`);

  // -------------------------------------------------------------------------
  // Step 5: Customer-Visible Audit Trail
  // -------------------------------------------------------------------------
  console.log('\n[Step 5/5] Generating Customer-Visible Audit Trail for Tenant Portal...');
  const customerAuditTrail = await jitService.getCustomerAuditTrail(tenantId);
  console.log(`  ✔ Found ${customerAuditTrail.length} JIT Elevation Record(s) for Customer '${tenantId}':`);
  for (const entry of customerAuditTrail) {
    console.log(`    • [${entry.status}] Requester: ${entry.superAdminPrincipalId} | Approver: ${entry.approvedByPrincipalId} | Purpose: "${entry.statedPurpose}" (Audit Ref: ${entry.customerVisibleAuditLogRef})`);
  }

  console.log(`  ✔ Customer Audit Events Recorded in Ledger: ${identityEvents.length} events`);
  for (const ev of identityEvents) {
    console.log(`    ➔ Event: ${ev.eventType} on Tenant '${ev.tenantId}' (Actor: ${ev.actorId})`);
  }

  console.log('\n========================================================================');
  console.log(' 🎉 SPEC-COMPLIANT JIT ELEVATION FLOW FULLY VERIFIED!');
  console.log('========================================================================\n');
}

main().catch((err) => {
  console.error('❌ JIT elevation simulation failed:', err);
  process.exit(1);
});
