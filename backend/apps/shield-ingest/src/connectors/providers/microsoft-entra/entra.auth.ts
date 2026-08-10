import { Injectable, Logger } from '@nestjs/common';
import { ENTRA_REQUIRED_PERMISSIONS } from './entra.permissions';

@Injectable()
export class EntraAuthService {
  private readonly logger = new Logger(EntraAuthService.name);

  // Microsoft Entra ID specific constants
  private readonly tenantId = 'common'; // Use 'common' for multi-tenant apps
  private readonly clientId =
    process.env.ENTRA_CLIENT_ID || 'your-client-id-here';
  private readonly redirectUri =
    process.env.ENTRA_REDIRECT_URI ||
    'http://localhost:3000/v1/connectors/entra/callback';

  /**
   * Generates the Admin Consent URL for Microsoft Entra ID.
   * This is what the customer clicks to grant ZoikoShield access.
   */
  generateAuthUrl(customerTenantId: string, state: string): string {
    const scopes = ENTRA_REQUIRED_PERMISSIONS.join(' ');

    const authUrl = new URL(
      `https://login.microsoftonline.com/${this.tenantId}/adminconsent`,
    );
    authUrl.searchParams.append('client_id', this.clientId);
    authUrl.searchParams.append('redirect_uri', this.redirectUri);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('scope', scopes);

    this.logger.log(
      `Generated Admin Consent URL for tenant ${customerTenantId}`,
    );
    return authUrl.toString();
  }

  /**
   * Exchanges the admin consent response for a validation.
   * (In a standard admin consent flow, Microsoft redirects back with admin_consent=True).
   */
  verifyAdminConsent(tenant: string, adminConsent: string): boolean {
    if (adminConsent === 'True') {
      this.logger.log(
        `Admin consent successfully granted for Microsoft tenant: ${tenant}`,
      );
      return true;
    }
    this.logger.error(
      `Admin consent failed or was denied for Microsoft tenant: ${tenant}`,
    );
    return false;
  }
}
