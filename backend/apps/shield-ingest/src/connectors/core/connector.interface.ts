import { ConnectorContext } from './connector-context';

export interface ConnectInput {
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

export interface PermissionResult {
  granted: string[];
  missing: string[];
  [key: string]: any;
}

export interface SecurityConnector {
  connect(
    context: ConnectorContext,
    input: ConnectInput,
  ): Promise<ConnectionResult>;

  testConnection(context: ConnectorContext): Promise<HealthResult>;

  sync(context: ConnectorContext): Promise<SyncResult>;

  getPermissions(context: ConnectorContext): Promise<PermissionResult>;

  disconnect(context: ConnectorContext): Promise<void>;
}
