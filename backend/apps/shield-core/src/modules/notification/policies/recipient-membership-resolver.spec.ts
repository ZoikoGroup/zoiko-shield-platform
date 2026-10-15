import { PrismaRecipientMembershipResolver } from './recipient-membership-resolver';

describe('PrismaRecipientMembershipResolver (Gate 3 Recipient Membership)', () => {
  function resolverWith(prisma: {
    principal: { findUnique: jest.Mock };
    tenantMembership: { findFirst: jest.Mock };
  }) {
    return new PrismaRecipientMembershipResolver(prisma as any);
  }

  it('treats an address with no registered principal as safe (invitation shape)', async () => {
    const prisma = {
      principal: { findUnique: jest.fn().mockResolvedValue(null) },
      tenantMembership: { findFirst: jest.fn() },
    };
    const resolver = resolverWith(prisma);

    await expect(
      resolver.isSafeRecipient('tenant-acme', 'newcomer@acme.com'),
    ).resolves.toBe(true);
    expect(prisma.tenantMembership.findFirst).not.toHaveBeenCalled();
  });

  it('treats a known principal with active membership in the tenant as safe', async () => {
    const prisma = {
      principal: {
        findUnique: jest.fn().mockResolvedValue({ id: 'principal-1' }),
      },
      tenantMembership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'membership-1' }),
      },
    };
    const resolver = resolverWith(prisma);

    await expect(
      resolver.isSafeRecipient('tenant-acme', 'member@acme.com'),
    ).resolves.toBe(true);
    expect(prisma.tenantMembership.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-acme',
        principalId: 'principal-1',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
  });

  it('rejects a known principal with no active membership in the tenant', async () => {
    const prisma = {
      principal: {
        findUnique: jest.fn().mockResolvedValue({ id: 'principal-2' }),
      },
      tenantMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const resolver = resolverWith(prisma);

    await expect(
      resolver.isSafeRecipient('tenant-acme', 'outsider@evil-corp.com'),
    ).resolves.toBe(false);
  });
});
