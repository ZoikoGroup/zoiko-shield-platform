import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { OutboxService } from '../../outbox/outbox.service';
import { AssessmentsController } from './assessments.controller';
import { ExpectedEvidenceRuleService } from './expected-evidence/expected-evidence-rule.service';
import { EvidenceMatcherService } from './evidence-matcher/evidence-matcher.service';
import { EvidenceGapService } from './evidence-gaps/evidence-gap.service';
import { MfaCoverageEvaluator } from './evaluators/mfa-coverage/mfa-coverage.evaluator';
import { EvaluatorRegistryService } from './evaluators/evaluator-registry.service';
import { EvidenceBundleService } from './evidence-bundles/evidence-bundle.service';
import { EvaluationRunService } from './evaluation-runs/evaluation-run.service';
import { EvaluationReplayService } from './replay/evaluation-replay.service';
import { ManualTestRunService } from './manual-tests/manual-test-run.service';
import { AssessmentService } from './assessments/assessment.service';
import { AssessmentReviewService } from './review/assessment-review.service';

@Module({
  imports: [PrismaModule, EvidenceModule],
  controllers: [AssessmentsController],
  providers: [
    OutboxService,
    ExpectedEvidenceRuleService,
    EvidenceMatcherService,
    EvidenceGapService,
    MfaCoverageEvaluator,
    EvaluatorRegistryService,
    EvidenceBundleService,
    EvaluationRunService,
    EvaluationReplayService,
    ManualTestRunService,
    AssessmentService,
    AssessmentReviewService,
  ],
  exports: [
    ExpectedEvidenceRuleService,
    EvidenceMatcherService,
    EvidenceGapService,
    EvaluatorRegistryService,
    EvidenceBundleService,
    EvaluationRunService,
    EvaluationReplayService,
    ManualTestRunService,
    AssessmentService,
    AssessmentReviewService,
  ],
})
export class AssessmentsModule {}
