import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PublicEndpoint } from '../../../security/endpoint-access.decorator';
import {
  PlanTierService,
  PlanRecommendationRequest,
  PlanRecommendation,
} from './plan-tier.service';
import { PlanTier } from './plan-tier.entity';

@Controller('api/v1/commercial/plans')
@PublicEndpoint()
export class PlanTierController {
  constructor(private readonly planTierService: PlanTierService) {}

  @Get()
  getAllPlanTiers(): { data: PlanTier[] } {
    return { data: this.planTierService.getAllPlanTiers() };
  }

  @Get(':planKey')
  getPlanTierByKey(@Param('planKey') planKey: string): { data: PlanTier } {
    return { data: this.planTierService.getPlanTierByKey(planKey) };
  }

  @Post('recommend')
  recommendPlan(@Body() body: PlanRecommendationRequest): {
    data: PlanRecommendation;
  } {
    return { data: this.planTierService.recommendPlan(body) };
  }
}
