import { Controller, Get } from '@nestjs/common';

@Controller()
export class ShieldAiController {
  @Get()
  getHello(): string {
    return 'shield-ai online';
  }
}
