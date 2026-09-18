import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  LoadingState,
  PartialState,
  StaleState,
  DegradedState,
  UnauthorizedState,
  UnavailableState,
  RecoveryState,
} from '@/components/states/mandatory-ui-states';

describe('ZoikoShield Mandatory 7-State UI Components (§Experience Contract)', () => {
  describe('1. LoadingState', () => {
    it('renders default loading state with ARIA attributes and regional cell indicator', () => {
      render(<LoadingState regionalCell="us-east-1" />);
      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveAttribute('aria-live', 'polite');
      expect(statusElement).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Loading Sovereign Telemetry...')).toBeInTheDocument();
      expect(screen.getByText(/us-east-1/)).toBeInTheDocument();
    });

    it('renders custom title and message', () => {
      render(
        <LoadingState
          title="Custom Connecting Title"
          message="Custom loading telemetry message"
        />
      );
      expect(screen.getByText('Custom Connecting Title')).toBeInTheDocument();
      expect(screen.getByText('Custom loading telemetry message')).toBeInTheDocument();
    });
  });

  describe('2. PartialState', () => {
    it('renders connector synchronization count and status', () => {
      render(
        <PartialState
          connectorsActive={4}
          connectorsTotal={6}
          title="Partial Ingestion Stream"
        />
      );
      expect(screen.getByText('Partial Ingestion Stream')).toBeInTheDocument();
      expect(screen.getByText(/4\/6 P0 Connectors/)).toBeInTheDocument();
    });

    it('triggers retryAction when sync feeds button is clicked', () => {
      const handleRetry = vi.fn();
      render(<PartialState retryAction={handleRetry} />);
      const button = screen.getByRole('button', { name: /sync feeds/i });
      fireEvent.click(button);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. StaleState', () => {
    it('renders cached view timestamp indicator', () => {
      render(<StaleState timestamp="2026-09-18T10:00:00.000Z" />);
      expect(screen.getByText(/Cached View/)).toBeInTheDocument();
      expect(screen.getByText(/2026-09-18T10:00:00.000Z/)).toBeInTheDocument();
    });

    it('triggers retryAction on refresh button click', () => {
      const handleRetry = vi.fn();
      render(<StaleState retryAction={handleRetry} />);
      const button = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(button);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. DegradedState', () => {
    it('renders deterministic fallback mode and guardrail identifier', () => {
      render(
        <DegradedState
          fallbackReason="LLM_RATE_LIMIT_EXCEEDED"
          message="Running deterministic policy fallback."
        />
      );
      const alertElement = screen.getByRole('alert');
      expect(alertElement).toBeInTheDocument();
      expect(screen.getByText(/Deterministic Fallback Mode/)).toBeInTheDocument();
      expect(screen.getByText(/LLM_RATE_LIMIT_EXCEEDED/)).toBeInTheDocument();
    });
  });

  describe('5. UnauthorizedState', () => {
    it('renders Cedar policy denial reason and step-up auth trigger', () => {
      const handleStepUp = vi.fn();
      render(
        <UnauthorizedState
          cedarPolicyDenialReason="CEDAR_DENY_POLICY_R2_GATED"
          stepupChallengeRequired={true}
          onStepUpAuth={handleStepUp}
        />
      );
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/CEDAR_DENY_POLICY_R2_GATED/)).toBeInTheDocument();
      const authButton = screen.getByRole('button', { name: /hardware security key/i });
      fireEvent.click(authButton);
      expect(handleStepUp).toHaveBeenCalledTimes(1);
    });
  });

  describe('6. UnavailableState', () => {
    it('renders RTO/RPO SLA commitments and standby cell', () => {
      render(
        <UnavailableState
          failoverRegion="us-west-2"
          rtoTargetMinutes={0.5}
          rpoTargetMinutes={0}
        />
      );
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/RTO Target: < 30s/)).toBeInTheDocument();
      expect(screen.getByText(/Zero Data Loss/)).toBeInTheDocument();
      expect(screen.getByText(/us-west-2/)).toBeInTheDocument();
    });

    it('triggers standby status check on button click', () => {
      const handleRetry = vi.fn();
      render(<UnavailableState retryAction={handleRetry} />);
      const button = screen.getByRole('button', { name: /check standby status/i });
      fireEvent.click(button);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('7. RecoveryState', () => {
    it('renders rollback progress percentage, stage, and token', () => {
      render(
        <RecoveryState
          progressPercent={80}
          rollbackStage="Reverting isolation rule"
          rollbackToken="tok-comp-9912"
        />
      );
      expect(screen.getByText('80%')).toBeInTheDocument();
      expect(screen.getByText(/Reverting isolation rule/)).toBeInTheDocument();
      expect(screen.getByText(/tok-comp-9912/)).toBeInTheDocument();
    });
  });
});
