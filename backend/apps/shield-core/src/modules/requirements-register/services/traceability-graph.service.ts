import { Injectable, Logger } from '@nestjs/common';
import { RequirementsRegisterService } from './requirements-register.service';
import { RequirementNode, AuthorityType } from '../entities/requirement.entity';

export interface TraceabilityCoverageReport {
  totalRequirements: number;
  coveredByTests: number;
  coveredByEvidenceGates: number;
  testCoverageRatio: number;
  evidenceGateCoverageRatio: number;
  untestedRequirements: string[];
  ungatedRequirements: string[];
}

export interface PrecedenceHierarchyNode {
  level: number;
  authorityType: AuthorityType;
  description: string;
  requirementsCount: number;
}

/**
 * Controlled Engineering Specification §05: Precedence & Traceability Graph Service (R04)
 *
 * Enforces the authoritative precedence ordering:
 * 1. Law / Contract
 * 2. Master Specification Document
 * 3. Register + Architecture Decision Records (ADRs)
 * 4. Rendered Code Implementation
 * 5. Delivery Packages
 */
@Injectable()
export class TraceabilityGraphService {
  private readonly logger = new Logger(TraceabilityGraphService.name);

  private readonly AUTHORITY_PRECEDENCE_RANKS: Record<AuthorityType, number> = {
    LAW_REGULATION: 1,
    SECURITY_STANDARD: 2,
    COMMERCIAL_CONTRACT: 3,
    CONTROLLED_SPEC: 4,
    ADR: 5,
  };

  constructor(private readonly registerService: RequirementsRegisterService) {}

  public getTraceabilityCoverage(): TraceabilityCoverageReport {
    const requirements = this.registerService.getAllRequirements();
    const totalRequirements = requirements.length;

    if (totalRequirements === 0) {
      return {
        totalRequirements: 0,
        coveredByTests: 0,
        coveredByEvidenceGates: 0,
        testCoverageRatio: 0,
        evidenceGateCoverageRatio: 0,
        untestedRequirements: [],
        ungatedRequirements: [],
      };
    }

    const untested: string[] = [];
    const ungated: string[] = [];
    let testCovered = 0;
    let gateCovered = 0;

    for (const req of requirements) {
      const hasTest = !!req.traceability.testFilePath;
      const hasGate = !!req.traceability.evidenceGateId;

      if (hasTest) {
        testCovered++;
      } else {
        untested.push(req.id);
      }

      if (req.evidenceObligation.requiresMerkleProof || req.evidenceObligation.requiresWitnessSeal) {
        if (hasGate) {
          gateCovered++;
        } else {
          ungated.push(req.id);
        }
      } else {
        // If no evidence obligation, count as covered
        gateCovered++;
      }
    }

    return {
      totalRequirements,
      coveredByTests: testCovered,
      coveredByEvidenceGates: gateCovered,
      testCoverageRatio: parseFloat((testCovered / totalRequirements).toFixed(4)),
      evidenceGateCoverageRatio: parseFloat((gateCovered / totalRequirements).toFixed(4)),
      untestedRequirements: untested,
      ungatedRequirements: ungated,
    };
  }

  public getPrecedenceHierarchy(): PrecedenceHierarchyNode[] {
    const requirements = this.registerService.getAllRequirements();
    const counts: Record<AuthorityType, number> = {
      LAW_REGULATION: 0,
      SECURITY_STANDARD: 0,
      COMMERCIAL_CONTRACT: 0,
      CONTROLLED_SPEC: 0,
      ADR: 0,
    };

    for (const req of requirements) {
      counts[req.authority.type] = (counts[req.authority.type] || 0) + 1;
    }

    return [
      {
        level: 1,
        authorityType: 'LAW_REGULATION',
        description: 'Statutory and Jurisdictional Mandates (GDPR, HIPAA, NIS2, DORA)',
        requirementsCount: counts.LAW_REGULATION,
      },
      {
        level: 2,
        authorityType: 'SECURITY_STANDARD',
        description: 'Formal Trust & Security Frameworks (SOC 2 Type II, ISO 27001:2022, NIST SP 800-207)',
        requirementsCount: counts.SECURITY_STANDARD,
      },
      {
        level: 3,
        authorityType: 'COMMERCIAL_CONTRACT',
        description: 'Customer Service Contracts, SLA Commitments & Entitlement Ladders',
        requirementsCount: counts.COMMERCIAL_CONTRACT,
      },
      {
        level: 4,
        authorityType: 'CONTROLLED_SPEC',
        description: '18 Controlled Engineering Specifications (ZoikoShield Master Build Standard)',
        requirementsCount: counts.CONTROLLED_SPEC,
      },
      {
        level: 5,
        authorityType: 'ADR',
        description: 'Architecture Decision Records (ADR-001 through ADR-008)',
        requirementsCount: counts.ADR,
      },
    ];
  }

  public resolvePrecedenceConflict(reqA: RequirementNode, reqB: RequirementNode): RequirementNode {
    const rankA = this.AUTHORITY_PRECEDENCE_RANKS[reqA.authority.type] || 99;
    const rankB = this.AUTHORITY_PRECEDENCE_RANKS[reqB.authority.type] || 99;

    if (rankA < rankB) {
      this.logger.log(`✔ Precedence Resolution: '${reqA.id}' (${reqA.authority.type}) overrides '${reqB.id}' (${reqB.authority.type})`);
      return reqA;
    } else {
      this.logger.log(`✔ Precedence Resolution: '${reqB.id}' (${reqB.authority.type}) overrides '${reqA.id}' (${reqA.authority.type})`);
      return reqB;
    }
  }
}
