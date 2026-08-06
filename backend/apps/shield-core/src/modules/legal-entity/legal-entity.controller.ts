import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { LegalEntityService } from './legal-entity.service';
import { CreateLegalEntityDto } from './dto/create-legal-entity.dto';
import { UpdateLegalEntityDto } from './dto/update-legal-entity.dto';

@Controller('v1/legal-entitys')
export class LegalEntityController {
  constructor(private readonly service: LegalEntityService) {}

  @Post()
  create(@Body() createDto: CreateLegalEntityDto) {
    return this.service.create(createDto);
  }

  @Get()
  findAll() {
    const items = this.service.findAll();
    return { data: items, total: items.length };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateLegalEntityDto) {
    return this.service.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}