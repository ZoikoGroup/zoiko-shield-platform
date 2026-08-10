import { Test, TestingModule } from '@nestjs/testing';
import { AssetIdentityContextController } from './asset-identity-context.controller';
import { AssetIdentityContextService } from './asset-identity-context.service';
import { HttpStatus } from '@nestjs/common';

describe('AssetIdentityContextController', () => {
  let controller: AssetIdentityContextController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      getAssets: jest.fn(),
      getAssetById: jest.fn(),
      getIdentities: jest.fn(),
      getIdentityById: jest.fn(),
      resolveAsset: jest.fn(),
      resolveIdentity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssetIdentityContextController],
      providers: [{ provide: AssetIdentityContextService, useValue: serviceMock }],
    }).compile();

    controller = module.get<AssetIdentityContextController>(AssetIdentityContextController);
  });

  it('should return assets for tenant', async () => {
    const mockAssets = [{ id: 'asset-1', name: 'Web Server' }];
    serviceMock.getAssets.mockResolvedValue(mockAssets);

    const response = await controller.getAssets('tenant-1', undefined, 10);

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(mockAssets);
    expect(serviceMock.getAssets).toHaveBeenCalledWith('tenant-1', 10);
  });

  it('should return identities for tenant', async () => {
    const mockIdentities = [{ id: 'id-1', email: 'user@example.com' }];
    serviceMock.getIdentities.mockResolvedValue(mockIdentities);

    const response = await controller.getIdentities('tenant-1', undefined, 10);

    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.data).toBe(mockIdentities);
  });
});
