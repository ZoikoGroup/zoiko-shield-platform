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

  /**
   * True only when testConnection actually reaches the provider. Providers
   * without a real check must leave this unset: the catalog then reports the
   * connection as UNVERIFIED instead of relaying a canned HEALTHY.
   */
  readonly liveConnectivityCheck?: boolean;
  testConnection(context: ConnectorContext): Promise<HealthResult>;

  sync(context: ConnectorContext): Promise<SyncResult>;

  getPermissions(context: ConnectorContext): Promise<PermissionResult>;

  disconnect(context: ConnectorContext): Promise<void>;
}
