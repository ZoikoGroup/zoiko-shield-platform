import type { AuthenticatedUser } from '../../identity-adapter/interfaces/jwt-payload.interface';
import { ResponseProposalController } from './response-proposal.controller';

describe('ResponseProposalController authority context', () => {
  const user = {
    id: 'principal-1',
    tenantId: 'tenant-a',
    environmentId: 'env-a',
  } as AuthenticatedUser;

  it('uses the authenticated principal and guarded tenant, not caller actor input', async () => {
    const service = {
      createProposal: jest.fn().mockResolvedValue({ id: 'proposal-1' }),
    };
    const controller = new ResponseProposalController(service as never);

    await controller.create(
      'tenant-a',
      'case-1',
      {
        targetType: 'USER',
        targetId: 'user-1',
        actionType: 'DISABLE',
        reason: 'investigation',
        recommendationSource: 'HUMAN',
        actorId: 'attacker-controlled-id',
      } as never,
      user,
    );

    expect(service.createProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        environmentId: 'env-a',
        requestedBy: 'principal-1',
      }),
    );
  });
});
