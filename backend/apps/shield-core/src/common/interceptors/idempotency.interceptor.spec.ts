import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';

describe('IdempotencyInterceptor (INT-01 / P1)', () => {
  let interceptor: IdempotencyInterceptor;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      commercialEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyInterceptor,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    interceptor = module.get<IdempotencyInterceptor>(IdempotencyInterceptor);
  });

  it('should throw BadRequestException if idempotency-key header is missing', async () => {
    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    };
    const mockHandler: any = { handle: () => of({}) };

    await expect(interceptor.intercept(mockContext, mockHandler)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should replay cached payload if idempotency-key exists', async () => {
    const cachedPayload = { statusCode: 201, data: { id: 'order-1' } };
    prismaMock.commercialEvent.findUnique.mockResolvedValue({
      id: 'evt-1',
      idempotency_key: 'key-100',
      payload: JSON.stringify(cachedPayload),
    });

    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'idempotency-key': 'key-100' } }),
      }),
    };
    const mockHandler: any = { handle: jest.fn() };

    const observable = await interceptor.intercept(mockContext, mockHandler);

    observable.subscribe((res) => {
      expect(res).toEqual(cachedPayload);
      expect(mockHandler.handle).not.toHaveBeenCalled();
    });
  });
});
