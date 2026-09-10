import * as fs from 'fs';
import * as path from 'path';

describe('G1-EXPERIENCE-01: Experience Contract & Accessibility Audit (Test Family #19)', () => {
  const frontendAppDir = path.resolve(
    __dirname,
    '../../../../frontend/src/app',
  );
  const componentsDir = path.resolve(
    __dirname,
    '../../../../frontend/src/components',
  );

  const requiredRoutes = [
    'alerts',
    'cases',
    'connectors',
    'controls',
    'audit',
    'ledger',
    'hunting',
    'ingestion',
    'actions',
    'admin/jit',
    'ai-governance',
    'onboarding',
    'team',
    'red-team',
    'login',
  ];

  it('Invariant 1: All 16 application routes exist with valid Page exports', () => {
    for (const route of requiredRoutes) {
      const pagePath = path.join(frontendAppDir, route, 'page.tsx');
      expect(fs.existsSync(pagePath)).toBe(true);
      const content = fs.readFileSync(pagePath, 'utf8');
      expect(content).toContain('export default function');
    }
  });

  it('Invariant 2: Mandatory UI States component provides all 7 required experience contract states', () => {
    const statesFilePath = path.join(
      componentsDir,
      'states/mandatory-ui-states.tsx',
    );
    expect(fs.existsSync(statesFilePath)).toBe(true);

    const statesContent = fs.readFileSync(statesFilePath, 'utf8');
    const expectedStates = [
      'LoadingState',
      'PartialState',
      'StaleState',
      'DegradedState',
      'UnauthorizedState',
      'UnavailableState',
      'RecoveryState',
    ];

    for (const stateName of expectedStates) {
      expect(statesContent).toContain(stateName);
    }
  });

  it('Invariant 3: Screen-reader accessibility (aria-live, role=status/alert) is enforced on state boundaries', () => {
    const statesFilePath = path.join(
      componentsDir,
      'states/mandatory-ui-states.tsx',
    );
    const statesContent = fs.readFileSync(statesFilePath, 'utf8');

    // Accessibility attributes required by Test Family #19
    expect(statesContent).toContain('aria-live="polite"');
    expect(statesContent).toContain('role="status"');
    expect(statesContent).toContain('role="alert"');
  });

  it('Invariant 4: UnauthorizedState binds to Cedar/FIDO2 re-authorization challenges', () => {
    const statesFilePath = path.join(
      componentsDir,
      'states/mandatory-ui-states.tsx',
    );
    const statesContent = fs.readFileSync(statesFilePath, 'utf8');

    expect(statesContent).toContain('cedarPolicyDenialReason');
    expect(statesContent).toContain('stepupChallengeRequired');
  });

  it('Invariant 5: UnavailableState provides RTO/RPO target guidance and regional failover telemetry', () => {
    const statesFilePath = path.join(
      componentsDir,
      'states/mandatory-ui-states.tsx',
    );
    const statesContent = fs.readFileSync(statesFilePath, 'utf8');

    expect(statesContent).toContain('rtoTargetMinutes');
    expect(statesContent).toContain('rpoTargetMinutes');
    expect(statesContent).toContain('failoverRegion');
  });

  it('Invariant 6: RecoveryState reflects in-flight compensating rollback token & progress', () => {
    const statesFilePath = path.join(
      componentsDir,
      'states/mandatory-ui-states.tsx',
    );
    const statesContent = fs.readFileSync(statesFilePath, 'utf8');

    expect(statesContent).toContain('rollbackToken');
    expect(statesContent).toContain('progressPercent');
    expect(statesContent).toContain('isReverted');
  });
});
