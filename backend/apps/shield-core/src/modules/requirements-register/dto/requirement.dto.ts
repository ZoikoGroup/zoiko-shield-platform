import {
  TenantScope,
  DataScope,
  AuthorityType,
  FailureBehavior,
  AiStatus,
  VerificationMethod,
  RequirementLifecycleStatus,
} from '../entities/requirement.entity';

export class CreateRequirementDto {
  id!: string;
  version!: string;
  title!: string;
  statement!: string;
  tenantScope!: TenantScope;
  dataScope!: DataScope;
  authority!: {
    type: AuthorityType;
    reference: string;
  };
  failureBehavior!: FailureBehavior;
  aiStatus!: AiStatus;
  evidenceObligation!: {
    requiresMerkleProof: boolean;
    requiresWitnessSeal: boolean;
    requiresPostQuantumSignature: boolean;
  };
  acceptanceCriteria!: string[];
  verificationMethod!: VerificationMethod;
  traceability!: {
    implementingModule: string;
    sourceFilePath?: string;
    testFilePath?: string;
    evidenceGateId?: string;
  };
  status?: RequirementLifecycleStatus;
}

export class QueryRequirementsDto {
  tenantScope?: TenantScope;
  dataScope?: DataScope;
  authorityType?: AuthorityType;
  failureBehavior?: FailureBehavior;
  status?: RequirementLifecycleStatus;
  implementingModule?: string;
  evidenceGateId?: string;
}
