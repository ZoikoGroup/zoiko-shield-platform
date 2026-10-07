import { Injectable } from '@nestjs/common';

export type SenderClassType =
  | 'account_sender'
  | 'security_sender'
  | 'billing_sender'
  | 'assurance_sender'
  | 'developer_sender'
  | 'status_sender'
  | 'internal_ops_sender'
  | 'privacy_sender'
  | (string & {});

export interface SenderClassProfile {
  fromAddress: string;
  fromDisplayName: string;
  replyTo: string;
  reputationPool: 'TRANSACTIONAL_HIGH' | 'SECURITY_CRITICAL' | 'BILLING' | 'OPS_PAGER';
  mandatoryDkimAlignment: boolean;
  supportUnsubscribe: boolean;
}

/**
 * Sender Class Router & Deliverability Profiles (ZS-EML-TPL-001 v2.0 §2 & Gate 9)
 * Separates outbound sender reputations, DKIM alignments, and RFC 8058 headers.
 */
@Injectable()
export class SenderClassRouterService {
  private readonly profiles: Record<string, SenderClassProfile> = {
    account_sender: {
      fromAddress: 'accounts@zoikoshield.com',
      fromDisplayName: 'Zoiko Shield Account Security',
      replyTo: 'no-reply@zoikoshield.com',
      reputationPool: 'TRANSACTIONAL_HIGH',
      mandatoryDkimAlignment: true,
      supportUnsubscribe: false,
    },
    security_sender: {
      fromAddress: 'security-alerts@zoikoshield.com',
      fromDisplayName: 'Zoiko Shield SecOps & Alert Command',
      replyTo: 'soc-response@zoikoshield.com',
      reputationPool: 'SECURITY_CRITICAL',
      mandatoryDkimAlignment: true,
      supportUnsubscribe: false,
    },
    billing_sender: {
      fromAddress: 'billing@zoikoshield.com',
      fromDisplayName: 'Zoiko Shield Billing & Commercial Operations',
      replyTo: 'billing-support@zoikoshield.com',
      reputationPool: 'BILLING',
      mandatoryDkimAlignment: true,
      supportUnsubscribe: true,
    },
    assurance_sender: {
      fromAddress: 'compliance@zoikoshield.com',
      fromDisplayName: 'Zoiko Shield Assurance & Evidence Ledger',
      replyTo: 'audit-desk@zoikoshield.com',
      reputationPool: 'TRANSACTIONAL_HIGH',
      mandatoryDkimAlignment: true,
      supportUnsubscribe: false,
    },
    developer_sender: {
      fromAddress: 'api-admin@zoikoshield.com',
      fromDisplayName: 'Zoiko Shield Developer Platform',
      replyTo: 'api-support@zoikoshield.com',
      reputationPool: 'TRANSACTIONAL_HIGH',
      mandatoryDkimAlignment: true,
      supportUnsubscribe: true,
    },
    status_sender: {
      fromAddress: 'status@zoikoshield.com',
      fromDisplayName: 'Zoiko Shield Service Reliability & Status',
      replyTo: 'reliability@zoikoshield.com',
      reputationPool: 'OPS_PAGER',
      mandatoryDkimAlignment: true,
      supportUnsubscribe: false,
    },
    internal_ops_sender: {
      fromAddress: 'ops-pager@zoikoshield.com',
      fromDisplayName: 'Zoiko Shield Internal SRE & Operations',
      replyTo: 'sre-oncall@zoikoshield.com',
      reputationPool: 'OPS_PAGER',
      mandatoryDkimAlignment: true,
      supportUnsubscribe: false,
    },
    privacy_sender: {
      fromAddress: 'privacy-officer@zoikoshield.com',
      fromDisplayName: 'Zoiko Shield Privacy & Data Rights',
      replyTo: 'dpo@zoikoshield.com',
      reputationPool: 'TRANSACTIONAL_HIGH',
      mandatoryDkimAlignment: true,
      supportUnsubscribe: false,
    },
  };

  /**
   * Resolves the authoritative sender profile for any given template sender class.
   */
  resolveSenderProfile(senderClass: SenderClassType): SenderClassProfile {
    const profile = this.profiles[senderClass];
    if (profile) return profile;

    // Default safe fallback
    return {
      fromAddress: 'notifications@zoikoshield.com',
      fromDisplayName: 'Zoiko Shield Platform',
      replyTo: 'support@zoikoshield.com',
      reputationPool: 'TRANSACTIONAL_HIGH',
      mandatoryDkimAlignment: true,
      supportUnsubscribe: false,
    };
  }
}
