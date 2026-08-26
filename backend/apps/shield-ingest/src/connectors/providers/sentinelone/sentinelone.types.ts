export interface SentinelOneThreatPayload {
  id: string;
  agentDetectionInfo: {
    agentId: string;
    agentComputerName: string;
    agentIp: string;
    agentOsName: string;
    agentVersion: string;
    networkStatus: 'connected' | 'disconnected';
  };
  threatInfo: {
    threatId: string;
    threatName: string;
    classification: string;
    confidenceScore: number;
    incidentStatus: 'unresolved' | 'in_progress' | 'resolved';
    mitigationStatus: 'mitigated' | 'not_mitigated' | 'blocked';
    createdAt: string;
    filePath: string;
    processUser: string;
    commandLine?: string;
    sha256?: string;
    sha1?: string;
    md5?: string;
  };
  indicators?: Array<{
    category: string;
    description: string;
    tactics: Array<{ name: string; source: string }>;
    techniques: Array<{ name: string; link?: string }>;
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
  device: {
    uid: string;
    hostname: string;
    ip: string;
    os: string;
  };
  process?: {
    name: string;
    cmd_line?: string;
    file: {
      name: string;
      hashes: Array<{
        algorithm: 'SHA-256' | 'SHA-1' | 'MD5';
        value: string;
      }>;
    };
  };
  actor?: {
    user: {
      name: string;
    };
  };
  attacks?: Array<{
    tactic: { name: string };
    technique: { name: string };
  }>;
  raw_payload_hash: string;
}
