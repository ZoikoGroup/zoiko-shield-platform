import { Controller, Get } from '@nestjs/common';

@Controller()
export class ShieldAnchorController {
  @Get()
  health() {
    return { service: 'shield-anchor', status: 'ok' };
  }
}
