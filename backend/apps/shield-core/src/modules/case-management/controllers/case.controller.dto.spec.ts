import { ValidationPipe } from '@nestjs/common';
import {
  CreateCaseDto,
  UpdateCaseDto,
  AssignCaseDto,
  LinkEvidenceDto,
  TransitionCaseDto,
  LinkAlertDto,
  AddNoteDto,
  RecordDecisionDto,
} from './case.controller';

/**
 * The app's global ValidationPipe runs with `whitelist: true` (main.ts),
 * which silently strips any body property that has no class-validator
 * decorator at all - it doesn't reject the request, it just deletes the
 * field, so a bare `field!: SomeType` with zero decorators quietly becomes
 * `undefined` by the time the controller reads it. These DTOs shipped with
 * no decorators for a while, breaking every write endpoint on this
 * controller (e.g. `toState` on a case transition always arrived as
 * `undefined`) without any test catching it, since the service-layer specs
 * call the service directly and never go through the real pipe.
 */
describe('CaseController DTOs survive the global whitelist ValidationPipe', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const metadataFor = (metatype: any) => ({
    type: 'body' as const,
    metatype,
  });

  it('TransitionCaseDto keeps toState, reason, and disposition', async () => {
    const result = await pipe.transform(
      { toState: 'TRIAGED', reason: 'Confirmed', disposition: 'ACCEPTED_RISK' },
      metadataFor(TransitionCaseDto),
    );
    expect(result.toState).toBe('TRIAGED');
    expect(result.reason).toBe('Confirmed');
    expect(result.disposition).toBe('ACCEPTED_RISK');
  });

  it('CreateCaseDto keeps alertId', async () => {
    const result = await pipe.transform(
      { alertId: 'alert-1', title: 'Escalated' },
      metadataFor(CreateCaseDto),
    );
    expect(result.alertId).toBe('alert-1');
    expect(result.title).toBe('Escalated');
  });

  it('CreateCaseDto keeps the standalone-case fields when no alertId is given', async () => {
    const result = await pipe.transform(
      {
        title: 'Manual investigation',
        environmentId: 'env-1',
        region: 'us-east-1',
        severity: 'CRITICAL',
        priority: 'P1',
      },
      metadataFor(CreateCaseDto),
    );
    expect(result.title).toBe('Manual investigation');
    expect(result.environmentId).toBe('env-1');
    expect(result.region).toBe('us-east-1');
    expect(result.severity).toBe('CRITICAL');
    expect(result.priority).toBe('P1');
  });

  it('UpdateCaseDto keeps the updatable fields', async () => {
    const result = await pipe.transform(
      { title: 'Retitled', severity: 'MEDIUM', queue: 'TIER2' },
      metadataFor(UpdateCaseDto),
    );
    expect(result.title).toBe('Retitled');
    expect(result.severity).toBe('MEDIUM');
    expect(result.queue).toBe('TIER2');
  });

  it('AssignCaseDto keeps ownerId', async () => {
    const result = await pipe.transform(
      { ownerId: 'analyst-2' },
      metadataFor(AssignCaseDto),
    );
    expect(result.ownerId).toBe('analyst-2');
  });

  it('LinkEvidenceDto keeps evidenceId', async () => {
    const result = await pipe.transform(
      { evidenceId: 'ev-1' },
      metadataFor(LinkEvidenceDto),
    );
    expect(result.evidenceId).toBe('ev-1');
  });

  it('LinkAlertDto keeps alertId and relationshipType', async () => {
    const result = await pipe.transform(
      { alertId: 'alert-2', relationshipType: 'RELATED' },
      metadataFor(LinkAlertDto),
    );
    expect(result.alertId).toBe('alert-2');
    expect(result.relationshipType).toBe('RELATED');
  });

  it('AddNoteDto keeps content and classification', async () => {
    const result = await pipe.transform(
      { content: 'Investigated', classification: 'INTERNAL' },
      metadataFor(AddNoteDto),
    );
    expect(result.content).toBe('Investigated');
    expect(result.classification).toBe('INTERNAL');
  });

  it('RecordDecisionDto keeps decisionType, decision, and rationale', async () => {
    const result = await pipe.transform(
      {
        decisionType: 'ACCEPT_RISK',
        decision: 'Accepted',
        rationale: 'Low blast radius',
      },
      metadataFor(RecordDecisionDto),
    );
    expect(result.decisionType).toBe('ACCEPT_RISK');
    expect(result.decision).toBe('Accepted');
    expect(result.rationale).toBe('Low blast radius');
  });

  it('rejects an invalid toState instead of silently passing it through', async () => {
    await expect(
      pipe.transform(
        { toState: 'NOT_A_REAL_STATUS', reason: 'x' },
        metadataFor(TransitionCaseDto),
      ),
    ).rejects.toThrow();
  });
});
