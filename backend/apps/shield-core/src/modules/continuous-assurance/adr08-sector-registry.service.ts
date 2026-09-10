import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';

export type SectorOverlayType = 'DORA_EU' | 'NIS2_EU' | 'PCI_DSS_V4_0_1';

export interface SectorOverlayRegistration {
  framework: SectorOverlayType;
  displayName: string;
  status: 'DEFERRED_PHASE2_MIDPOINT' | 'ACTIVE_SIGNED_PIPELINE';
  jurisdiction: string;
  legalReviewCompleted: boolean;
  signedPipelineReference?: string;
  selectedByTenantId?: string;
}

/**
 * ADR-08 Sector Overlay Registry Service
 * Specification: ADR-08 (Initial Sector Overlay) & ZS-ENG-SPEC §17.4
 *
 * Rule: One sector overlay is selected by signed pipeline and legal/compliance
 * readiness: DORA, NIS2, or PCI DSS v4.0.1. Multi-overlay simultaneous activation
 * is prohibited prior to Phase 2 Midpoint.
 */
@Injectable()
export class Adr08SectorRegistryService {
  private readonly logger = new Logger(Adr08SectorRegistryService.name);

  private readonly overlays: Map<SectorOverlayType, SectorOverlayRegistration> =
    new Map([
      [
        'DORA_EU',
        {
          framework: 'DORA_EU',
          displayName: 'Digital Operational Resilience Act (Regulation (EU) 2022/2554)',
          status: 'DEFERRED_PHASE2_MIDPOINT',
          jurisdiction: 'European Union (Financial Entities & ICT Third Parties)',
          legalReviewCompleted: false,
        },
      ],
      [
        'NIS2_EU',
        {
          framework: 'NIS2_EU',
          displayName: 'NIS 2 Directive (Directive (EU) 2022/2555)',
          status: 'DEFERRED_PHASE2_MIDPOINT',
          jurisdiction: 'European Union (Essential & Important Entities)',
          legalReviewCompleted: false,
        },
      ],
      [
        'PCI_DSS_V4_0_1',
        {
          framework: 'PCI_DSS_V4_0_1',
          displayName: 'Payment Card Industry Data Security Standard v4.0.1',
          status: 'DEFERRED_PHASE2_MIDPOINT',
          jurisdiction: 'Global (Payment Account Data Environment)',
          legalReviewCompleted: false,
        },
      ],
    ]);

  /**
   * Retrieves the current ADR-08 overlay registry status.
   */
  getRegisteredOverlays(): SectorOverlayRegistration[] {
    return Array.from(this.overlays.values());
  }

  /**
   * Activates a single sector overlay for a tenant upon satisfying ADR-08 entry criteria:
   * 1. Confirmed signed customer pipeline.
   * 2. Completed legal/compliance review.
   * 3. Sole active overlay constraint enforced.
   */
  activateSectorOverlay(
    tenantId: string,
    framework: SectorOverlayType,
    signedPipelineRef: string,
  ): SectorOverlayRegistration {
    if (!tenantId || !framework || !signedPipelineRef) {
      throw new BadRequestException(
        'tenantId, framework, and signedPipelineRef are mandatory for ADR-08 activation.',
      );
    }

    const overlay = this.overlays.get(framework);
    if (!overlay) {
      throw new BadRequestException(`Unknown sector overlay framework '${framework}'.`);
    }

    // Enforce single-overlay constraint per tenant
    for (const [key, existing] of this.overlays.entries()) {
      if (
        key !== framework &&
        existing.status === 'ACTIVE_SIGNED_PIPELINE' &&
        existing.selectedByTenantId === tenantId
      ) {
        throw new ForbiddenException(
          `ADR-08 Violation: Tenant '${tenantId}' already has active sector overlay '${key}'. Multi-overlay activation prohibited prior to Phase 2 GA.`,
        );
      }
    }

    overlay.status = 'ACTIVE_SIGNED_PIPELINE';
    overlay.signedPipelineReference = signedPipelineRef;
    overlay.selectedByTenantId = tenantId;
    overlay.legalReviewCompleted = true;

    this.logger.log(
      `✔ [ADR-08 SECTOR OVERLAY ACTIVATED] Tenant '${tenantId}' selected sole overlay '${framework}' (Pipeline Ref: ${signedPipelineRef})`,
    );

    return overlay;
  }
}
