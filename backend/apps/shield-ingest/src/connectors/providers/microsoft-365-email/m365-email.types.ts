export interface M365SecurityAlertV2 {
  id: string;
  tenantId?: string;
  title: string;
  severity?: string;
  status?: string;
  category?: string;
  serviceSource?: string;
  detectionSource?: string;
  createdDateTime?: string;
  lastUpdateDateTime?: string;
  alertWebUrl?: string;
  evidence?: Array<{
    '@odata.type'?: string;
    verdict?: string;
    remediationStatus?: string;
    senderFromAddress?: string;
    recipientEmailAddress?: string;
    internetMessageId?: string;
    fileDetails?: { sha256?: string; fileName?: string };
    url?: string;
  }>;
}

export interface NormalizedEmailThreatRecord {
  sourceEventRef: string;
  provider: 'MICROSOFT_365' | 'GOOGLE_WORKSPACE' | 'ZOIKO_MAIL';
  providerVerdict: string;
  threatClass: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  observedAt: Date;
  subjectRef: string;
  indicatorHashes: Array<{ type: string; value: string }>;
  attachmentHashes: Array<{ sha256: string; fileName?: string }>;
  deepLinkUrl?: string;
  sourceConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  policyId?: string;
  policyVersion: string;
}
