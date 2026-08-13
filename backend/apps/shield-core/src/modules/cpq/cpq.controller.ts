import { Body, Controller, Get, Headers, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { JwtAuthGuard } from '../identity-adapter/guards/jwt-auth.guard';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { CreateQuoteDto, QuoteService } from './quote.service';
import { CreateOrderDto, OrderService } from './order.service';
import { RequestAmendmentDto, SubscriptionService } from './subscription.service';

export class ApproveQuoteDto {
  @IsString()
  approverId!: string;
}
export class RejectQuoteDto {
  @IsString()
  reason!: string;
}
export class DecideAmendmentDto {
  @IsString()
  approverId!: string;

  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  reason!: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/cpq/quotes')
export class QuoteController {
  constructor(private readonly quoteService: QuoteService) {}

  @Post()
  async create(@Body() dto: CreateQuoteDto) {
    const quote = await this.quoteService.createQuote(dto);
    return { statusCode: HttpStatus.CREATED, data: quote };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const quote = await this.quoteService.getQuoteById(id);
    return { statusCode: HttpStatus.OK, data: quote };
  }

  @Patch(':id/submit')
  async submit(@Param('id') id: string, @Body('actor') actor: string) {
    const quote = await this.quoteService.submitForApproval(id, actor || 'system');
    return { statusCode: HttpStatus.OK, data: quote };
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string, @Body() dto: ApproveQuoteDto) {
    const quote = await this.quoteService.approveQuote(id, dto.approverId);
    return { statusCode: HttpStatus.OK, data: quote };
  }

  @Patch(':id/reject')
  async reject(@Param('id') id: string, @Body() dto: RejectQuoteDto) {
    const quote = await this.quoteService.rejectQuote(id, dto.reason);
    return { statusCode: HttpStatus.OK, data: quote };
  }

  @Patch(':id/cancel')
  async cancel(@Param('id') id: string) {
    const quote = await this.quoteService.cancelQuote(id);
    return { statusCode: HttpStatus.OK, data: quote };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/cpq/orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  async create(@Body() dto: CreateOrderDto, @Headers('idempotency-key') idempotencyKey: string) {
    const order = await this.orderService.createOrderFromQuote(dto, idempotencyKey);
    return { statusCode: HttpStatus.CREATED, data: order };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const order = await this.orderService.getOrderById(id);
    return { statusCode: HttpStatus.OK, data: order };
  }

  @Patch(':id/provision')
  async provision(@Param('id') id: string, @Body('termMonths') termMonths?: number) {
    const result = await this.orderService.provisionOrder(id, termMonths);
    return { statusCode: HttpStatus.OK, data: result };
  }

  @Patch(':id/reject')
  async reject(@Param('id') id: string) {
    const order = await this.orderService.rejectOrder(id);
    return { statusCode: HttpStatus.OK, data: order };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/cpq/subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get(':id')
  async get(@Param('id') id: string) {
    const subscription = await this.subscriptionService.getSubscriptionById(id);
    return { statusCode: HttpStatus.OK, data: subscription };
  }

  @Patch(':id/activate')
  async activate(@Param('id') id: string) {
    const subscription = await this.subscriptionService.activateSubscription(id);
    return { statusCode: HttpStatus.OK, data: subscription };
  }

  @Patch(':id/cancel')
  async cancel(@Param('id') id: string) {
    const subscription = await this.subscriptionService.cancelSubscription(id);
    return { statusCode: HttpStatus.OK, data: subscription };
  }

  @Post(':id/amendments')
  async requestAmendment(@Param('id') id: string, @Body() dto: RequestAmendmentDto) {
    const amendment = await this.subscriptionService.requestAmendment(id, dto);
    return { statusCode: HttpStatus.CREATED, data: amendment };
  }

  @Patch('amendments/:amendmentId/decision')
  async decideAmendment(@Param('amendmentId') amendmentId: string, @Body() dto: DecideAmendmentDto) {
    const amendment = await this.subscriptionService.decideAmendment(
      amendmentId,
      dto.approverId,
      dto.decision,
      dto.reason,
    );
    return { statusCode: HttpStatus.OK, data: amendment };
  }
}
