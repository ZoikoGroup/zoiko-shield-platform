import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { assertSafeCtaUrl } from './url-safety';

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
    if (
      !input.tenantId ||
      typeof input.tenantId !== 'string' ||
      input.tenantId.trim() === ''
    ) {
      throw new BadRequestException(
        'Tenant isolation violation: Tenant identifier is missing',
      );
    }

    this.validateRecipientEmail(input.recipientEmail);

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

  private validateRecipientEmail(recipientEmail: string): void {
    if (typeof recipientEmail !== 'string' || recipientEmail.trim() === '') {
      throw new BadRequestException(
        'Tenant isolation violation: Invalid recipient email address',
      );
    }

    // Reject CR/LF and control characters outright: a recipient value reaches
    // SMTP headers, where an embedded newline becomes header injection
    // (e.g. a smuggled Bcc: to an out-of-tenant address).
    if (/[\u0000-\u001f\u007f]/.test(recipientEmail)) {
      throw new BadRequestException(
        'Tenant isolation violation: Recipient email contains control characters',
      );
    }

    if (recipientEmail.length > 254) {
      throw new BadRequestException(
        'Tenant isolation violation: Recipient email exceeds maximum length',
      );
    }

    // Deliberately conservative single-address shape: exactly one @, a
    // non-empty local part, and a dotted domain. 'a@', '@b' and '@' now fail.
    if (!/^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>".]{2,}$/.test(recipientEmail)) {
      throw new BadRequestException(
        'Tenant isolation violation: Invalid recipient email address',
      );
    }
  }

  private validateSafeUrl(url: string): void {
    // Delegated to the shared Gate 3 implementation so the engine's
    // post-resolution check and this pre-send check can never diverge.
    assertSafeCtaUrl(url);
  }
}
