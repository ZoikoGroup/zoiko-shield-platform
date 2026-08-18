import { Test, TestingModule } from '@nestjs/testing';
import { ConnectorCatalogController } from './connector-catalog.controller';
import { ConnectorCatalogService } from './connector-catalog.service';
import { IdempotencyService } from '../../../shield-core/src/modules/idempotency/idempotency.service';

describe('ConnectorCatalogController (Idempotency P1 & INT-01)', () => {
  let controller: ConnectorCatalogController;
  let catalogServiceMock: any;
  let idempotencyServiceMock: any;

  beforeEach(async () => {
    catalogServiceMock = {
      getConnectorTypes: jest
        .fn()
        .mockReturnValue([
          { provider: 'microsoft-entra', name: 'Microsoft Entra ID' },
        ]),
      createConnector: jest
        .fn()
        .mockResolvedValue({ id: 'conn-100', name: 'Entra Prod' }),
      getConnectors: jest.fn().mockResolvedValue([]),
      getConnectorById: jest.fn().mockResolvedValue({ id: 'conn-100' }),
      updateConnector: jest.fn().mockResolvedValue({ id: 'conn-100' }),
      retireConnector: jest.fn().mockResolvedValue({ id: 'conn-100' }),
      testConnector: jest.fn().mockResolvedValue({ success: true }),
      activateConnector: jest
        .fn()
        .mockResolvedValue({ id: 'conn-100', state: 'CONNECTED' }),
      disableConnector: jest
        .fn()
        .mockResolvedValue({ id: 'conn-100', state: 'DISCONNECTED' }),
      syncConnector: jest.fn().mockResolvedValue({ status: 'STARTED' }),
      getConnectorHealth: jest.fn().mockResolvedValue({ state: 'HEALTHY' }),
    };

    idempotencyServiceMock = {
      run: jest
        .fn()
        .mockImplementation((params: any, fn: any) =>
          fn().then((res: any) => ({ ...res, replayed: false })),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectorCatalogController],
      providers: [
        { provide: ConnectorCatalogService, useValue: catalogServiceMock },
        { provide: IdempotencyService, useValue: idempotencyServiceMock },
      ],
    }).compile();

    controller = module.get<ConnectorCatalogController>(
      ConnectorCatalogController,
    );
  });

  it('should create connector without idempotency key', async () => {
    const result = await controller.createConnector(
      'tenant-1',
      undefined,
      undefined,
      {
        provider: 'microsoft-entra',
        name: 'Entra Prod',
      } as any,
    );

    expect(result.statusCode).toBe(201);
    expect(result.data.id).toBe('conn-100');
    expect(catalogServiceMock.createConnector).toHaveBeenCalled();
  });

  it('should process create connector through IdempotencyService when idempotency-key header is supplied', async () => {
    const result = await controller.createConnector(
      'tenant-1',
      'ikey-12345',
      undefined,
      {
        provider: 'microsoft-entra',
        name: 'Entra Prod',
      } as any,
    );

    expect(idempotencyServiceMock.run).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'ikey-12345',
        operation: 'connectors.create',
        tenantId: 'tenant-1',
      }),
      expect.any(Function),
    );
    expect(result.statusCode).toBe(201);
    expect(result.data.id).toBe('conn-100');
  });

  it('should process activate connector through IdempotencyService when idempotency-key header is supplied', async () => {
    const result = await controller.activateConnector(
      'tenant-1',
      'ikey-activate-99',
      undefined,
      'conn-100',
    );

    expect(idempotencyServiceMock.run).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'ikey-activate-99',
        operation: 'connectors.activate:conn-100',
        tenantId: 'tenant-1',
      }),
      expect.any(Function),
    );
    expect(result.statusCode).toBe(200);
    expect(result.data.state).toBe('CONNECTED');
  });
});
