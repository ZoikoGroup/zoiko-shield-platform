import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tenant/:tenantId/customers')
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  private async requireManage(
    tenantId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const granted =
      await this.authorizationService.getPermissionCodesForPrincipal(
        tenantId,
        user.id,
      );
    if (!granted.includes(PERMISSION_CODES.TENANT_MANAGE)) {
      throw new ForbiddenException(
        'Missing tenant:manage permission for this tenant',
      );
    }
  }

  @Post()
  async create(
    @Param('tenantId') tenantId: string,
    @Body() createCustomerDto: CreateCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.requireManage(tenantId, user);
    return this.customerService.create(tenantId, createCustomerDto);
  }

  @Get()
  async findAll(@Param('tenantId') tenantId: string) {
    const customers = await this.customerService.findAllForTenant(tenantId);
    return { customers, total: customers.length };
  }

  @Get(':id')
  findOne(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.customerService.findOne(tenantId, id);
  }

  @Patch(':id')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.requireManage(tenantId, user);
    return this.customerService.update(tenantId, id, updateCustomerDto);
  }

  @Delete(':id')
  async remove(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.requireManage(tenantId, user);
    await this.customerService.remove(tenantId, id);
    return { success: true };
  }
}
