import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateRequirementDto } from '../dto/requirement.dto';

/**
 * Controlled Engineering Specification §08: Requirements Quality & Measurability Linter
 *
 * Ensures all requirements entering the R04 baseline are:
 * 1. Measurable: Have at least one non-empty acceptance criteria.
 * 2. Traceable: Have defined verification method and implementing module.
 * 3. Authoritative: Grounded in controlled spec, law, ADR, or standard.
 * 4. Deterministic: Clear failure behavior specified.
 */
@Injectable()
export class RequirementsQualityGuard {
  public validate(dto: CreateRequirementDto): void {
    const errors: string[] = [];

    // ID formatting: REQ-<DOMAIN>-...-<NUMBER>
    if (!dto.id || !/^REQ(-[A-Z0-9]+)+-[0-9]+$/.test(dto.id)) {
      errors.push(`Requirement ID '${dto.id}' must match format REQ-<DOMAIN>-<NAME>-<NUMBER> (e.g. REQ-CORE-AUTH-01)`);
    }

    // Mandatory Acceptance Criteria (§08)
    if (!dto.acceptanceCriteria || dto.acceptanceCriteria.length === 0) {
      errors.push(`Requirement '${dto.id}' must define at least one testable acceptance criteria`);
    } else {
      for (let i = 0; i < dto.acceptanceCriteria.length; i++) {
        if (!dto.acceptanceCriteria[i] || dto.acceptanceCriteria[i].trim().length < 5) {
          errors.push(`Requirement '${dto.id}' acceptance criteria #${i + 1} is too brief or empty`);
        }
      }
    }

    // Mandatory Traceability Target (§05)
    if (!dto.traceability || !dto.traceability.implementingModule) {
      errors.push(`Requirement '${dto.id}' must specify an implementing module`);
    }

    // Mandatory Authority (§05 Precedence)
    if (!dto.authority || !dto.authority.type || !dto.authority.reference) {
      errors.push(`Requirement '${dto.id}' must declare authority type and reference`);
    }

    // Mandatory Verification Method (§07)
    if (!dto.verificationMethod) {
      errors.push(`Requirement '${dto.id}' must specify a verification method`);
    }

    // Mandatory Failure Behavior (§07)
    if (!dto.failureBehavior) {
      errors.push(`Requirement '${dto.id}' must specify a failure behavior (e.g. FAIL_CLOSED)`);
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: `Requirement quality validation failed for '${dto.id}' (§08 Quality Standard)`,
        errors,
      });
    }
  }
}
