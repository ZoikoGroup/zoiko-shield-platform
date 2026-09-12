/** Azure Activity Log event, as delivered via Event Hub / Diagnostic Settings export. */
export interface AzureActivityLogEvent {
  eventTimestamp: string;
  operationName: { value: string; localizedValue?: string };
  category: { value: string }; // e.g. Administrative, Security, Alert, Policy
  level: 'Informational' | 'Warning' | 'Error' | 'Critical';
  resourceId?: string;
  subscriptionId: string;
  resourceGroupName?: string;
  caller?: string; // UPN or app ID of the identity that performed the operation
  correlationId?: string;
  status: { value: string }; // Succeeded, Failed, Start, Accepted
  properties?: Record<string, any>;
}

export interface OcsfCloudAuditEvent {
  metadata: {
    version: string;
    product: {
      vendor_name: string;
      name: string;
      version: string;
    };
  };
  category_uid: number; // 3 = Identity & Access Management
  class_uid: number; // 3005 = Cloud Resource Activity
  activity_id: number; // 1 = Create/Perform
  severity_id: number;
  severity: string;
  time: string;
  tenant_id: string;
  environment_id: string;
  region: string;
  actor: {
    user?: string;
  };
  cloud: {
    provider: string;
    subscription_id?: string;
    resource_id?: string;
  };
  action: string;
  outcome: string;
  raw_payload_hash: string;
}
