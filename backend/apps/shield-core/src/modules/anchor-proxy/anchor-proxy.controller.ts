import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import { ShieldAnchorClient } from '../../internal-client/shield-anchor.client';
import { requireTenantId } from '../../tenant-context';

/**
 * User-Facing Cryptographic Ledger & Anchor Proxy Controller in shield-core.
 * Bridges authenticated browser requests to workload-token-protected shield-anchor.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/anchor')
export class AnchorProxyController {
  constructor(private readonly shieldAnchorClient: ShieldAnchorClient) {}

  @Post('batches/seal')
  async sealEpochBatch(
    @Headers('x-tenant-id') headerTenantId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { items: any[] },
  ) {
    const tenantId = requireTenantId(headerTenantId, user?.tenantId);
    const enrichedItems = (body.items || []).map((item) => ({
      ...item,
      tenantId: item.tenantId || tenantId,
    }));
    return this.shieldAnchorClient.sealEpochBatch(enrichedItems);
  }

  @Post('proofs/verify')
  async verifyProof(@Body() body: any) {
    return this.shieldAnchorClient.verifyProof(body);
  }

  @Get('receipts/:epochNumber')
  async getReceipt(@Param('epochNumber') epochNumber: string) {
    return this.shieldAnchorClient.getReceipt(epochNumber);
  }

  @Get('proofs/:epochNumber/:leafIndex')
  async getInclusionProof(
    @Param('epochNumber') epochNumber: string,
    @Param('leafIndex') leafIndex: string,
  ) {
    return this.shieldAnchorClient.getInclusionProof(epochNumber, leafIndex);
  }
}
