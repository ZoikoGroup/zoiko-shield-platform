import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { EnvironmentService } from './environment.service';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';

@Controller('v1/environments')
export class EnvironmentController {
  constructor(private readonly service: EnvironmentService) {}

  @Post()
  create(@Body() createDto: CreateEnvironmentDto) {
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
  update(@Param('id') id: string, @Body() updateDto: UpdateEnvironmentDto) {
    return this.service.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}