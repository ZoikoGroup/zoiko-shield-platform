import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { RequirementNode } from '../entities/requirement.entity';
import { CreateRequirementDto, QueryRequirementsDto } from '../dto/requirement.dto';
import { RequirementsQualityGuard } from '../guards/requirements-quality.guard';

@Injectable()
export class RequirementsRegisterService {
  private readonly logger = new Logger(RequirementsRegisterService.name);
  private readonly requirements = new Map<string, RequirementNode>();

  constructor(private readonly qualityGuard: RequirementsQualityGuard) {}

  public registerRequirement(dto: CreateRequirementDto): RequirementNode {
    this.qualityGuard.validate(dto);

    if (this.requirements.has(dto.id)) {
      throw new ConflictException(`Requirement with ID '${dto.id}' already exists in R04 register`);
    }

    const node: RequirementNode = {
      ...dto,
      status: dto.status || 'ACTIVE_COMMITTED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.requirements.set(dto.id, node);
    this.logger.log(`✔ [R04 REGISTER] Registered requirement '${node.id}' [Module: ${node.traceability.implementingModule}]`);
    return node;
  }

  public getRequirement(id: string): RequirementNode {
    const node = this.requirements.get(id);
    if (!node) {
      throw new NotFoundException(`Requirement '${id}' not found in R04 register`);
    }
    return node;
  }

  public getAllRequirements(): RequirementNode[] {
    return Array.from(this.requirements.values());
  }

  public queryRequirements(query: QueryRequirementsDto): RequirementNode[] {
    return this.getAllRequirements().filter((r) => {
      if (query.tenantScope && r.tenantScope !== query.tenantScope) return false;
      if (query.dataScope && r.dataScope !== query.dataScope) return false;
      if (query.authorityType && r.authority.type !== query.authorityType) return false;
      if (query.failureBehavior && r.failureBehavior !== query.failureBehavior) return false;
      if (query.status && r.status !== query.status) return false;
      if (query.implementingModule && r.traceability.implementingModule !== query.implementingModule) return false;
      if (query.evidenceGateId && r.traceability.evidenceGateId !== query.evidenceGateId) return false;
      return true;
    });
  }

  public updateRequirementStatus(id: string, status: RequirementNode['status']): RequirementNode {
    const node = this.getRequirement(id);
    node.status = status;
    node.updatedAt = new Date().toISOString();
    this.logger.log(`✔ [R04 STATUS] Updated requirement '${id}' status to '${status}'`);
    return node;
  }

  public count(): number {
    return this.requirements.size;
  }
}
