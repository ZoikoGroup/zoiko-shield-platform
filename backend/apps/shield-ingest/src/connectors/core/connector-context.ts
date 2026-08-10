export interface ConnectorContext {
  connectorInstanceId: string;

  tenantId: string;
  environmentId: string;

  region: string;

  purpose: string;

  correlationId: string;
  traceId: string;
}
