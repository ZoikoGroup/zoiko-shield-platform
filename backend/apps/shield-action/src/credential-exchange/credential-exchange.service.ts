import { Injectable } from '@nestjs/common';

/**
 * Short-lived reference only, never a real secret — matches the
 * ENTRA_CLIENT_SECRET vault-reference pattern already used elsewhere. No
 * real connector call exists yet in this milestone (SIMULATION-only), so
 * this returns an opaque reference string rather than resolving to any
 * credential material.
 */
@Injectable()
export class CredentialExchangeService {
  getReference(params: { tenantId: string; connectorCapability?: string }): {
    credentialRef: string;
  } {
    return {
      credentialRef: `vault-ref:simulation:${params.tenantId}:${params.connectorCapability ?? 'default'}`,
    };
  }
}
