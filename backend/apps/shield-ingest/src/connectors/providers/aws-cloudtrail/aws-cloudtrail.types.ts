export interface CloudTrailUserIdentity {
  type: string;
  principalId?: string;
  arn?: string;
  accountId?: string;
  accessKeyId?: string;
  userName?: string;
  sessionContext?: {
    sessionIssuer?: {
      type: string;
      principalId: string;
      arn: string;
      accountId: string;
      userName: string;
    };
    attributes?: {
      mfaAuthenticated: string;
      creationDate: string;
    };
  };
}

export interface CloudTrailRawRecord {
  eventVersion: string;
  userIdentity: CloudTrailUserIdentity;
  eventTime: string;
  eventSource: string;
  eventName: string;
  awsRegion: string;
  sourceIPAddress: string;
  userAgent: string;
  requestParameters?: Record<string, unknown>;
  responseElements?: Record<string, unknown>;
  additionalEventData?: Record<string, unknown>;
  requestID?: string;
  eventID: string;
  readOnly?: boolean;
  eventType: string;
  managementEvent?: boolean;
  recipientAccountId: string;
  serviceEventDetails?: Record<string, unknown>;
  sharedEventID?: string;
  vpcEndpointId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface CloudTrailNormalizedEvent {
  tenant_id: string;
  environment_id: string;
  region: string;
  provider: 'aws-cloudtrail';
  event_type: string;
  source_event_id: string;
  event_timestamp: string;
  processing_timestamp: string;
  correlation_id: string;

  actor: {
    principal_id?: string;
    account_id?: string;
    user_name?: string;
    arn?: string;
    type: string;
    mfa_authenticated: boolean;
  };

  target: {
    service: string;
    action: string;
    region: string;
    resource_arn?: string;
  };

  network: {
    source_ip: string;
    user_agent: string;
  };

  status: 'SUCCESS' | 'FAILED';
  error_code?: string;
  error_message?: string;
  is_management_event: boolean;
  is_read_only: boolean;
  raw_payload_hash: string;
}
