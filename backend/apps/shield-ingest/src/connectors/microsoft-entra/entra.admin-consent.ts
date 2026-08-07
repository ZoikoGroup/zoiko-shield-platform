import { ENTRA_REQUIRED_PERMISSIONS } from './entra.permissions';

export class EntraAdminConsentService {
  /**
   * Generates the precise Microsoft Admin Consent URL based on the defined permissions.
   */
  static getConsentUrl(
    clientId: string,
    tenantId: string,
    redirectUri: string,
    state: string,
  ): string {
    const scopes = ENTRA_REQUIRED_PERMISSIONS.join('+');
    return `https://login.microsoftonline.com/common/adminconsent?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${scopes}`;
  }
}
