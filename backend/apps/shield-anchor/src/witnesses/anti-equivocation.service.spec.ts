import { Test, TestingModule } from '@nestjs/testing';
import { AntiEquivocationService } from './anti-equivocation.service';

describe('AntiEquivocationService', () => {
  let service: AntiEquivocationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AntiEquivocationService],
    }).compile();

    service = module.get<AntiEquivocationService>(AntiEquivocationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('accepts sequential consistent epoch commitments', () => {
    const epoch1 = service.recordCommitment({
      tenantId: 'ten-corp-01',
      epoch: 1,
      previousEpochRoot: '0000000000000000000000000000000000000000000000000000000000000000',
      currentEpochRoot: 'aaaa111122223333444455556666777788889999aaaabbbbccccddddeeeeffff',
      publishedSignature: 'sig-001',
      witnessCount: 2,
    });
    expect(epoch1.status).toBe('CONSISTENT');

    const epoch2 = service.recordCommitment({
      tenantId: 'ten-corp-01',
      epoch: 2,
      previousEpochRoot: 'aaaa111122223333444455556666777788889999aaaabbbbccccddddeeeeffff',
      currentEpochRoot: 'bbbb22223333444455556666777788889999aaaabbbbccccddddeeeeffffaaaa',
      publishedSignature: 'sig-002',
      witnessCount: 2,
    });
    expect(epoch2.status).toBe('CONSISTENT');
  });

  it('detects equivocation when two conflicting roots are submitted for the same epoch', () => {
    service.recordCommitment({
      tenantId: 'ten-corp-01',
      epoch: 1,
      previousEpochRoot: '0000000000000000000000000000000000000000000000000000000000000000',
      currentEpochRoot: 'root-valid-1',
      publishedSignature: 'sig-001',
      witnessCount: 2,
    });

    const conflicting = service.recordCommitment({
      tenantId: 'ten-corp-01',
      epoch: 1,
      previousEpochRoot: '0000000000000000000000000000000000000000000000000000000000000000',
      currentEpochRoot: 'root-malicious-fork-1',
      publishedSignature: 'sig-evil',
      witnessCount: 1,
    });

    expect(conflicting.status).toBe('EQUIVOCATION_DETECTED');
    expect(conflicting.violatingEpoch).toBe(1);
  });

  it('detects chain fork when previous epoch root does not match chain commitment', () => {
    service.recordCommitment({
      tenantId: 'ten-corp-01',
      epoch: 1,
      previousEpochRoot: '0000000000000000000000000000000000000000000000000000000000000000',
      currentEpochRoot: 'root-epoch-1',
      publishedSignature: 'sig-001',
      witnessCount: 2,
    });

    const forkedEpoch2 = service.recordCommitment({
      tenantId: 'ten-corp-01',
      epoch: 2,
      previousEpochRoot: 'root-wrong-ancestor',
      currentEpochRoot: 'root-epoch-2',
      publishedSignature: 'sig-002',
      witnessCount: 2,
    });

    expect(forkedEpoch2.status).toBe('CHAIN_FORK');
    expect(forkedEpoch2.violatingEpoch).toBe(2);
  });
});
