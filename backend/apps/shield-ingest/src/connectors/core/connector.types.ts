// Canonical provider keys. Matches ConnectorDefinition.provider in the
// database and ConnectorCatalogService's connector-type ids — lowercase
// hyphenated, not the uppercase-underscore form in the spec's illustrative
// examples, to stay consistent with data that already exists.
export type ConnectorProviderKey =
  | 'generic-webhook'
  | 'generic-syslog'
  | 'microsoft-entra'
  | 'aws-cloudtrail'
  | 'azure-monitor'
  | 'crowdstrike-edr';

export type ConnectorCategory =
  | 'Webhook Ingestion'
  | 'Syslog Ingestion'
  | 'Identity / Productivity'
  | 'Cloud Infrastructure'
  | 'EDR';
