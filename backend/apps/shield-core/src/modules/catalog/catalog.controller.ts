import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  HttpStatus,
} from '@nestjs/common';
import {
  CatalogService,
  CreateCatalogVersionDto,
  CreateProductDto,
  CreatePriceBookDto,
} from './catalog.service';

export class QueryPriceBookDto {
  sku!: string;
  region?: string;
  currency?: string;
}

@Controller('api/v1/catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  /**
   * POST /api/v1/catalog/versions
   * Create new catalog version
   */
  @Post('versions')
  async createCatalogVersion(@Body() dto: CreateCatalogVersionDto) {
    const version = await this.catalogService.createCatalogVersion(dto);
    return {
      statusCode: HttpStatus.CREATED,
      data: version,
    };
  }

  /**
   * PATCH /api/v1/catalog/versions/:id/approve
   * Approve catalog version
   */
  @Patch('versions/:id/approve')
  async approveCatalogVersion(
    @Param('id') id: string,
    @Body('approvedBy') approvedBy: string,
  ) {
    const version = await this.catalogService.approveCatalogVersion(id, approvedBy || 'system');
    return {
      statusCode: HttpStatus.OK,
      message: 'Catalog version approved',
      data: version,
    };
  }

  /**
   * POST /api/v1/catalog/products
   * Register product SKU
   */
  @Post('products')
  async createProduct(@Body() dto: CreateProductDto) {
    const product = await this.catalogService.createProduct(dto);
    return {
      statusCode: HttpStatus.CREATED,
      data: product,
    };
  }

  /**
   * POST /api/v1/catalog/price-books
   * Register price book
   */
  @Post('price-books')
  async createPriceBook(@Body() dto: CreatePriceBookDto) {
    const priceBook = await this.catalogService.createPriceBook(dto);
    return {
      statusCode: HttpStatus.CREATED,
      data: priceBook,
    };
  }

  /**
   * PATCH /api/v1/catalog/price-books/:id/approve
   * Approve price book
   */
  @Patch('price-books/:id/approve')
  async approvePriceBook(@Param('id') id: string) {
    const priceBook = await this.catalogService.approvePriceBook(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Price book approved',
      data: priceBook,
    };
  }

  /**
   * GET /api/v1/catalog/price-books/active
   * Query active price book (ADR-06 fail-closed check)
   */
  @Get('price-books/active')
  async getActivePriceBook(@Query() query: QueryPriceBookDto) {
    const priceBook = await this.catalogService.getActivePriceBook(
      query.sku,
      query.region,
      query.currency,
    );
    return {
      statusCode: HttpStatus.OK,
      data: priceBook,
    };
  }

  /**
   * GET /api/v1/catalog/products
   * List approved catalog products
   */
  @Get('products')
  async getApprovedProducts() {
    const products = await this.catalogService.getApprovedProducts();
    return {
      statusCode: HttpStatus.OK,
      data: products,
    };
  }
}
