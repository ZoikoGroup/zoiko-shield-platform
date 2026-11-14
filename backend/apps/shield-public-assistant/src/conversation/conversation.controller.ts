import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { OriginCsrfGuard } from '../common/origin-csrf.guard';
import { PublicEndpoint } from '../common/public-endpoint.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import {
  SESSION_COOKIE,
  SessionService,
  type GuestSession,
} from '../session/session.service';
import { ConversationService } from './conversation.service';
import { CreateMessageDto } from './create-message.dto';

@Controller('api/public/chat/v1/messages')
@PublicEndpoint()
export class ConversationController {
  constructor(
    private readonly conversations: ConversationService,
    private readonly sessions: SessionService,
  ) {}

  @Post()
  @HttpCode(202)
  @UseGuards(OriginCsrfGuard, RateLimitGuard)
  async create(@Req() request: Request, @Body() body: CreateMessageDto) {
    const session = this.requireSession(request);
    const content = body.content.trim();
    const codePoints = [...content].length;
    if (codePoints === 0) {
      throw new BadRequestException({
        error_code: 'MESSAGE_EMPTY',
        user_safe_message: 'Enter a question before sending.',
        field_errors: { content: ['Enter a question before sending.'] },
      });
    }
    if (codePoints > 2000) {
      throw new BadRequestException({
        error_code: 'MESSAGE_TOO_LONG',
        user_safe_message: 'Messages are limited to 2,000 characters.',
        field_errors: {
          content: ['Messages are limited to 2,000 characters.'],
        },
      });
    }

    const record = await this.conversations.createMessage(session, {
      ...body,
      content,
    });
    return {
      message_id: record.id,
      status: 'PENDING',
      outcome: record.outcome,
      created_at: new Date(record.createdAt).toISOString(),
    };
  }

  @Get(':id/events')
  stream(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const session = this.requireSession(request);
    const record = this.conversations.getForSession(id, session);

    if (record.epoch !== session.epoch) {
      response.status(409).json({
        error_code: 'STALE_EPOCH',
        user_safe_message:
          'This conversation was cleared. Start a new question.',
        correlation_id:
          (request as Request & { correlationId?: string }).correlationId ?? '',
        api_version: 'v1',
      });
      return;
    }

    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();

    if (record.cancelled) {
      response.write(
        `event: error\ndata: ${JSON.stringify({ error_code: 'CANCELLED', user_safe_message: 'The message was cancelled.' })}\n\n`,
      );
      response.end();
      return;
    }

    for (const event of record.events) {
      response.write(`event: ${event.type}\n`);
      response.write(`data: ${JSON.stringify(event.data)}\n\n`);
    }
    response.end();
  }

  @Post(':id/cancel')
  @UseGuards(OriginCsrfGuard, RateLimitGuard)
  cancel(@Param('id') id: string, @Req() request: Request) {
    const session = this.requireSession(request);
    return { cancelled: this.conversations.cancel(id, session) };
  }

  private requireSession(request: Request): GuestSession {
    const session = this.sessions.resolve(request.cookies?.[SESSION_COOKIE]);
    if (!session) {
      throw new UnauthorizedException({
        error_code: 'SESSION_REQUIRED',
        user_safe_message:
          'Your session has expired. Start a new conversation.',
      });
    }
    return session;
  }
}
