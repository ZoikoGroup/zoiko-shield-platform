export interface ZoikoShieldCanonicalEvent {
  // Metadata
  tenant_id: string;
  environment_id: string;
  region: string;
  provider: string; // e.g. "microsoft-entra"
  event_type: string; // e.g. "security.identity.signin.v1"
  source_event_id: string;
  event_timestamp: string;
  processing_timestamp: string;
  correlation_id: string;

  // Context
  user_identity: {
    id: string;
    username: string;
    email?: string;
  };
  application: {
    id: string;
    name: string;
  };
  ip_address: string;
  device_information?: {
    browser?: string;
    os?: string;
    is_compliant?: boolean;
    is_managed?: boolean;
  };
  location?: {
    city?: string;
    state?: string;
    country?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };

  // Security
  authentication_result: 'SUCCESS' | 'FAILED' | 'CHALLENGED' | 'UNKNOWN';
  conditional_access_result?: 'SUCCESS' | 'FAILURE' | 'NOT_APPLIED' | 'UNKNOWN';
  risk_state?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

  // Versioning
  source_schema_version: string;
  normalizer_version: string;
  evidence_reference?: string;
}
