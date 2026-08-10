export type AssetType =
  | 'ENDPOINT'
  | 'SERVER'
  | 'CLOUD_RESOURCE'
  | 'APPLICATION'
  | 'CONTAINER'
  | 'VIRTUAL_MACHINE'
  | 'NETWORK_DEVICE'
  | 'IP'
  | 'UNKNOWN';

export interface ResolveAssetInput {
  tenantId: string;
  environmentId?: string;
  sourceSystem: string;
  sourceAccountId?: string;
  externalType: string;
  externalId: string;
  assetType: AssetType | string;
  hostname?: string;
  displayName?: string;
  criticality?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  observedAt?: Date;
}

export interface ResolvedAsset {
  assetId: string;
  decision: 'MATCHED' | 'CREATED';
}
