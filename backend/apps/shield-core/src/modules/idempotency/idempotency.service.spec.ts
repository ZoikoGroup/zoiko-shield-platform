import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('IdempotencyService (ZS-COM-BILL-001 Part 4)', () => {
  let service: IdempotencyService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      idempotencyRecord: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
  });

  it('executes the mutation once for a first-seen key', async () => {
    prismaMock.idempotencyRecord.findUnique.mockResolvedValue(null);
    prismaMock.idempotencyRecord.create.mockResolvedValue({});
    prismaMock.idempotencyRecord.update.mockResolvedValue({});

    const fn = jest
      .fn()
      .mockResolvedValue({ statusCode: 201, body: { id: 'x' } });

    const result = await service.run(
      { key: 'k1', operation: 'op', requestPayload: { a: 1 } },
      fn,
    );

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.replayed).toBe(false);
    expect(result.body).toEqual({ id: 'x' });
  });

  it('replays the persisted response for the same key + same request, without re-running the mutation', async () => {
    prismaMock.idempotencyRecord.findUnique.mockResolvedValue({
      id: 'rec-1',
      idempotency_key: 'k1',
      operation: 'op',
      request_fingerprint: require('crypto')
        .createHash('sha256')
        .update(JSON.stringify({ a: 1 }))
        .digest('hex'),
      status: 'COMPLETED',
      response_code: 201,
      response_body: JSON.stringify({ id: 'x' }),
    });

    const fn = jest.fn();

    const result = await service.run(
      { key: 'k1', operation: 'op', requestPayload: { a: 1 } },
      fn,
    );

    expect(fn).not.toHaveBeenCalled();
    expect(result.replayed).toBe(true);
    expect(result.body).toEqual({ id: 'x' });
  });

  it('returns 409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST for same key + different body', async () => {
    prismaMock.idempotencyRecord.findUnique.mockResolvedValue({
      id: 'rec-1',
      idempotency_key: 'k1',
      operation: 'op',
      request_fingerprint: 'some-other-fingerprint',
      status: 'COMPLETED',
    });

    const fn = jest.fn();

    await expect(
      service.run({ key: 'k1', operation: 'op', requestPayload: { a: 2 } }, fn),
    ).rejects.toThrow(ConflictException);
    expect(fn).not.toHaveBeenCalled();

    try {
      await service.run(
        { key: 'k1', operation: 'op', requestPayload: { a: 2 } },
        fn,
      );
    } catch (err: any) {
      expect(err.getResponse().error).toBe(
        'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
      );
    }
  });

  it('marks the record FAILED and rethrows when the mutation throws', async () => {
    prismaMock.idempotencyRecord.findUnique.mockResolvedValue(null);
    prismaMock.idempotencyRecord.create.mockResolvedValue({});
    prismaMock.idempotencyRecord.update.mockResolvedValue({});

    const fn = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(
      service.run({ key: 'k2', operation: 'op', requestPayload: {} }, fn),
    ).rejects.toThrow('boom');

    expect(prismaMock.idempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });
});
