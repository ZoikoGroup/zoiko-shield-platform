import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicEndpoint } from '../../../security/endpoint-access.decorator';
import {
  CapabilityStatusService,
  CapabilityDomainSummary,
  CapabilityItem,
  PublicServiceDefinition,
} from './capability-status.service';

@Controller('api/v1/commercial/capabilities')
@PublicEndpoint()
export class CapabilityStatusController {
  constructor(private readonly capabilityService: CapabilityStatusService) {}

  @Get('public-services')
  getPublicServices(): { data: PublicServiceDefinition[] } {
    return { data: this.capabilityService.getPublicServices() };
  }

  @Get('public-services/:serviceId')
  getPublicServiceById(
    @Param('serviceId') serviceId: string,
  ): { data: PublicServiceDefinition | null } {
    const service = this.capabilityService.getPublicServiceById(serviceId);
    return { data: service || null };
  }

  @Get('domains')
  getDomains(): { data: CapabilityDomainSummary[] } {
    return { data: this.capabilityService.getCapabilitiesByDomain() };
  }

  @Get('all')
  getAllCapabilities(): { data: CapabilityItem[] } {
    return { data: this.capabilityService.getAllCapabilities() };
  }

  @Get('check/:capabilityId')
  checkCapabilityAvailability(
    @Param('capabilityId') capabilityId: string,
  ): { capabilityId: string; available: boolean } {
    return {
      capabilityId,
      available: this.capabilityService.isCapabilityAvailable(capabilityId),
    };
  }

  @Get('evaluators/check')
  checkFrameworkEvaluator(
    @Query('framework') framework: string,
  ): { framework: string; active: boolean } {
    return {
      framework: framework || '',
      active: this.capabilityService.isFrameworkEvaluatorActive(framework || ''),
    };
  }
}
