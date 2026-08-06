import { Controller, Get } from '@nestjs/common';
import { ShieldCoreService } from './shield-core.service';

@Controller()
export class ShieldCoreController {
  constructor(private readonly shieldCoreService: ShieldCoreService) {}

  @Get()
  getHello(): string {
    return this.shieldCoreService.getHello();
  }
}
