import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Controller('v1/organizations')
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  @Post()
  create(@Body() createDto: CreateOrganizationDto) {
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
  update(@Param('id') id: string, @Body() updateDto: UpdateOrganizationDto) {
    return this.service.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}