import { Controller, Get } from '@nestjs/common';
import { ScimService } from './scim.service';

@Controller('scim/v2')
export class ScimController {
  constructor(private readonly scimService: ScimService) {}

  @Get('ServiceProviderConfig')
  getServiceProviderConfig() {
    return this.scimService.getServiceProviderConfig();
  }
}
