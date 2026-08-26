export interface OktaEventPayload {
  eventId: string;
  eventType: string;
  published: string;
  displayMessage?: string;
  actor: {
    id: string;
    type: string;
    alternateId: string; // e.g. email
    displayName: string;
  };
  client?: {
    userAgent?: { rawUserAgent?: string };
    ipAddress?: string;
    geographicalContext?: {
      city?: string;
      state?: string;
      country?: string;
      postalCode?: string;
    };
  };
  outcome: {
    result: 'SUCCESS' | 'FAILURE' | 'SKIPPED' | 'DENY' | 'UNKNOWN';
    reason?: string;
  };
  target?: Array<{
    id: string;
    type: string;
    alternateId?: string;
    displayName?: string;
  }>;
  transaction?: {
    type: string;
    id: string;
  };
  debugContext?: {
    debugData?: Record<string, any>;
  };
}

export interface OcsfAuthenticationEvent {
  metadata: {
    version: string;
    product: {
      vendor_name: string;
      name: string;
      version: string;
    };
  };
  category_uid: number; // 3 = Identity & Access Management
  class_uid: number; // 3002 = Authentication
  activity_id: number; // 1 = Logon, 2 = Logoff
  severity_id: number;
  severity: string;
  time: string;
  tenant_id: string;
  environment_id: string;
  region: string;
  actor: {
    user: {
      uid: string;
      name: string;
      email_addr: string;
    };
  };
  src_endpoint?: {
    ip: string;
    location?: {
      city?: string;
      country?: string;
    };
  };
  status: 'SUCCESS' | 'FAILURE' | 'OTHER';
  status_detail?: string;
  raw_payload_hash: string;
}
