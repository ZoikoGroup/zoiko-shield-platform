import { Injectable } from '@nestjs/common';

/** DI token: `RecipientMembershipResolver` below is an interface and has no
 * runtime representation, so Nest cannot resolve it by type alone. */
export const RECIPIENT_MEMBERSHIP_RESOLVER = Symbol(
  'RecipientMembershipResolver',
);
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Answers whether a recipient address belongs to the tenant a transactional
 * email is scoped to (ZS-EML-TPL-001 v2.0 Gate 3 — Recipient Membership).
 *
 * This is deliberately a separate, optional, async port rather than a method
 * on TenantIsolationValidator: that validator is pure and synchronous by
 * design (no DB access, trivially unit-testable, safely constructible with
 * `new TenantIsolationValidator()` in scripts and specs), and membership can
 * only be answered by a database lookup.
 */
export interface RecipientMembershipResolver {
  /**
   * True when the recipient is safe to receive tenant-scoped content for
   * `tenantId`: either they have an active membership in that tenant, or no
   * principal exists for that address at all (an invite to someone who is
   * not yet a user cannot leak another tenant's content to an existing
   * identity, because there is no existing identity to leak to). False only
   * when the address resolves to a real, known principal whose active
   * memberships do not include this tenant.
   */
  isSafeRecipient(tenantId: string, email: string): Promise<boolean>;
}

@Injectable()
export class PrismaRecipientMembershipResolver implements RecipientMembershipResolver {
  constructor(private readonly prisma: PrismaService) {}

  async isSafeRecipient(tenantId: string, email: string): Promise<boolean> {
    const principal = await this.prisma.principal.findUnique({
      where: { email },
      select: { id: true },
    });

    // No registered principal for this address: there is nothing to leak
    // cross-tenant content to, and this is the normal shape of an invitation
    // to someone who does not have an account yet.
    if (!principal) {
      return true;
    }

    const membership = await this.prisma.tenantMembership.findFirst({
      where: { tenantId, principalId: principal.id, status: 'ACTIVE' },
      select: { id: true },
    });
    return Boolean(membership);
  }
}
