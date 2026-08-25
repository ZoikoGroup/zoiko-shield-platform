export interface CrowdStrikeDetectionPayload {
  detection_id: string;
  created_timestamp: string;
  device: {
    device_id: string;
    hostname: string;
    local_ip: string;
    external_ip?: string;
    os_version: string;
    containment_status?: 'contained' | 'normal';
  };
  behaviors: Array<{
    scenario: string;
    objective: string;
    tactic: string;
    technique: string;
    pattern_id: number;
    severity: number;
    confidence: number;
    timestamp: string;
    cmdline: string;
    filename: string;
    sha256: string;
    user_name: string;
  }>;
  status: 'new' | 'in_progress' | 'closed';
  max_severity: number;
  max_confidence: number;
}

export interface OcsfProcessActivityEvent {
  metadata: {
    version: string;
    product: {
      vendor_name: string;
      name: string;
      version: string;
    };
  };
  category_uid: number; // 1 = System Activity
  class_uid: number; // 1007 = Process Activity
  activity_id: number; // 1 = Launch
  severity_id: number;
  severity: string;
  time: string;
  tenant_id: string;
  environment_id: string;
  region: string;
  device: {
    uid: string;
    hostname: string;
    ip: string;
    os: string;
  };
  process: {
    name: string;
    cmd_line: string;
    file: {
      name: string;
      hashes: Array<{
        algorithm: 'SHA-256';
        value: string;
      }>;
    };
  };
  actor: {
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
