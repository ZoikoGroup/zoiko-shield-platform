import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PublicEndpoint } from '../common/public-endpoint.decorator';
import { ContentService } from '../content/content.service';

const MARKETS = ['us', 'eu', 'uk', 'apac', 'undecided'];

class DiscoveryMatchDto {
  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsIn(MARKETS)
  market?: string;
}

class CommercialFitDto {
  @IsIn(MARKETS)
  market!: string;

  @IsOptional()
  @IsString()
  asset_band?: string;

  @IsOptional()
  @IsString()
  ingestion_band?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  notes?: string;
}

class DeploymentGuideDto {
  @IsOptional()
  @IsIn(MARKETS)
  market?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
}

class OnboardingChecklistDto {
  @IsOptional()
  @IsString()
  persona?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  topic_ids?: string[];
}

@Controller('api/public/chat/v1')
@PublicEndpoint()
export class JourneysController {
  constructor(private readonly content: ContentService) {}

  @Get('discovery/catalog')
  discoveryCatalog() {
    return this.content.discoveryCatalog();
  }

  @Post('discovery/matches')
  discoveryMatches(@Body() body: DiscoveryMatchDto) {
    const catalog = this.content.discoveryCatalog();
    const ruleset = this.content.discoveryRules();
    const market = body.market ?? 'undecided';

    const knownPriority = body.priority
      ? catalog.priorities.some((item) => item.id === body.priority)
      : true;
    if (!knownPriority) {
      throw new BadRequestException({
        error_code: 'UNKNOWN_PRIORITY',
        user_safe_message: 'Choose a priority from the list.',
        field_errors: { priority: ['Choose a priority from the list.'] },
      });
    }

    const matches = ruleset.rules
      .filter((rule) => {
        if (body.priority && rule.priority !== body.priority) return false;
        if (
          body.environment &&
          rule.environment !== 'any' &&
          rule.environment !== body.environment
        ) {
          return false;
        }
        return true;
      })
      .slice(0, 3)
      .map((rule) => {
        const sources = rule.capabilityIds
          .map((id) => this.content.getSource(id))
          .filter(Boolean);
        return {
          id: rule.id,
          title: rule.title,
          why: rule.why,
          source_ids: rule.capabilityIds,
          citations: sources.map((source) => ({
            source_id: source!.id,
            title: source!.title,
            url: source!.canonicalUrl,
            kind: source!.kind,
          })),
        };
      });

    return {
      market,
      ruleset_version: ruleset.rulesetVersion,
      matches,
      no_match: matches.length === 0,
      disclaimer: catalog.disclaimer,
    };
  }

  @Get('commercial/plans')
  plans(@Query('market') market = 'undecided') {
    const selected = MARKETS.includes(market) ? market : 'undecided';
    const plans = this.content.plans(selected);
    return {
      market: selected,
      plans,
      price_display: 'QUOTE_REQUIRED',
      disclaimer:
        'Plan families and feature states are public guidance. A final price, discount, service level and contract term are confirmed in a written quote or order form.',
      published_at: '2026-10-01',
    };
  }

  @Post('commercial/fit')
  fit(@Body() body: CommercialFitDto) {
    const assets = body.asset_band ?? 'unknown';
    const ingestion = body.ingestion_band ?? 'unknown';
    const family =
      assets === 'large' || ingestion === 'high'
        ? 'enterprise'
        : assets === 'medium' || ingestion === 'medium'
          ? 'advanced'
          : assets === 'small'
            ? 'essential'
            : 'undecided';

    const guidance =
      family === 'undecided'
        ? 'Sizing needs a short human review. Share the number of assets or identities, telemetry volume, environments and retention to get a useful plan recommendation.'
        : `A ${family} conversation is a reasonable starting point based on the bands you selected. This is guidance, not a quote or a security assessment.`;

    return {
      market: body.market,
      recommended_plan_family: family,
      guidance,
      no_score: true,
      next_step: {
        type: 'flow',
        flow: 'quote',
        label: 'Request a scoped quote',
      },
      disclaimer:
        'Fit guidance uses published plan descriptions only. Commercial terms, availability and service levels are confirmed by the team.',
    };
  }

  @Get('trust/topics')
  trustTopics(@Query('market') market = 'undecided') {
    const selected = MARKETS.includes(market) ? market : 'undecided';
    return {
      market: selected,
      topics: this.content.trustTopics(selected),
      disclaimer:
        'Security and compliance statements are date- and scope-specific. Where the current position is not published, the assistant will say it cannot confirm it and offer the trust access route.',
    };
  }

  @Get('trust/sources/:id')
  trustSource(@Param('id') id: string) {
    const source = this.content.getSource(id);
    if (!source) {
      throw new BadRequestException({
        error_code: 'SOURCE_NOT_FOUND',
        user_safe_message: 'That trust source is not available.',
      });
    }
    return {
      id: source.id,
      title: source.title,
      kind: source.kind,
      claim_type: source.claimType,
      canonical_url: source.canonicalUrl,
      summary: source.summary,
      owner: source.owner,
      reviewer: source.reviewer,
      review_at: source.reviewAt,
      revision: source.revision,
    };
  }

  @Get('integrations/catalog')
  integrations(
    @Query('market') market = 'undecided',
    @Query('category') category?: string,
  ) {
    const selected = MARKETS.includes(market) ? market : 'undecided';
    const connectors = this.content.connectors(selected, category);
    return {
      market: selected,
      category: category ?? null,
      categories: [
        ...new Set(
          this.content.connectors(selected).map((item) => item.category),
        ),
      ],
      connectors,
      availability_note:
        'Availability is projected from public content. NOT_VERIFIED means the public catalogue does not confirm the integration for your version or deployment model. Confirm with Solutions Engineering.',
    };
  }

  @Post('integrations/deployment-guide')
  deploymentGuide(@Body() body: DeploymentGuideDto) {
    return {
      market: body.market ?? 'undecided',
      topics_to_confirm: [
        'Identity provider, SSO and administrator role model',
        'Network path, egress and any private connectivity requirement',
        'Telemetry sources, collection method and normalisation coverage',
        'Data region, retention and any residency commitment',
        'Response approval model and prohibited actions',
        'Evidence export format and audit review process',
      ],
      categories: body.categories ?? [],
      disclaimer:
        'This is a discussion guide, not a deployment commitment. Confirm the design in a technical evaluation.',
      next_step: {
        type: 'flow',
        flow: 'trust',
        label: 'Request a technical evaluation',
      },
    };
  }

  @Get('onboarding/questions')
  onboardingQuestions() {
    const onboarding = this.content.onboarding();
    return {
      personas: onboarding.personas,
      questions: onboarding.questions,
    };
  }

  @Post('onboarding/checklists')
  onboardingChecklist(@Body() body: OnboardingChecklistDto) {
    const onboarding = this.content.onboarding();
    const topics =
      body.topic_ids && body.topic_ids.length > 0
        ? new Set(body.topic_ids)
        : undefined;
    const steps = onboarding.checklist
      .filter((step) => !topics || topics.has(step.topic))
      .map((step) => {
        const source = this.content.getSource(step.sourceId);
        return {
          ...step,
          source_title: source?.title ?? null,
          source_url: source?.canonicalUrl ?? null,
        };
      });
    return {
      persona: body.persona ?? null,
      steps,
      disclaimer:
        'This checklist is a planning aid. The contracted implementation plan and delivery responsibilities are agreed with the ZoikoShield team.',
    };
  }
}
