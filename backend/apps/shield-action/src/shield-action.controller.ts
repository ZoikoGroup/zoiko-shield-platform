import { Controller, Get } from '@nestjs/common';

@Controller()
export class ShieldActionController {
  @Get()
  getHello(): string {
    return 'shield-action online';
  }
}
