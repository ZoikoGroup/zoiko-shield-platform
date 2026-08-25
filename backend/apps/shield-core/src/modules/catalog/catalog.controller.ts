import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { RequireAssurance } from '../authorization/decorators/require-assurance.decorator';
import { RequirePlatformPermissions } from '../authorization/decorators/require-platform-permissions.decorator';
import { PERMISSION_CODES } from '../authorization/constants';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { PlatformPermissionsGuard } from '../authorization/guards/platform-permissions.guard';
import { CurrentUser } from '../identity-adapter/decorators/current-user.decorator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../identity-adapter/interfaces/jwt-payload.interface';
import {
  CatalogService,
  CreateCatalogVersionDto,
  CreatePriceBookDto,
  CreateProductDto,
  DecidePriceBookApprovalDto,
  RequestPriceBookApprovalDto,
  UpdateBundleRulesDto,
} from './catalog.service';

export class QueryPriceBookDto {
  @IsString()
  sku!: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

/** Catalog mutations are plane-1 operations and require step-up authentication. */
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_CATALOG_MANAGE)
@RequireAssurance('PASSWORD_MFA', 'FEDERATED_MFA', 'PASSKEY')
@Controller('api/v1/catalog')
export class CatalogAdminController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post('versions')
  async createCatalogVersion(@Body() dto: CreateCatalogVersionDto) {
    const version = await this.catalogService.createCatalogVersion(dto);
    return { statusCode: HttpStatus.CREATED, data: version };
  }

  @Patch('versions/:id/approve')
  async approveCatalogVersion(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const version = await this.catalogService.approveCatalogVersion(
      id,
      user.id,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Catalog version approved',
      data: version,
    };
  }

  @Post('products')
  async createProduct(@Body() dto: CreateProductDto) {
    const product = await this.catalogService.createProduct(dto);
    return { statusCode: HttpStatus.CREATED, data: product };
  }

  @Patch('products/:id/bundle-rules')
  async updateBundleRules(
    @Param('id') id: string,
    @Body() dto: UpdateBundleRulesDto,
  ) {
    const product = await this.catalogService.updateBundleRules(id, dto.rules);
    return { statusCode: HttpStatus.OK, data: product };
  }

  @Patch('products/:id/release')
  async releaseProduct(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const product = await this.catalogService.releaseProduct(id, user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Product released for this catalog version',
      data: product,
    };
  }

  @Post('price-books')
  async createPriceBook(@Body() dto: CreatePriceBookDto) {
    const priceBook = await this.catalogService.createPriceBook(dto);
    return { statusCode: HttpStatus.CREATED, data: priceBook };
  }

  @Post('price-books/:id/approval')
  async requestPriceBookApproval(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestPriceBookApprovalDto,
  ) {
    const approval = await this.catalogService.requestPriceBookApproval(
      id,
      user.id,
      dto,
    );
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Price submitted for independent Finance/Commercial approval',
      data: approval,
    };
  }

  @Patch('price-books/:id/approval/:approvalId/decision')
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_PRICE_APPROVE)
  async decidePriceBookApproval(
    @Param('id') id: string,
    @Param('approvalId') approvalId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DecidePriceBookApprovalDto,
  ) {
    const approval = await this.catalogService.decidePriceBookApproval(
      id,
      approvalId,
      user.id,
      dto,
    );
    return { statusCode: HttpStatus.OK, data: approval };
  }

  @Patch('price-books/:id/approve')
  @RequirePlatformPermissions(PERMISSION_CODES.PLATFORM_PRICE_APPROVE)
  async approvePriceBook(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const priceBook = await this.catalogService.approvePriceBook(id, user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Approved price decision applied',
      data: priceBook,
    };
  }
}

/** Customer-plane reads only expose released products and usable approved prices. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/catalog')
export class CatalogReadController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('price-books/active')
  async getActivePriceBook(@Query() query: QueryPriceBookDto) {
    const priceBook = await this.catalogService.getActivePriceBook(
      query.sku,
      query.region,
      query.currency,
    );
    return { statusCode: HttpStatus.OK, data: priceBook };
  }

  @Get('products')
  async getApprovedProducts() {
    const products = await this.catalogService.getApprovedProducts();
    return { statusCode: HttpStatus.OK, data: products };
  }
}
