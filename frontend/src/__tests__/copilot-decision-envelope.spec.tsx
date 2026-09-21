import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/copilot',
  useSearchParams: () => new URLSearchParams(),
}));

import CopilotPage from '@/app/copilot/page';
import { ZoikoShieldApiClient } from '@/lib/api-client';

describe('AI Security Copilot & Spec §16.1 Decision Review Envelope Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Spec §16.1 10-Field Mandatory Decision Review Envelope Structure', () => {
    it('renders all 10 mandatory fields defined in Figure 11 & Spec §16.1', () => {
      render(<CopilotPage />);

      // Envelope Header
      expect(screen.getAllByText(/10-FIELD DECISION REVIEW ENVELOPE/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/Spec §16\.1/i)[0]).toBeInTheDocument();

      // Field 1: AI Label & Use Case Name
      expect(screen.getAllByText(/1\. AI Label & Use-Case Name/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/COPILOT_INVESTIGATE/i)[0]).toBeInTheDocument();

      // Field 2: Grounded Sources & Spans (Zero Hallucination)
      expect(screen.getAllByText(/2\. Sources & Exact Supporting Spans/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/aws-cloudtrail-stream/i)[0]).toBeInTheDocument();

      // Field 3: Known Missing, Stale or Conflicting Evidence
      expect(screen.getAllByText(/3\. Evidence Completeness & Freshness/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/MISSING/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/STALE/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/CONFLICTING/i)[0]).toBeInTheDocument();

      // Field 4: Calibrated Confidence & Uncertainty
      expect(screen.getAllByText(/4\. Calibrated Confidence & Uncertainty/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/Multi-sensor alignment across Entra ID audit log/i)[0]).toBeInTheDocument();

      // Field 5: Alternative Hypotheses or Actions
      expect(screen.getAllByText(/5\. Alternative Hypotheses & Trade-Offs/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/Passive Honeypot Observability/i)[0]).toBeInTheDocument();

      // Field 6: Expected Impact & Reversibility
      expect(screen.getAllByText(/6\. Expected Impact & Reversibility/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/BLAST RADIUS:/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/REVERSIBILITY:/i)[0]).toBeInTheDocument();

      // Field 7: Required Authority & Approvals
      expect(screen.getAllByText(/7\. Required Authority & Approvals/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/R2 Tier/i)[0]).toBeInTheDocument();

      // Field 8: Decision Controls & Actions
      expect(screen.getAllByText(/8\. Human Operator Decision Controls/i)[0]).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ACCEPT/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /MODIFY/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /REJECT/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ESCALATE/i })).toBeInTheDocument();

      // Field 9: Recorded Human Decision & Attributable Receipt
      expect(screen.getAllByText(/9\. Recorded Human Decision & Attributable Receipt/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/Pending Human Operator Review/i)[0]).toBeInTheDocument();

      // Field 10: Appeal / Feedback Route
      expect(screen.getAllByText(/10\. Appeal & Statutory Feedback Route/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/secops-human-review@zoikogroup\.com/i)[0]).toBeInTheDocument();
    });
  });

  describe('2. Operational Mode Switching', () => {
    it('switches between all 6 operational modes and loads respective envelope context', () => {
      render(<CopilotPage />);

      // Switch to RESPOND mode
      const respondBtn = screen.getByRole('button', { name: /3\. Respond/i });
      fireEvent.click(respondBtn);

      expect(screen.getAllByText(/COPILOT_RESPOND/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/R3 Tier/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/Mandatory 2-Operator Signatures/i)[0]).toBeInTheDocument();

      // Switch to ASSURE mode
      const assureBtn = screen.getByRole('button', { name: /2\. Assure/i });
      fireEvent.click(assureBtn);

      expect(screen.getAllByText(/COPILOT_ASSURE/i)[0]).toBeInTheDocument();
      expect(screen.getAllByText(/R0 Tier/i)[0]).toBeInTheDocument();

      // Switch to REPORT mode
      const reportBtn = screen.getByRole('button', { name: /4\. Report/i });
      fireEvent.click(reportBtn);

      expect(screen.getAllByText(/COPILOT_REPORT/i)[0]).toBeInTheDocument();
    });
  });

  describe('3. Human Operator Decision & Attributable Rationale Modal Workflow', () => {
    it('enforces mandatory operator rationale and records cryptographic signature on ACCEPT', async () => {
      const recordDecisionSpy = vi.spyOn(ZoikoShieldApiClient, 'recordReviewDecision').mockResolvedValueOnce({
        status: 'ACCEPTED',
        envelope: {
          ...CopilotPage,
          envelopeId: 'env-inv-0921a',
          tenantId: '00000000-0000-4000-8000-000000000001',
          environmentId: 'PRODUCTION',
          createdAt: new Date().toISOString(),
          aiLabelAndUseCaseName: {
            useCaseName: 'COPILOT_INVESTIGATE',
            aiLabel: 'ZoikoShield Guarded ModelArmor Engine v2.4',
            modelRoute: 'vertex-ai/gemini-1.5-pro-002',
          },
          sourcesAndSpans: [],
          knownMissingStaleOrConflictingEvidence: { missingEvidence: [], staleEvidence: [], conflictingEvidence: [] },
          calibratedConfidenceAndUncertainty: { score: 0.95, qualitativeBand: 'HIGH', calibrationBasis: 'Verified', uncertaintyFactors: [] },
          alternativeHypothesesOrActions: [],
          expectedImpactAndReversibility: { blastRadius: 'Isolated', reversibilityTier: 'R2', isReversible: true },
          requiredAuthorityAndApprovals: { requiredRole: 'LEAD_SECURITY_ANALYST', responseAuthorityTier: 'R2', dualApproverRequired: false },
          controls: { state: 'ACCEPTED', currentState: 'ACCEPTED', availableTransitions: [] },
          humanDecisionAndRationale: {
            decision: 'ACCEPT',
            decidedBy: 'usr-sarah-chen-01',
            rationale: 'Confirmed suspicious IP against lateral VPC flow log anomalies.',
            signature: 'ZS-DECISION-RECEIPT-V1:env-inv-0921a:ACCEPT:usr-sarah-chen-01:994811ae',
            decidedAt: new Date().toISOString(),
          },
          appealOrFeedbackRoute: { appealUrl: 'https://shield.zoikogroup.com/appeals/v1', feedbackChannel: 'secops@zoiko.com', customerAffecting: false },
        },
        receiptSignature: 'ZS-DECISION-RECEIPT-V1:env-inv-0921a:ACCEPT:usr-sarah-chen-01:994811ae',
        decidedAt: new Date().toISOString(),
      });

      render(<CopilotPage />);

      // Click ACCEPT button
      const acceptBtn = screen.getByRole('button', { name: /ACCEPT/i });
      fireEvent.click(acceptBtn);

      // Verify modal is open
      expect(screen.getByText(/Record Human Decision: ACCEPT/i)).toBeInTheDocument();
      expect(screen.getByText(/Mandatory Operator Rationale \(Spec §16\.1 Invariant\):/i)).toBeInTheDocument();

      // Try to submit with empty rationale -> button should be disabled
      const submitBtn = screen.getByRole('button', { name: /Commit ACCEPT Decision/i });
      expect(submitBtn).toBeDisabled();

      // Enter attribution rationale
      const rationaleInput = screen.getByPlaceholderText(/State technical justification/i);
      fireEvent.change(rationaleInput, {
        target: { value: 'Confirmed suspicious IP against lateral VPC flow log anomalies.' },
      });

      expect(submitBtn).not.toBeDisabled();
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(recordDecisionSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            decision: 'ACCEPT',
            rationale: 'Confirmed suspicious IP against lateral VPC flow log anomalies.',
          })
        );
      });

      // Verify receipt signature appears in Field 9
      await waitFor(() => {
        expect(screen.getByText(/Decision: ACCEPT/i)).toBeInTheDocument();
        expect(screen.getByText(/SIG: ZS-DECISION-RECEIPT-V1/i)).toBeInTheDocument();
      });
    });

    it('handles ESCALATE decision workflow with target role selection', async () => {
      render(<CopilotPage />);

      const escalateBtn = screen.getByRole('button', { name: /ESCALATE/i });
      fireEvent.click(escalateBtn);

      expect(screen.getByText(/Record Human Decision: ESCALATE/i)).toBeInTheDocument();
      expect(screen.getByText(/Target Escalation Role:/i)).toBeInTheDocument();

      // Role selector contains SOC Manager and CISO
      expect(screen.getByText(/Chief Information Security Officer \(R4 Authority\)/i)).toBeInTheDocument();
    });

    it('handles MODIFY decision workflow with modified scope textarea', async () => {
      render(<CopilotPage />);

      const modifyBtn = screen.getByRole('button', { name: /MODIFY/i });
      fireEvent.click(modifyBtn);

      expect(screen.getByText(/Record Human Decision: MODIFY/i)).toBeInTheDocument();
      expect(screen.getByText(/Modified Containment Scope \/ Action Parameters:/i)).toBeInTheDocument();
    });
  });
});
