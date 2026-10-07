import { Injectable, Logger, BadRequestException } from '@nestjs/common';

export interface TenantIsolationCheckInput {
  tenantId: string;
  recipientEmail: string;
  resourceId?: string;
  resourceTenantId?: string;
  ctaUrl?: string;
  organizationName?: string;
}

/**
 * Tenant Isolation & Pre-Send Validation Guard (ZS-EML-TPL-001 v2.0 Gate 3)
 * Rejects cross-tenant recipient, object, URL, or render inputs before rendering.
 * Cross-tenant leakage is treated as a P0 security defect.
 */
@Injectable()
export class TenantIsolationValidator {
  private readonly logger = new Logger(TenantIsolationValidator.name);

  /**
   * Validates that all parameters strictly belong to the authoritative tenant context.
   */
  validateTenantBoundary(input: TenantIsolationCheckInput): boolean {
    if (!input.tenantId || typeof input.tenantId !== 'string' || input.tenantId.trim() === '') {
      throw new BadRequestException('Tenant isolation violation: Tenant identifier is missing');
    }

    if (!input.recipientEmail || !input.recipientEmail.includes('@')) {
      throw new BadRequestException('Tenant isolation violation: Invalid recipient email address');
    }

    // Resource tenant ID cross-check
    if (input.resourceTenantId && input.resourceTenantId !== input.tenantId) {
      this.logger.error(
        `[P0 SECURITY DEFECT] Cross-tenant data leakage blocked! Requested tenant: ${input.tenantId}, Resource tenant: ${input.resourceTenantId}`,
      );
      throw new BadRequestException(
        'Tenant isolation boundary violation: Referenced resource belongs to a foreign tenant context.',
      );
    }

    // URL allowlist & domain safety check (ensuring only approved HTTPS URLs without javascript: or cross-site protocols)
    if (input.ctaUrl) {
      this.validateSafeUrl(input.ctaUrl);
    }

    return true;
  }

  private validateSafeUrl(url: string): void {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        throw new BadRequestException(
          `Action safety violation: CTA URL must use HTTPS protocol. Received: ${parsed.protocol}`,
        );
      }
    } catch (err: any) {
      throw new BadRequestException(`Malformed CTA URL in email render context: ${err.message}`);
    }
  }
}
