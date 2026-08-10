import { AuditPackageApprovalService } from './audit-package-approval.service';

function makeDeps(pkg: any, manifest: any, evaluatorVersions: any[] = [], manualRuns: any[] = []) {
  const prisma = {
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
    auditPackageManifest: { findUnique: jest.fn().mockResolvedValue(manifest) },
    evaluatorVersion: { findMany: jest.fn().mockResolvedValue(evaluatorVersions) },
    manualTestRun: { findMany: jest.fn().mockResolvedValue(manualRuns) },
    auditPackageApproval: { create: jest.fn(async ({ data }: any) => data) },
    auditPackage: { update: jest.fn(async ({ data }: any) => ({ ...pkg, ...data })) },
    outboxEvent: { create: jest.fn(async ({ data }: any) => data) },
  } as any;
  const authorizationDecisionService = { evaluate: jest.fn().mockResolvedValue({ authorizationDecisionId: 'ad1', decision: 'ALLOW' }) } as any;
  const outbox = { build: jest.fn((p: any) => ({ tenant_id: p.tenantId, topic: p.topic, event_type: p.eventType, payload: JSON.stringify(p.payload) })) } as any;
  const auditPackageService = { assertTenantOwnership: jest.fn().mockResolvedValue(pkg) } as any;
  const stateMachine = { assertValidTransition: jest.fn() } as any;
  return { prisma, authorizationDecisionService, outbox, auditPackageService, stateMachine };
}

const basePkg = { id: 'pkg1', tenant_id: 't1', status: 'READY_FOR_REVIEW', created_by: 'creator1', version: 1 };
const baseManifest = { manifest_core_hash: 'hash1', manifest_core_content: JSON.stringify({ evaluationIndex: [], assessmentIndex: [] }) };

describe('AuditPackageApprovalService (segregation of duties)', () => {
  it('rejects an approver who is also the package creator', async () => {
    const deps = makeDeps(basePkg, baseManifest);
    const service = new AuditPackageApprovalService(deps.prisma, deps.authorizationDecisionService, deps.outbox, deps.auditPackageService, deps.stateMachine);
    await expect(service.approve('t1', 'pkg1', 'creator1')).rejects.toThrow(/creator/);
  });

  it('rejects an approver who authored an evaluator whose results are included in the package', async () => {
    const manifestWithEvaluator = { ...baseManifest, manifest_core_content: JSON.stringify({ evaluationIndex: [{ evaluatorVersionId: 'ev1' }], assessmentIndex: [] }) };
    const deps = makeDeps(basePkg, manifestWithEvaluator, [{ id: 'ev1', evaluator: { owner: 'approver-x' } }]);
    const service = new AuditPackageApprovalService(deps.prisma, deps.authorizationDecisionService, deps.outbox, deps.auditPackageService, deps.stateMachine);
    await expect(service.approve('t1', 'pkg1', 'approver-x')).rejects.toThrow(/authored an evaluator/);
  });

  it('rejects an approver who performed or reviewed an included manual test', async () => {
    const manifestWithAssessment = { ...baseManifest, manifest_core_content: JSON.stringify({ evaluationIndex: [], assessmentIndex: [{ assessmentId: 'a1' }] }) };
    const deps = makeDeps(basePkg, manifestWithAssessment, [], [{ performer_id: 'approver-y', reviewer_id: null }]);
    const service = new AuditPackageApprovalService(deps.prisma, deps.authorizationDecisionService, deps.outbox, deps.auditPackageService, deps.stateMachine);
    await expect(service.approve('t1', 'pkg1', 'approver-y')).rejects.toThrow(/performed or reviewed/);
  });

  it('allows a legitimately independent approver and binds the exact manifestCoreHash', async () => {
    const deps = makeDeps(basePkg, baseManifest);
    const service = new AuditPackageApprovalService(deps.prisma, deps.authorizationDecisionService, deps.outbox, deps.auditPackageService, deps.stateMachine);
    const approval = await service.approve('t1', 'pkg1', 'independent-approver');
    expect(approval.manifest_core_hash).toBe('hash1');
    expect(approval.approver_id).toBe('independent-approver');
  });
});
