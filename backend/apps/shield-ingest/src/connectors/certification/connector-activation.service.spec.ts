import { ForbiddenException } from '@nestjs/common';
import {
  ConnectorActivationService,
  ConnectorCertificationTier,
  TenantConnectorPolicy,
} from './connector-activation.service';

describe('ConnectorActivationService (§2 Committed P0 vs P1 Scope Gating)', () => {
  let service: ConnectorActivationService;

  beforeEach(() => {
    service = new ConnectorActivationService();
  });

  const standardEnterpriseTenant: TenantConnectorPolicy = {
    tenantId: 'tenant-enterprise-standard',
    planTier: 'ENTERPRISE',
    enabledP1Preview: false,
    enabledExperimentalConnectors: false,
  };

  const p1PreviewTenant: TenantConnectorPolicy = {
    tenantId: 'tenant-design-partner',
    planTier: 'DESIGN_PARTNER',
    enabledP1Preview: true,
    enabledExperimentalConnectors: false,
  };

  describe('1. P0 Certified Connectors Baseline (Automatic Approval)', () => {
    const p0Providers = [
      'microsoft-entra',
      'aws-guardduty',
      'aws-cloudtrail',
      'syslog-tls',
      'generic-webhook',
      'jira',
      'snyk',
      'crowdstrike',
    ];

    it.each(p0Providers)(
      'should approve P0 certified provider %s without requiring P1 flags',
      (providerId) => {
        const result = service.validateConnectorActivation(
          standardEnterpriseTenant,
          providerId,
        );

        expect(result.allowed).toBe(true);
        expect(result.certificationTier).toBe(
          ConnectorCertificationTier.P0_CERTIFIED,
        );
        expect(result.auditRecord.action).toBe('ACTIVATION_APPROVED');
        expect(result.denialReason).toBeUndefined();
      },
    );

    it('should confirm CrowdStrike as the single P0 certified response EDR partner', () => {
      const meta = service.getCertificationMetadata('crowdstrike');
      expect(meta.certificationTier).toBe(
        ConnectorCertificationTier.P0_CERTIFIED,
      );
      expect(meta.maxAllowedAuthority).toBe('CERTIFIED_RESPONSE_PARTNER');
      expect(meta.category).toBe('EDR');
    });
  });

  describe('2. P1 Scope Gating (Negative Tests & Preview Entitlement)', () => {
    const p1Providers = [
      'gcp-scc',
      'azure-monitor',
      'okta',
      'sentinelone',
      'microsoft-defender',
      'cortex-xdr',
    ];

    it.each(p1Providers)(
      'should block P1 provider %s for standard tenant without P1 entitlement',
      (providerId) => {
        const result = service.validateConnectorActivation(
          standardEnterpriseTenant,
          providerId,
        );

        expect(result.allowed).toBe(false);
        expect(result.certificationTier).toBe(
          ConnectorCertificationTier.P1_PENDING,
        );
        expect(result.denialCode).toBe(
          'CONNECTOR_ACTIVATION_DENIED_P1_UNENTITLED',
        );
        expect(result.auditRecord.action).toBe('ACTIVATION_BLOCKED');
      },
    );

    it.each(p1Providers)(
      'should allow P1 provider %s when tenant has P1 preview entitlement active',
      (providerId) => {
        const result = service.validateConnectorActivation(
          p1PreviewTenant,
          providerId,
        );

        expect(result.allowed).toBe(true);
        expect(result.certificationTier).toBe(
          ConnectorCertificationTier.P1_PENDING,
        );
        expect(result.auditRecord.action).toBe('ACTIVATION_APPROVED');
      },
    );

    it('should enforce non-CrowdStrike EDRs as read-only ingestion authority', () => {
      const s1 = service.getCertificationMetadata('sentinelone');
      const cortex = service.getCertificationMetadata('cortex-xdr');
      const defender = service.getCertificationMetadata('microsoft-defender');

      expect(s1.maxAllowedAuthority).toBe('READ_ONLY_INGESTION');
      expect(cortex.maxAllowedAuthority).toBe('READ_ONLY_INGESTION');
      expect(defender.maxAllowedAuthority).toBe('READ_ONLY_INGESTION');
    });
  });

  describe('3. Uncertified / Custom Connectors Fail-Closed', () => {
    it('should block unknown or uncertified custom connectors by default', () => {
      const result = service.validateConnectorActivation(
        standardEnterpriseTenant,
        'unregistered-vendor-connector',
      );

      expect(result.allowed).toBe(false);
      expect(result.certificationTier).toBe(
        ConnectorCertificationTier.EXPERIMENTAL_UNCERTIFIED,
      );
      expect(result.denialCode).toBe('CONNECTOR_ACTIVATION_DENIED_UNCERTIFIED');
      expect(result.auditRecord.action).toBe('ACTIVATION_BLOCKED');
    });

    it('should allow custom connector only when explicitly whitelisted under tenant policy', () => {
      const customEntitledTenant: TenantConnectorPolicy = {
        tenantId: 'tenant-custom-pilot',
        planTier: 'ENTERPRISE',
        enabledP1Preview: false,
        enabledExperimentalConnectors: true,
        allowedCustomProviders: ['internal-syslog-legacy'],
      };

      const result = service.validateConnectorActivation(
        customEntitledTenant,
        'internal-syslog-legacy',
      );

      expect(result.allowed).toBe(true);
      expect(result.auditRecord.action).toBe('ACTIVATION_APPROVED');
    });
  });

  describe('4. Ingestion Telemetry Runtime Gating (Fail-Closed Exception)', () => {
    it('should pass cleanly for authorized P0 telemetry', () => {
      expect(() => {
        service.gateIngestionTelemetry(
          standardEnterpriseTenant,
          'microsoft-entra',
        );
      }).not.toThrow();
    });

    it('should throw ForbiddenException when unentitled tenant sends P1 telemetry', () => {
      expect(() => {
        service.gateIngestionTelemetry(standardEnterpriseTenant, 'gcp-scc');
      }).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when telemetry arrives from uncertified provider', () => {
      expect(() => {
        service.gateIngestionTelemetry(
          standardEnterpriseTenant,
          'malicious-unregistered-feed',
        );
      }).toThrow(ForbiddenException);
    });
  });
});
