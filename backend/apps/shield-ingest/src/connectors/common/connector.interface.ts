export interface ConnectInput {
  tenantId: string;
  [key: string]: any;
}

export interface ConnectionResult {
  status: string;
  [key: string]: any;
}

export interface HealthResult {
  status: string;
  [key: string]: any;
}

export interface SyncResult {
  recordsProcessed: number;
  [key: string]: any;
}

export interface SecurityConnector {
  connect(input: ConnectInput): Promise<ConnectionResult>;
  testConnection(instanceId: string): Promise<HealthResult>;
  sync(instanceId: string): Promise<SyncResult>;
  renewSubscriptions(instanceId: string): Promise<void>;
  disconnect(instanceId: string): Promise<void>;
}
