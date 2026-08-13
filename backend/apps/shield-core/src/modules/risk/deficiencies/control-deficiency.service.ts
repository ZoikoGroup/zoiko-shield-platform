import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreateDeficiencyInput {
  tenantId: string;
  assessmentId: string;
  controlObjectiveId: string;
  type:
    | 'DESIGN_GAP'
    | 'IMPLEMENTATION_GAP'
    | 'OPERATING_FAILURE'
    | 'EVIDENCE_GAP'
    | 'COVERAGE_GAP';
  severity: string;
  description: string;
  evidenceRefs?: string[];
  ownerId: string;
  dueAt?: Date;
}

@Injectable()
export class ControlDeficiencyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateDeficiencyInput) {
    return this.prisma.controlDeficiency.create({
      data: {
        id: randomUUID(),
        tenant_id: input.tenantId,
        assessment_id: input.assessmentId,
        control_objective_id: input.controlObjectiveId,
        type: input.type,
        severity: input.severity,
        description: input.description,
        evidence_refs: JSON.stringify(input.evidenceRefs ?? []),
        owner_id: input.ownerId,
        status: 'OPEN',
        due_at: input.dueAt,
      },
    });
  }

  /** Called by the assessment-review workflow when a reviewed Assessment resolves to INEFFECTIVE/PARTIALLY_EFFECTIVE — not auto-wired inside AssessmentService itself, since that would require assessments/ to depend on risk/ (kept as a one-directional dependency the other way, risk/ reads assessment data, not vice versa). */
  async createFromAssessment(
    assessment: {
      id: string;
      tenant_id: string;
      control_implementation_id: string;
      effectiveness: string;
      limitations: string;
    },
    controlObjectiveId: string,
    ownerId: string,
  ) {
    const type =
      assessment.effectiveness === 'INEFFECTIVE'
        ? 'OPERATING_FAILURE'
        : 'IMPLEMENTATION_GAP';
    return this.create({
      tenantId: assessment.tenant_id,
      assessmentId: assessment.id,
      controlObjectiveId,
      type,
      severity: assessment.effectiveness === 'INEFFECTIVE' ? 'HIGH' : 'MEDIUM',
      description: `Assessment ${assessment.id} resolved ${assessment.effectiveness}: ${assessment.limitations}`,
      ownerId,
    });
  }
}
