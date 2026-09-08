export interface MicrosoftDefenderAlertPayload {
  id: string;
  incidentId?: number;
  investigationId?: number;
  title: string;
  description: string;
  severity: 'Informational' | 'Low' | 'Medium' | 'High';
  status: 'New' | 'InProgress' | 'Resolved';
  category: string;
  threatFamilyName?: string;
  mitreTechniques?: string[];
  alertCreationTime: string;
  firstEventTime?: string;
  lastEventTime?: string;
  computerDnsName?: string;
  machineId?: string;
  loggedOnUsers?: Array<{
    accountName: string;
    domainName?: string;
  }>;
  evidence?: Array<{
    entityType: 'User' | 'Ip' | 'File' | 'Process';
    accountName?: string;
    ipAddress?: string;
    sha256?: string;
    sha1?: string;
    fileName?: string;
    filePath?: string;
    processCommandLine?: string;
  }>;
}

export interface OcsfSecurityFindingEvent {
  metadata: {
    version: string;
    product: {
      vendor_name: string;
      name: string;
      version: string;
    };
  };
  category_uid: number; // 2 = Findings
  class_uid: number; // 2001 = Security Finding
  activity_id: number; // 1 = Create / Alert
  severity_id: number;
  severity: string;
  time: string;
  tenant_id: string;
  environment_id: string;
  region: string;
  finding: {
    uid: string;
    title: string;
    desc: string;
    confidence_score: number;
    status: string;
    types: string[];
  };
  device?: {
    uid?: string;
    hostname?: string;
    os?: string;
  };
  actor?: {
    user?: {
      name?: string;
      domain?: string;
    };
  };
  attacks?: Array<{
    tactic: { name: string };
    technique: { name: string };
  }>;
  raw_payload_hash: string;
}
