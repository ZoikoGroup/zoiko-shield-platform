export interface GcpSccFindingPayload {
  name: string; // e.g. "organizations/123/sources/456/findings/789"
  parent: string;
  resourceName: string;
  state: 'ACTIVE' | 'INACTIVE';
  category: string; // e.g. "PERSISTENCE: IAM_ADMIN_ROLE_ASSIGNED"
  externalUri?: string;
  sourceProperties?: Record<string, any>;
  securityMarks?: Record<string, string>;
  eventTime: string;
  createTime: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  canonicalHighPriorityType?: string;
  findingClass?:
    'THREAT' | 'VULNERABILITY' | 'MISCONFIGURATION' | 'OBSERVATION';
  indicator?: {
    ipAddresses?: string[];
    domains?: string[];
    signatures?: Array<{
      signatureType?: string;
    }>;
  };
  vulnerability?: {
    cve?: {
      id: string;
      cvssv3?: {
        baseScore?: number;
      };
    };
  };
}

export interface OcsfCloudFindingEvent {
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
  cloud?: {
    provider: string;
    resource_name?: string;
  };
  attacks?: Array<{
    tactic: { name: string };
    technique: { name: string };
  }>;
  raw_payload_hash: string;
}
