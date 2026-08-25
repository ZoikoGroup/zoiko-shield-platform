export interface GuardDutyFinding {
  schemaVersion: string;
  accountId: string;
  region: string;
  partition: string;
  id: string;
  arn: string;
  type: string;
  resource: {
    resourceType: string;
    instanceDetails?: {
      instanceId: string;
      instanceType?: string;
      networkInterfaces?: Array<{
        privateIpAddress?: string;
        publicIp?: string;
      }>;
      tags?: Array<{ key: string; value: string }>;
    };
    accessKeyDetails?: {
      accessKeyId: string;
      principalId?: string;
      userName?: string;
      userType?: string;
    };
    s3BucketDetails?: Array<{
      arn: string;
      name: string;
      type?: string;
    }>;
  };
  service: {
    serviceName: string;
    detectorId: string;
    action?: {
      actionType: string;
      awsApiCallAction?: {
        api: string;
        serviceName: string;
        callerType?: string;
        remoteIpDetails?: {
          ipAddressV4?: string;
          country?: { countryName?: string };
        };
      };
      networkConnectionAction?: {
        connectionDirection: string;
        localIpDetails?: { ipAddressV4?: string };
        remoteIpDetails?: { ipAddressV4?: string; country?: { countryName?: string } };
      };
    };
    evidence?: {
      threatIntelligenceDetails?: Array<{
        threatListName: string;
        threatNames: string[];
      }>;
    };
    archived?: boolean;
    count?: number;
    eventFirstSeen?: string;
    eventLastSeen?: string;
  };
  severity: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  description: string;
}

export interface OcsfSecurityFinding {
  metadata: {
    version: string;
    product: {
      vendor_name: string;
      name: string;
      version: string;
    };
  };
  category_uid: number;
  class_uid: number;
  activity_id: number;
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
    types: string[];
    src_url?: string;
  };
  resources?: Array<{
    uid: string;
    name?: string;
    type: string;
    region?: string;
  }>;
  raw_payload_hash: string;
}
