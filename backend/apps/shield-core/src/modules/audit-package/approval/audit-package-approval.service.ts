import {
  ConflictException,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  assertPermittedAuthorization,
  AuthorizationDecisionService,
} from '../../authorization-decision/authorization-decision.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { CANONICAL_TOPICS } from '../../../kafka/kafka-producer.service';
import { AuditPackageService } from '../audit-package.service';
import { AuditPackageStateMachineService } from '../audit-package-state-machine.service';

/**
 * Binds approval to the EXACT manifestCoreHash at approval time (spec
 * correction #3) and enforces separation-of-duties (correction #6):
 * approver != package creator, != any included evaluator's author, !=
 * any included manual test's performer/reviewer.
 */
@Injectable()
export class AuditPackageApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationDecisionService: AuthorizationDecisionService,
    private readonly outbox: OutboxService,
    private readonly auditPackageService: AuditPackageService,
    private readonly stateMachine: AuditPackageStateMachineService,
  ) {}

  async approve(tenantId: string, packageId: string, approverId: string) {
    const pkg = await this.auditPackageService.assertTenantOwnership(
      tenantId,
      packageId,
    );
    this.stateMachine.assertValidTransition(pkg.status, 'APPROVED');

    if (
      pkg.completeness_state !== 'COMPLETE' ||
      pkg.freshness_state !== 'CURRENT' ||
      pkg.verifier_compatibility !== 'COMPATIBLE' ||
      JSON.parse(pkg.missing_evidence).length > 0
    ) {
      throw new ConflictException(
        'Package approval requires complete, current, verifier-compatible evidence with no missing sources',
      );
    }

    if (approverId === pkg.created_by) {
      throw new ForbiddenException(
        'Package approver must not be the package creator (segregation of duties)',
      );
    }

    const manifest = await this.prisma.auditPackageManifest.findUnique({
      where: { package_id: pkg.id },
    });
    if (!manifest || !manifest.manifest_core_hash) {
      throw new NotFoundException(
        `AuditPackage '${packageId}' has no built manifest to approve`,
      );
    }

    const manifestCore = JSON.parse(manifest.manifest_core_content);
    const evaluatorVersionIds: string[] = (manifestCore.evaluationIndex ?? [])
      .map((e: { evaluatorVersionId: string }) => e.evaluatorVersionId)
      .filter(Boolean);
    if (evaluatorVersionIds.length > 0) {
      const evaluatorVersions = await this.prisma.evaluatorVersion.findMany({
        where: { id: { in: evaluatorVersionIds } },
        include: { evaluator: true },
      });
      const authors = new Set(evaluatorVersions.map((v) => v.evaluator.owner));
      if (authors.has(approverId)) {
        throw new ForbiddenException(
          'Package approver must not have authored an evaluator whose results are included in this package (segregation of duties)',
        );
      }
    }

    const assessmentIds: string[] = (manifestCore.assessmentIndex ?? []).map(
      (a: { assessmentId: string }) => a.assessmentId,
    );
    if (assessmentIds.length > 0) {
      const manualRuns = await this.prisma.manualTestRun.findMany({
        where: { tenant_id: tenantId },
      });
      const relevantPerformers = new Set(manualRuns.map((r) => r.performer_id));
      const relevantReviewers = new Set(
        manualRuns
          .filter((r) => r.reviewer_id)
          .map((r) => r.reviewer_id as string),
      );
      if (
        relevantPerformers.has(approverId) ||
        relevantReviewers.has(approverId)
      ) {
        throw new ForbiddenException(
          'Package approver must not have performed or reviewed a manual test included in this package (segregation of duties)',
        );
      }
    }

    const authorization = await this.authorizationDecisionService.evaluate({
      actorId: approverId,
      tenantId,
      action: 'audit_package:approve',
      resourceType: 'AuditPackage',
      resourceId: pkg.id,
    });
    assertPermittedAuthorization(
      authorization,
      'Actor is not authorized to approve audit packages',
    );
    const { authorizationDecisionId } = authorization;

    const [approval] = await this.prisma.$transaction([
      this.prisma.auditPackageApproval.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          package_id: pkg.id,
          package_version: pkg.version,
          approver_id: approverId,
          manifest_core_hash: manifest.manifest_core_hash,
          authorization_decision_id: authorizationDecisionId,
        },
      }),
      this.prisma.auditPackage.update({
        where: { id: pkg.id },
        data: {
          status: 'APPROVED',
          approved_by: approverId,
          approved_at: new Date(),
        },
      }),
      this.prisma.outboxEvent.create({
        data: this.outbox.build({
          tenantId,
          topic: CANONICAL_TOPICS.AUDIT_PACKAGE_APPROVED,
          eventType: 'audit_package.approved',
          payload: {
            packageId: pkg.id,
            manifestCoreHash: manifest.manifest_core_hash,
          },
        }),
      }),
    ]);

    return approval;
  }
}
