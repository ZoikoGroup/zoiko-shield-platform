import { Test, TestingModule } from '@nestjs/testing';
import { ExceptionExpiryService } from './exception-expiry.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxService } from '../../../outbox/outbox.service';

describe('ExceptionExpiryService', () => {
  let service: ExceptionExpiryService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      exception: { findMany: jest.fn(), update: jest.fn() },
      outboxEvent: { create: jest.fn() },
      risk: { updateMany: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    prismaMock.exception.update.mockResolvedValue({});
    prismaMock.outboxEvent.create.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExceptionExpiryService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: OutboxService,
          useValue: { build: (data: unknown) => data },
        },
      ],
    }).compile();

    service = module.get<ExceptionExpiryService>(ExceptionExpiryService);
  });

  it('expires the exception and re-opens only its own risk, in one transaction', async () => {
    prismaMock.exception.findMany.mockResolvedValue([
      { id: 'exc-1', tenant_id: 't-1', risk_id: 'risk-1' },
    ]);
    prismaMock.risk.updateMany.mockResolvedValue({ count: 1 });

    await service.expireDue();

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.exception.update).toHaveBeenCalledWith({
      where: { id: 'exc-1' },
      data: { status: 'EXPIRED' },
    });
    expect(prismaMock.risk.updateMany).toHaveBeenCalledWith({
      where: { id: 'risk-1', status: { not: 'OPEN' } },
      data: { status: 'OPEN' },
    });
  });

  it('bounds each tick and keeps going when one exception fails', async () => {
    prismaMock.exception.findMany.mockResolvedValue([
      { id: 'exc-1', tenant_id: 't-1', risk_id: 'risk-1' },
      { id: 'exc-2', tenant_id: 't-1', risk_id: 'risk-2' },
    ]);
    prismaMock.risk.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.$transaction
      .mockRejectedValueOnce(new Error('deadlock'))
      .mockImplementationOnce((ops: Promise<unknown>[]) => Promise.all(ops));

    await expect(service.expireDue()).resolves.toBeUndefined();

    expect(prismaMock.exception.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
  });

  it('never touches risks for an exception that has no risk_id', async () => {
    prismaMock.exception.findMany.mockResolvedValue([
      { id: 'exc-1', tenant_id: 't-1', risk_id: null },
    ]);

    await service.expireDue();

    expect(prismaMock.exception.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.outboxEvent.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.risk.updateMany).not.toHaveBeenCalled();
  });
});
