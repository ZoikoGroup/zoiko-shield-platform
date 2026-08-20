export interface SyslogParsedMessage {
  priority: number;
  facility: number;
  severity: number;
  version: number;
  timestamp: string;
  hostname: string;
  appName: string;
  procId: string;
  msgId: string;
  structuredData?: Record<string, Record<string, string>>;
  message: string;
  rawText: string;
}

export interface SyslogNormalizedEvent {
  tenant_id: string;
  environment_id: string;
  region: string;
  provider: 'syslog-tls';
  event_type: string;
  source_event_id: string;
  event_timestamp: string;
  processing_timestamp: string;

  host: {
    hostname: string;
    app_name: string;
    process_id: string;
    message_id: string;
  };

  syslog: {
    facility: number;
    severity: number;
    priority: number;
  };

  message: string;
  action_type: 'AUTH_SUCCESS' | 'AUTH_FAILURE' | 'NETWORK_DROP' | 'GENERIC_LOG';
  target_user?: string;
  source_ip?: string;
  raw_payload_hash: string;
}
