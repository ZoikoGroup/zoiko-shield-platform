import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

export enum ConnectorCertificationTier {
  P0_CERTIFIED = 'P0_CERTIFIED',
  P1_PENDING = 'P1_PENDING',
  EXPERIMENTAL_UNCERTIFIED = 'EXPERIMENTAL_UNCERTIFIED',
}

export interface ConnectorCertificationMetadata {
  providerId: string;
  name: string;
  certificationTier: ConnectorCertificationTier;
  category: 'IDENTITY' | 'CLOUD' | 'EDR' | 'TICKETING' | 'VULNERABILITY' | 'TELEMETRY' | 'CUSTOM';
  maxAllowedAuthority: 'READ_ONLY_INGESTION' | 'CERTIFIED_RESPONSE_PARTNER';
  requiresExplicitEntitlement: boolean;
  specReference: string;
}

export interface TenantConnectorPolicy {
  tenantId: string;
  planTier: 'STANDARD' | 'ENTERPRISE' | 'GOV_CLOUD' | 'DESIGN_PARTNER';
  enabledP1Preview: boolean;
  enabledExperimentalConnectors: boolean;
  allowedCustomProviders?: string[];
}

export interface ConnectorActivationResult {
  allowed: boolean;
  providerId: string;
  certificationTier: ConnectorCertificationTier;
  denialReason?: string;
  denialCode?:
    | 'CONNECTOR_ACTIVATION_DENIED_P1_UNENTITLED'
    | 'CONNECTOR_ACTIVATION_DENIED_UNCERTIFIED'
    | 'CONNECTOR_ACTIVATION_DENIED_UNKNOWN_PROVIDER'
    | 'CONNECTOR_ACTIVATION_DENIED_TENANT_RESTRICTED';
  auditRecord: {
    eventId: string;
    tenantId: string;
    providerId: string;
    timestamp: string;
    action: 'ACTIVATION_APPROVED' | 'ACTIVATION_BLOCKED';
    certificationTier: ConnectorCertificationTier;
  };
}

/**
 * Authoritative certification registry mapping all 13 providers built in shield-ingest
 * against ERB-01 §2 (Committed P0 vs. P1 Scope).
 */
export const CONNECTOR_CERTIFICATION_REGISTRY: Record<string, ConnectorCertificationMetadata> = {
  // P0 Certified Providers (Committed Baseline: Microsoft Identity, 1 EDR, AWS, Generic Webhook/Syslog, 1 Ticketing, 1 Vuln)
  'microsoft-entra': {
    providerId: 'microsoft-entra',
    name: 'Microsoft Entra ID',
    certificationTier: ConnectorCertificationTier.P0_CERTIFIED,
    category: 'IDENTITY',
    maxAllowedAuthority: 'READ_ONLY_INGESTION',
    requiresExplicitEntitlement: false,
    specReference: 'ERB-01 §2 (Microsoft Identity Baseline)',
  },
  'aws-guardduty': {
    providerId: 'aws-guardduty',
    name: 'AWS GuardDuty',
    certificationTier: ConnectorCertificationTier.P0_CERTIFIED,
    category: 'CLOUD',
    maxAllowedAuthority: 'READ_ONLY_INGESTION',
    requiresExplicitEntitlement: false,
    specReference: 'ERB-01 §2 (AWS Baseline)',
  },
  'aws-cloudtrail': {
    providerId: 'aws-cloudtrail',
    name: 'AWS CloudTrail',
    certificationTier: ConnectorCertificationTier.P0_CERTIFIED,
    category: 'CLOUD',
    maxAllowedAuthority: 'READ_ONLY_INGESTION',
    requiresExplicitEntitlement: false,
    specReference: 'ERB-01 §2 (AWS Baseline)',
  },
  'syslog-tls': {
    providerId: 'syslog-tls',
    name: 'Generic Syslog-over-TLS',
    certificationTier: ConnectorCertificationTier.P0_CERTIFIED,
    category: 'TELEMETRY',
    maxAllowedAuthority: 'READ_ONLY_INGESTION',
    requiresExplicitEntitlement: false,
    specReference: 'ERB-01 §2 (Generic Webhook/Syslog Baseline)',
  },
  'generic-webhook': {
    providerId: 'generic-webhook',
    name: 'Generic JSON Webhook',
    certificationTier: ConnectorCertificationTier.P0_CERTIFIED,
    category: 'TELEMETRY',
    maxAllowedAuthority: 'READ_ONLY_INGESTION',
    requiresExplicitEntitlement: false,
    specReference: 'ERB-01 §2 (Generic Webhook/Syslog Baseline)',
  },
  'jira': {
    providerId: 'jira',
    name: 'Atlassian Jira Service Management',
    certificationTier: ConnectorCertificationTier.P0_CERTIFIED,
    category: 'TICKETING',
    maxAllowedAuthority: 'READ_ONLY_INGESTION',
    requiresExplicitEntitlement: false,
    specReference: 'ERB-01 §2 (One Ticketing Source Baseline)',
  },
  'snyk': {
    providerId: 'snyk',
    name: 'Snyk Container & Code Vulnerability Scanner',
    certificationTier: ConnectorCertificationTier.P0_CERTIFIED,
    category: 'VULNERABILITY',
    maxAllowedAuthority: 'READ_ONLY_INGESTION',
    requiresExplicitEntitlement: false,
    specReference: 'ERB-01 §2 (One Vulnerability Source Baseline)',
  },
  'crowdstrike': {
    providerId: 'crowdstrike',
    name: 'CrowdStrike Falcon Insight EDR',
    certificationTier: ConnectorCertificationTier.P0_CERTIFIED,
    category: 'EDR',
    maxAllowedAuthority: 'CERTIFIED_RESPONSE_PARTNER',
    requiresExplicitEntitlement: false,
    specReference: 'ERB-01 §2 & §15 (Single Certified EDR Partner)',
  },

  // P1 Next-Release Scope Providers (Explicitly gated behind entitlement preview)
  'gcp-scc': {
    providerId: 'gcp-scc',
    name: 'GCP Security Command Center',
    certificationTier: ConnectorCertificationTier.P1_PENDING,
    category: 'CLOUD',
    maxAllowedAuthority: 'READ_ONLY_INGESTION',
    requiresExplicitEntitlement: true,
    specReference: 'Backend Architecture Priority Table (P1 Scope)',
  },
  'azure-monitor': {
    providerId: 'azure-monitor',
    name: 'Azure Monitor / Defender for Cloud',
    certificationTier: ConnectorCertificationTier.P1_PENDING,
    category: 'CLOUD',
    maxAllowedAuthority: 'READ_ONLY_INGESTION',
    requiresExplicitEntitlement: true,
    specReference: 'Backend Architecture Priority Table (P1 Scope)',
  },
  'okta': {
    providerId: 'okta',
    name: 'Okta Identity Cloud',
    certificationTier: ConnectorCertificationTier.P1_PENDING,
    category: 'IDENTITY',
    maxAllowedAuthority: 'READ_ONLY_INGESTION',
    requiresExplicitEntitlement: true,
    specReference: 'Backend Architecture Priority Table (P1 Scope)',
  },
  'sentinelone': {
    providerId: 'sentinelone',
    name: 'SentinelOne Singularity EDR',
    certificationTier: ConnectorCertificationTier.P1_PENDING,
    category: 'EDR',
    maxAllowedAuthority: 'READ_ONLY_INGESTION',
    requiresExplicitEntitlement: true,
    specReference: 'ERB-01 §15 (BYO Read-Only EDR / P1 Scope)',
  },
  'microsoft-defender': {
    providerId: 'microsoft-defender',
    name: 'Microsoft Defender for Endpoint',
    certificationTier: ConnectorCertificationTier.P1_PENDING,
    category: 'EDR',
    maxAllowedAuthority: 'READ_ONLY_INGESTION',
    requiresExplicitEntitlement: true,
    specReference: 'ERB-01 §15 (BYO Read-Only EDR / P1 Scope)',
  },
  'cortex-xdr': {
    providerId: 'cortex-xdr',
    name: 'Palo Alto Networks Cortex XDR',
    certificationTier: ConnectorCertificationTier.P1_PENDING,
    category: 'EDR',
    maxAllowedAuthority: 'READ_ONLY_INGESTION',
    requiresExplicitEntitlement: true,
    specReference: 'ERB-01 §15 (BYO Read-Only EDR / P1 Scope)',
  },
};

@Injectable()
export class ConnectorActivationService {
  private readonly logger = new Logger(ConnectorActivationService.name);

  /**
   * Retrieves certification metadata for a provider.
   */
  getCertificationMetadata(providerId: string): ConnectorCertificationMetadata {
    const normalized = providerId.toLowerCase().trim();
    const meta = CONNECTOR_CERTIFICATION_REGISTRY[normalized];
    if (!meta) {
      return {
        providerId: normalized,
        name: `Custom Provider (${normalized})`,
        certificationTier: ConnectorCertificationTier.EXPERIMENTAL_UNCERTIFIED,
        category: 'CUSTOM',
        maxAllowedAuthority: 'READ_ONLY_INGESTION',
        requiresExplicitEntitlement: true,
        specReference: 'Unregistered / Experimental Extension',
      };
    }
    return meta;
  }

  /**
   * Validates whether a tenant is entitled and permitted to activate/ingest from a given provider.
   */
  validateConnectorActivation(
    tenantPolicy: TenantConnectorPolicy,
    providerId: string
  ): ConnectorActivationResult {
    const meta = this.getCertificationMetadata(providerId);
    const eventId = `act-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();

    // 1. Check P0 Certified Providers -> Allowed for all valid enterprise tenants
    if (meta.certificationTier === ConnectorCertificationTier.P0_CERTIFIED) {
      return {
        allowed: true,
        providerId: meta.providerId,
        certificationTier: meta.certificationTier,
        auditRecord: {
          eventId,
          tenantId: tenantPolicy.tenantId,
          providerId: meta.providerId,
          timestamp,
          action: 'ACTIVATION_APPROVED',
          certificationTier: meta.certificationTier,
        },
      };
    }

    // 2. Check P1 Pending Providers -> Requires explicit P1 preview entitlement
    if (meta.certificationTier === ConnectorCertificationTier.P1_PENDING) {
      if (tenantPolicy.enabledP1Preview || tenantPolicy.planTier === 'DESIGN_PARTNER') {
        return {
          allowed: true,
          providerId: meta.providerId,
          certificationTier: meta.certificationTier,
          auditRecord: {
            eventId,
            tenantId: tenantPolicy.tenantId,
            providerId: meta.providerId,
            timestamp,
            action: 'ACTIVATION_APPROVED',
            certificationTier: meta.certificationTier,
          },
        };
      }

      this.logger.warn(
        `[CONNECTOR_GATED] Tenant '${tenantPolicy.tenantId}' denied activation for P1 provider '${meta.providerId}'. Entitlement 'enabledP1Preview' required.`
      );

      return {
        allowed: false,
        providerId: meta.providerId,
        certificationTier: meta.certificationTier,
        denialCode: 'CONNECTOR_ACTIVATION_DENIED_P1_UNENTITLED',
        denialReason: `Provider '${meta.name}' is classified as ${meta.certificationTier}. Tenant '${tenantPolicy.tenantId}' does not have P1 preview entitlement active.`,
        auditRecord: {
          eventId,
          tenantId: tenantPolicy.tenantId,
          providerId: meta.providerId,
          timestamp,
          action: 'ACTIVATION_BLOCKED',
          certificationTier: meta.certificationTier,
        },
      };
    }

    // 3. Check Experimental / Uncertified Providers
    if (
      tenantPolicy.enabledExperimentalConnectors &&
      tenantPolicy.allowedCustomProviders?.includes(meta.providerId)
    ) {
      return {
        allowed: true,
        providerId: meta.providerId,
        certificationTier: meta.certificationTier,
        auditRecord: {
          eventId,
          tenantId: tenantPolicy.tenantId,
          providerId: meta.providerId,
          timestamp,
          action: 'ACTIVATION_APPROVED',
          certificationTier: meta.certificationTier,
        },
      };
    }

    this.logger.warn(
      `[CONNECTOR_GATED] Tenant '${tenantPolicy.tenantId}' denied activation for uncertified provider '${meta.providerId}'.`
    );

    return {
      allowed: false,
      providerId: meta.providerId,
      certificationTier: meta.certificationTier,
      denialCode: 'CONNECTOR_ACTIVATION_DENIED_UNCERTIFIED',
      denialReason: `Provider '${meta.providerId}' is ${meta.certificationTier} and not authorized for this tenant.`,
      auditRecord: {
        eventId,
        tenantId: tenantPolicy.tenantId,
        providerId: meta.providerId,
        timestamp,
        action: 'ACTIVATION_BLOCKED',
        certificationTier: meta.certificationTier,
      },
    };
  }

  /**
   * Enforces telemetry ingestion gating at runtime. Fails closed with ForbiddenException.
   */
  gateIngestionTelemetry(
    tenantPolicy: TenantConnectorPolicy,
    providerId: string
  ): void {
    const result = this.validateConnectorActivation(tenantPolicy, providerId);
    if (!result.allowed) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: result.denialReason,
        code: result.denialCode,
        providerId: result.providerId,
        certificationTier: result.certificationTier,
        auditEventId: result.auditRecord.eventId,
      });
    }
  }
}
