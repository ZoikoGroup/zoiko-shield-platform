import { Controller, Get } from '@nestjs/common';
import { ShieldIngestService } from './shield-ingest.service';

@Controller()
export class ShieldIngestController {
  constructor(private readonly shieldIngestService: ShieldIngestService) {}

  @Get()
  getHello(): string {
    return this.shieldIngestService.getHello();
  }
}
