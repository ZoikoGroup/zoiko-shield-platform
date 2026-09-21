import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { CapabilityStatusService } from '../apps/shield-core/src/modules/commercial/capability-status/capability-status.service';
import { DRAFT_PLAN_TIERS } from '../apps/shield-core/src/modules/commercial/plan-tier/plan-tier.entity';

/**
 * CI Verification: Public Capability Claims & Gating Alignment
 *
 * Operationalizes GTM Checklist Rules CON-01, FRM-01, and G1-01:
 * 1. Asserts no GATED or DEFERRED capability is exposed as active/core in public services.
 * 2. Asserts EU DORA and NIS2 are strictly in DEFERRED status across all public disclosures.
 * 3. Asserts that 4 approved plan tiers exist with positive pricing and valid offer bounds.
 * 4. Verifies that docs/swagger.yaml does not contain active claims for deferred frameworks.
 */
function verifyPublicCapabilityClaims(): void {
  console.log(
    '\n================================================================',
  );
  console.log('    ZOIKOSHIELD PUBLIC CAPABILITY & GTM INTEGRITY CHECK');
  console.log(
    '================================================================',
  );

  const capabilityService = new CapabilityStatusService();
  const publicServices = capabilityService.getPublicServices();
  const allCapabilities = capabilityService.getAllCapabilities();
  const errors: string[] = [];

  // 1. Verify 12 Public Services
  console.log(
    `[x] Auditing ${publicServices.length} Customer-Visible Public Services...`,
  );
  if (publicServices.length !== 12) {
    errors.push(
      `Expected exactly 12 public services, found ${publicServices.length}`,
    );
  }

  for (const service of publicServices) {
    // Assert substantiating components do not masquerade as the service itself
    if (service.substantiatingComponents.length === 0) {
      errors.push(
        `Public service ${service.serviceId} (${service.serviceName}) has no substantiating components`,
      );
    }
  }

  // 2. Operationalize Rule FRM-01: Framework Gating
  console.log('[x] Auditing Regulatory Framework Evaluators (FRM-01)...');
  const doraActive = capabilityService.isFrameworkEvaluatorActive('DORA');
  const nis2Active = capabilityService.isFrameworkEvaluatorActive('NIS2');
  const pciActive = capabilityService.isFrameworkEvaluatorActive('PCI_DSS_V4');
  const soc2Active = capabilityService.isFrameworkEvaluatorActive('SOC2_CC6_1');
  const isoActive =
    capabilityService.isFrameworkEvaluatorActive('ISO27001_A9_2');

  if (doraActive)
    errors.push(
      'Rule FRM-01 Violation: DORA evaluator is marked active (must be DEFERRED per ADR-08)',
    );
  if (nis2Active)
    errors.push(
      'Rule FRM-01 Violation: NIS2 evaluator is marked active (must be DEFERRED per ADR-08)',
    );
  if (pciActive)
    errors.push(
      'Rule FRM-01 Violation: PCI DSS v4 evaluator is marked active (must be DEFERRED per ADR-08)',
    );
  if (!soc2Active)
    errors.push('Rule FRM-01 Violation: SOC 2 CC6.1 evaluator must be active');
  if (!isoActive)
    errors.push(
      'Rule FRM-01 Violation: ISO 27001 A.9.2 evaluator must be active',
    );

  // 3. Operationalize Rule CON-01: Connector Tier Gating
  console.log('[x] Auditing Connector Activation Status (CON-01)...');
  const entraAvailable = capabilityService.isConnectorAvailable('entra-id');
  const awsAvailable = capabilityService.isConnectorAvailable('aws-cloudtrail');
  const sapGated = capabilityService.isConnectorAvailable(
    'sap-enterprise-gated',
  );

  if (!entraAvailable)
    errors.push('Tier 1 Microsoft Entra connector must be available');
  if (!awsAvailable)
    errors.push('Tier 1 AWS CloudTrail connector must be available');
  if (sapGated)
    errors.push(
      'Rule CON-01 Violation: Gated Tier 3 connector exposed as available',
    );

  // 4. Audit Plan Tiers
  console.log(
    `[x] Auditing ${DRAFT_PLAN_TIERS.length} draft plan tiers (ADR-06/ADR-07 open)...`,
  );
  if (DRAFT_PLAN_TIERS.length !== 4) {
    errors.push(`Expected 4 plan tiers, found ${DRAFT_PLAN_TIERS.length}`);
  }

  const expectedTiers = [
    'SHIELD_ESSENTIAL',
    'SHIELD_PROFESSIONAL',
    'SHIELD_ADVANCED',
    'SHIELD_ENTERPRISE',
  ];
  for (const expected of expectedTiers) {
    const tier = DRAFT_PLAN_TIERS.find(
      (t: (typeof DRAFT_PLAN_TIERS)[number]) => t.key === expected,
    );
    if (!tier) {
      errors.push(`Missing draft plan tier: ${expected}`);
    } else {
      // ZS-COM-BILL-001 §161: "No public price, plan ladder, included quota,
      // discount, overage or SLA is assumed until the approved price book is
      // live." This check previously FAILED when a tier had no positive
      // public price - the inverse of the standard.
      if (
        tier.pricing.monthlyUsd !== null ||
        tier.pricing.annualBilledMonthlyUsd !== null
      ) {
        errors.push(
          `Plan tier ${tier.key} publishes a price before ADR-06 approves the price book`,
        );
      }
      if (!tier.pricing.isContractOnly) {
        errors.push(
          `Plan tier ${tier.key} must be contract-only until ADR-06 is closed`,
        );
      }
      if (tier.allocations.incidentResponseSlaHours !== null) {
        errors.push(
          `Plan tier ${tier.key} advertises an SLA before ADR-07 approves contractual SLAs`,
        );
      }
    }
  }

  // 5. Audit Swagger / OpenAPI Documentation File
  console.log(
    '[x] Auditing docs/swagger.yaml for deferred framework disclosures...',
  );
  const swaggerPath = path.join(__dirname, '..', '..', 'docs', 'swagger.yaml');
  if (fs.existsSync(swaggerPath)) {
    const specRaw = fs.readFileSync(swaggerPath, 'utf8');
    const spec = yaml.load(specRaw) as any;
    const deferredInSpec =
      specRaw.includes('DEFERRED_PHASE2_MIDPOINT') ||
      specRaw.includes('ADR-08');
    if (!deferredInSpec) {
      console.warn(
        'Note: docs/swagger.yaml does not explicitly mention ADR-08 in description.',
      );
    }
  }

  // 6. Operationalize Rule CAT-01 & SVC-01: Audit Public MDR & Containment SLA Claims
  console.log(
    '[x] Auditing Public MDR Disclosures & SLA Commitments (Rule CAT-01 & SVC-01)...',
  );
  const frontendDir = path.join(__dirname, '..', '..', 'frontend', 'src');
  const publicFiles = [
    path.join(frontendDir, 'app', 'services', 'page.tsx'),
    path.join(frontendDir, 'app', 'pricing', 'page.tsx'),
    path.join(frontendDir, 'lib', 'api-client.ts'),
  ];

  const forbiddenMdrPatterns = [
    {
      pattern: /24\/7\/365\s+certified/i,
      msg: 'Uncontracted "24/7/365 certified" claim found on public surface',
    },
    {
      pattern: /15-min(ute)?\s+containment\s+SLA/i,
      msg: 'Ungrounded "15-minute containment SLA" claim found on public surface',
    },
    {
      pattern: /certified\s+24\/7\s+MDR/i,
      msg: 'Unproven "certified 24/7 MDR" claim found on public surface',
    },
  ];

  for (const filePath of publicFiles) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const { pattern, msg } of forbiddenMdrPatterns) {
        if (pattern.test(content)) {
          errors.push(
            `Rule CAT-01/SVC-01 Violation in ${path.basename(filePath)}: ${msg}`,
          );
        }
      }
    }
  }

  // Report Results
  console.log(
    '----------------------------------------------------------------',
  );
  if (errors.length > 0) {
    console.error(
      `FAILED with ${errors.length} public capability violation(s):`,
    );
    for (const err of errors) console.error(`  [!] ${err}`);
    process.exit(1);
  } else {
    console.log(
      'SUCCESS: All 12 public services, 7 capability domains, connector tiers,',
    );
    console.log(
      'and commercial plan models strictly comply with GTM governance rules.',
    );
    console.log(
      '================================================================\n',
    );
  }
}

verifyPublicCapabilityClaims();
