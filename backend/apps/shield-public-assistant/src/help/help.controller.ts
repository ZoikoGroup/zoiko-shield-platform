import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PublicEndpoint } from '../common/public-endpoint.decorator';
import { ContentService } from '../content/content.service';

class HelpSearchDto {
  @IsString()
  @MaxLength(200)
  query!: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsIn(['us', 'eu', 'uk', 'apac', 'undecided'])
  market?: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}

class GuideStepDto {
  @IsOptional()
  @IsString()
  step_id?: string;

  @IsOptional()
  @IsString()
  choice?: string;
}

@Controller('api/public/chat/v1')
@PublicEndpoint()
export class HelpController {
  constructor(private readonly content: ContentService) {}

  @Get('help/home')
  home() {
    return this.content.helpHome();
  }

  @Post('help/search')
  search(@Body() body: HelpSearchDto) {
    const query = body.query?.trim() ?? '';
    if (query.length === 0) {
      throw new BadRequestException({
        error_code: 'SEARCH_QUERY_REQUIRED',
        user_safe_message: 'Enter a search term.',
        field_errors: { query: ['Enter a search term.'] },
      });
    }
    const hits = this.content.search(query, {
      market: body.market,
      locale: body.locale,
      limit: 8,
    });
    return {
      query,
      no_results: hits.length === 0,
      results: hits.map((hit) => ({
        id: hit.source.id,
        title: hit.source.title,
        summary: hit.source.summary,
        snippet: hit.snippet,
        kind: hit.source.kind,
        source_id: hit.source.id,
        url: hit.source.canonicalUrl,
      })),
      cursor: null,
    };
  }

  @Get('help/articles/:id')
  article(@Param('id') id: string) {
    const article = this.content.helpArticle(id);
    if (!article) {
      throw new BadRequestException({
        error_code: 'ARTICLE_NOT_FOUND',
        user_safe_message: 'That article is not available.',
      });
    }
    return article;
  }

  @Post('help/guides/:id/steps')
  guideStep(@Param('id') id: string, @Body() body: GuideStepDto) {
    const guide = this.content.guide(id);
    if (!guide) {
      throw new BadRequestException({
        error_code: 'GUIDE_NOT_FOUND',
        user_safe_message: 'That guide is not available.',
      });
    }

    const currentIndex = body.step_id
      ? guide.steps.findIndex((step) => step.id === body.step_id)
      : 0;
    const current = guide.steps[currentIndex < 0 ? 0 : currentIndex];

    let nextStepId: string | undefined;
    if (body.choice) {
      const choice = current.choices?.find((item) => item.id === body.choice);
      nextStepId = choice?.next;
    }

    const nextIndex = nextStepId
      ? guide.steps.findIndex((step) => step.id === nextStepId)
      : currentIndex + (body.choice ? 1 : 0);
    const next =
      nextIndex >= 0 && nextIndex < guide.steps.length
        ? guide.steps[nextIndex]
        : undefined;

    return {
      guide_id: guide.id,
      guide_title: guide.title,
      intro: guide.intro,
      step: current,
      next_step: next ?? null,
      done: !next,
      progress: {
        index: currentIndex + 1,
        total: guide.steps.length,
      },
    };
  }

  @Get('sources/:id')
  source(@Param('id') id: string) {
    const source = this.content.getSource(id);
    if (!source) {
      throw new BadRequestException({
        error_code: 'SOURCE_NOT_FOUND',
        user_safe_message: 'That source is not available.',
      });
    }
    return {
      id: source.id,
      kind: source.kind,
      title: source.title,
      canonical_url: source.canonicalUrl,
      claim_type: source.claimType,
      owner: source.owner,
      reviewer: source.reviewer,
      revision: source.revision,
      effective_from: source.effectiveFrom,
      review_at: source.reviewAt,
      summary: source.summary,
    };
  }
}
