import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ZoikoShieldApiClient } from '@/lib/api-client';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock EventSource
global.EventSource = vi.fn().mockImplementation(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
})) as any;

// Import interactive cockpit pages
import G1GatePage from '@/app/admin/g1-gate/page';
import JitElevationPage from '@/app/admin/jit/page';
import PlatformAdminPage from '@/app/admin/page';
import PlatformHealthPage from '@/app/admin/platform-health/page';

describe('Critical-Path User Interaction & API Wire Validation Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. G1 Launch Gate Multi-Signature Submission (/admin/g1-gate)', () => {
    it('renders ratification cards and opens signature modal on click', async () => {
      vi.spyOn(ZoikoShieldApiClient, 'getG1Roster').mockResolvedValue({
        gateStatus: 'PENDING_MULTI_APPROVER_SIGNOFF',
        allApproved: false,
        ratifiedApprovalsCount: 2,
        approvers: [
          { roleId: 'CEO', roleTitle: 'Chief Executive Officer', ratified: false },
          { roleId: 'CTO', roleTitle: 'Chief Technology Officer', ratified: true, signatoryName: 'Dr. John Doe', signatureProof: 'sig-001-proof' },
        ],
      } as any);

      render(<G1GatePage />);

      await waitFor(() => {
        expect(screen.getByText(/G1 Launch Gate & Live Response Authority/i)).toBeInTheDocument();
      });

      const ratifyButtons = await screen.findAllByRole('button', { name: /Ratify Signature/i });
      expect(ratifyButtons.length).toBeGreaterThan(0);

      fireEvent.click(ratifyButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/Ratify G1 Gate Approval/i)).toBeInTheDocument();
      });
    });
  });

  describe('2. JIT Break-Glass Elevation Request (/admin/jit)', () => {
    it('opens elevation modal, accepts justification & duration inputs, and triggers request', async () => {
      vi.spyOn(ZoikoShieldApiClient, 'requestJitElevation').mockResolvedValue({
        requestId: 'jit-req-001',
        requestedRole: 'PLATFORM_SUPER_ADMIN',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        approverPeerAdmin: 'admin.peer@zoiko.internal',
      } as any);

      vi.spyOn(ZoikoShieldApiClient, 'verifyJitStepUp').mockResolvedValue({
        verified: true,
        hardwareProofDigest: 'sha256-hw-proof-digest-12345',
      } as any);

      render(<JitElevationPage />);

      // Find Request JIT Elevation button
      const requestButtons = screen.getAllByRole('button', { name: /Request JIT Elevation/i });
      expect(requestButtons.length).toBeGreaterThan(0);

      // Click to open modal
      fireEvent.click(requestButtons[0]);

      // Verify modal elements are visible
      await waitFor(() => {
        expect(screen.getByText(/Request Just-In-Time Role Elevation/i)).toBeInTheDocument();
        expect(screen.getByText(/Elevation Justification/i)).toBeInTheDocument();
      });

      // Find submit button inside modal
      const grantBtn = screen.getByRole('button', { name: /Grant JIT Elevation/i });
      expect(grantBtn).toBeInTheDocument();

      // Submit request
      fireEvent.click(grantBtn);

      await waitFor(() => {
        // Modal closes
        expect(screen.queryByText(/Elevation Justification \(Audited\):/i)).toBeNull();
      });
    });
  });

  describe('3. Autonomous SOAR Emergency Freeze Control (/admin)', () => {
    it('opens break-glass modal and executes emergency freeze on SOAR playbooks', async () => {
      render(<PlatformAdminPage />);

      // Find Freeze Containment button
      const freezeBtn = screen.getByRole('button', { name: /Freeze Containment/i });
      expect(freezeBtn).toBeInTheDocument();

      // Click to open break glass modal
      fireEvent.click(freezeBtn);

      // Assert modal appears
      await waitFor(() => {
        expect(screen.getByText(/Execute Break-Glass Circuit Breaker/i)).toBeInTheDocument();
        expect(screen.getByText(/Break-Glass Target: SOAR_FREEZE/i)).toBeInTheDocument();
      });

      // Confirm emergency execution
      const confirmBtn = screen.getByRole('button', { name: /Confirm & Execute/i });
      expect(confirmBtn).toBeInTheDocument();
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByText(/Autonomous SOAR Containment Playbooks FROZEN/i)).toBeInTheDocument();
      });
    });
  });

  describe('4. Non-Destructive Restore Drill Execution (/admin/platform-health)', () => {
    it('triggers on-demand restore drill and verifies verified drill receipt', async () => {
      vi.spyOn(ZoikoShieldApiClient, 'getPlatformReadiness').mockResolvedValue({
        snapshotId: 'snap-interaction-01',
        evaluatedAt: new Date().toISOString(),
        overallState: 'HEALTHY',
        overallScore: 1.0,
        totalServicesCount: 6,
        healthyServicesCount: 6,
        conditionalServicesCount: 0,
        degradedServicesCount: 0,
        g1GateRatified: true,
        activeBlockersCount: 0,
        services: {
          'shield-core': {
            serviceId: 'shield-core',
            serviceName: 'shield-core',
            displayName: 'Core Orchestration Engine',
            description: 'Tenant isolation and RBAC.',
            version: '1.0.0',
            state: 'HEALTHY',
            stateMeaning: 'Operating normally',
            readinessScore: 1.0,
            lastAssessedAt: new Date().toISOString(),
            dependencies: [],
            signals: [],
            blockers: [],
          },
        },
      } as any);

      vi.spyOn(ZoikoShieldApiClient, 'getDisasterRecoveryBackupStatus').mockResolvedValue({
        assessedAt: new Date().toISOString(),
        overallBackupHealth: 'HEALTHY',
        overallRpoCompliant: true,
        overallRestoreVerified: true,
        activeStoresCount: 4,
        healthyStoresCount: 4,
        staleBackupsCount: 0,
        unverifiedRestoresCount: 0,
        rtoTargetHours: 4.0,
        stores: {
          shield_core_db: {
            storeId: 'shield_core_db',
            displayName: 'ZoikoShield Primary Relational State (PostgreSQL)',
            storeType: 'RELATIONAL_POSTGRES',
            lastBackupCompletedAt: new Date().toISOString(),
            backupAgeHours: 4.0,
            backupSizeBytes: 52428800,
            rpoTargetMinutes: 15,
            rpoStatus: 'COMPLIANT',
            encryptionAlgorithm: 'KMS_ENVELOPE_AES256',
            encryptionVerified: true,
            immutabilityLocked: true,
            retentionDays: 90,
            manifestChecksumSha256: '9a5c88b43f9a78de9b3c4a2345e67f890123456789abcdef0123456789abcdef',
            lastRestoreDrillAt: new Date().toISOString(),
            lastRestoreDrillStatus: 'VERIFIED',
            restoreDrillAgeDays: 2.0,
          },
        },
      } as any);

      vi.spyOn(ZoikoShieldApiClient, 'getSyntheticObservabilityStatus').mockResolvedValue({
        canaryPosture: {
          canaryTenantId: 'tenant-zoiko-canary-01',
          overallHealth: 'HEALTHY',
          successRate: 1.0,
          averageLatencyMs: 142,
          lastProbeTimestamp: new Date().toISOString(),
        },
        gameDayPosture: {
          lastExerciseDate: new Date().toISOString(),
          daysSinceLastExercise: 20,
          totalExercisesCompleted: 7,
          overallResilienceScore: 1.0,
          isGameDayScheduleCompliant: true,
          scenariosExercised: [],
        },
        recentProbes: [],
        recentExercises: [],
        timestamp: new Date().toISOString(),
      } as any);

      vi.spyOn(ZoikoShieldApiClient, 'getPhase0Status').mockResolvedValue({
        postureSummary: {
          lastEvaluatedAt: new Date().toISOString(),
          overallStatus: 'PASSED',
          isExitGateSatisfied: true,
          totalRunsCompleted: 14,
          latestProofId: 'phase0-proof-test-01',
          merkleRootHead: 'f4a8c9e0123456789abcdef0123456789abcdef0123456789abcdef012345678',
          offlineVerificationReady: true,
        },
        latestProof: {
          proofId: 'phase0-proof-test-01',
          phaseVersion: 'Phase-0-ERB-01',
          documentTitle: 'ZoikoShield Phase-0 Exit Gate & Reference Proof Dossier',
          evaluatedAt: new Date().toISOString(),
          overallStatus: 'PASSED',
          cellId: 'cell-eu-west-1a',
          targetTenantId: 'tenant-zoiko-canary-01',
          totalDurationMs: 42,
          stepsCompleted: 8,
          totalSteps: 8,
          criteriaSatisfied: 6,
          totalCriteria: 6,
          merkleRootHead: 'f4a8c9e0123456789abcdef0123456789abcdef0123456789abcdef012345678',
          auditPackageChecksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          offlineVerificationCommand: 'npx zoikoshield-verifier verify ./audit-pkg-phase0-canary-01',
          releaseGateRatification: {
            eligibleForG1Gate: true,
            attestedByRole: 'LEAD_SYSTEM_ARCHITECT',
          },
          steps: [],
        },
      } as any);

      vi.spyOn(ZoikoShieldApiClient, 'runRestoreDrill').mockResolvedValueOnce({
        drillId: 'drill-interaction-verified-01',
        storeId: 'shield_core_db',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 38,
        durationSeconds: 0.038,
        rtoTargetSeconds: 14400,
        rtoCompliant: true,
        status: 'VERIFIED',
        scratchSchemaName: 'scratch_restore_interaction_01',
        scratchSchemaTornDown: true,
        totalTablesReconciled: 6,
        totalRowsReconciled: 1326,
        sourceMerkleHead: 'a1b2c3d4e5f67890123456789abcdef0',
        restoredMerkleHead: 'a1b2c3d4e5f67890123456789abcdef0',
        merkleHeadAligned: true,
        tableReconciliations: [],
        discrepancies: [],
        receiptSignatureSha256: 'f5d1e2c3b4a59687',
      });

      render(<PlatformHealthPage />);

      await waitFor(() => {
        expect(screen.getByText(/Execute Restore Drill/i)).toBeInTheDocument();
      });

      const drillBtn = screen.getByText(/Execute Restore Drill/i);
      fireEvent.click(drillBtn);

      await waitFor(() => {
        expect(screen.getByText(/RESTORE DRILL VERIFIED/i)).toBeInTheDocument();
        expect(screen.getByText(/drill-interaction-verified-01/i)).toBeInTheDocument();
      });
    });
  });
});
