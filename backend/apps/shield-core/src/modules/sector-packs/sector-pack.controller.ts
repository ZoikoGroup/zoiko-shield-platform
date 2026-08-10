import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { CreateSectorPackDto, SectorPackService, SetMarketAvailabilityDto } from './sector-pack.service';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/sector-packs')
export class SectorPackController {
  constructor(private readonly packService: SectorPackService) {}

  @Post()
  async create(@Body() dto: CreateSectorPackDto) {
    const pack = await this.packService.createPack(dto);
    return { statusCode: HttpStatus.CREATED, data: pack };
  }

  @Patch(':id/license')
  async license(@Param('id') id: string) {
    const pack = await this.packService.licenseContent(id);
    return { statusCode: HttpStatus.OK, data: pack };
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string, @Body('approvedBy') approvedBy: string) {
    const pack = await this.packService.approveRelease(id, approvedBy || 'system');
    return { statusCode: HttpStatus.OK, data: pack };
  }

  @Post(':id/availability')
  async setAvailability(@Param('id') id: string, @Body() dto: SetMarketAvailabilityDto) {
    const availability = await this.packService.setMarketAvailability(id, dto);
    return { statusCode: HttpStatus.OK, data: availability };
  }

  @Get('availability')
  async checkAvailability(@Query('packKey') packKey: string, @Query('region') region: string) {
    const available = await this.packService.isAvailable(packKey, region);
    return { statusCode: HttpStatus.OK, data: { packKey, region, available } };
  }
}
