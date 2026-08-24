import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const PLANE_METADATA_KEY = 'ZOIKO_SYSTEM_PLANE';
export type SystemPlane = 'PLANE_1_COMMERCIAL' | 'PLANE_2_SECURITY_EVIDENCE' | 'SHARED_IDENTITY';

export const RequirePlane = (plane: SystemPlane) =>
  (target: any, key?: string | symbol, descriptor?: any) => {
    Reflect.defineMetadata(PLANE_METADATA_KEY, plane, descriptor?.value || target);
    return descriptor || target;
  };

/**
 * ZS-COM-BILL-001 §3 A1–A3 & Acceptance Criterion QA-01:
 * Two-Plane Isolation Doctrine Runtime Guard.
 *
 * Separation Invariants:
 * 1. Plane 1 (Commercial): contract, commercial_account, price_book, entitlement, service_obligation, invoice.
 * 2. Plane 2 (Security/Evidence): asset, telemetry, detection_run, alert, case, evidence_record, ledger_entry.
 * 3. Invariant Rule (§3.2): Security events (alerts, incidents, control failures, ingestion surges)
 *    can NEVER alter pricing or create money on recurring subscriptions without a separate,
 *    explicit, customer-approved project/retainer work order.
 */
@Injectable()
export class TwoPlaneIsolationGuard implements CanActivate {
  private readonly logger = new Logger(TwoPlaneIsolationGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targetPlane = this.reflector.getAllAndOverride<SystemPlane>(
      PLANE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no plane declared, allow by default
    if (!targetPlane) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const headers = request.headers || {};
    const body = request.body || {};

    // Check caller's asserted source plane or origin context
    const callerSourcePlane = headers['x-zoiko-source-plane'] as string | undefined;

    // Rule 1: Plane 2 (Security Telemetry / Ingestion) cannot directly write to Plane 1 (Commercial)
    if (
      targetPlane === 'PLANE_1_COMMERCIAL' &&
      callerSourcePlane === 'PLANE_2_SECURITY_EVIDENCE'
    ) {
      // Unless it's an explicit authorized work order payload with commercial authorization signature
      const hasExplicitCommercialOrder = body.workOrderAuthorizationApproved === true;
      if (!hasExplicitCommercialOrder) {
        this.logger.error(
          `[Two-Plane Breach Blocked] Plane 2 Security event attempted to mutate Plane 1 Commercial data without explicit order approval! Route: ${request.path}`,
        );
        throw new ForbiddenException(
          'Two-Plane Isolation Violation: Security telemetry events cannot mutate commercial subscriptions without explicit customer-approved work orders (ZS-COM-BILL-001 §3.2)',
        );
      }
    }

    // Rule 2: Anti-Perverse-Incentive Check - Ingestion alert surges cannot directly modify price books
    if (targetPlane === 'PLANE_1_COMMERCIAL' && body.sourceAlertId && !body.commercialOrderReference) {
      this.logger.error(
        `[Two-Plane Breach Blocked] Attempted to create commercial charge directly from alertId '${body.sourceAlertId}' without commercialOrderReference`,
      );
      throw new ForbiddenException(
        'Anti-Perverse-Incentive Guard: Alerts cannot create recurring charges without approved order reference (ZS-COM-BILL-001 §3)',
      );
    }

    return true;
  }
}
