import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsString()
  planTier!: string;

  @IsIn(['MONTHLY', 'ANNUAL'])
  billingPeriod!: 'MONTHLY' | 'ANNUAL';

  @IsOptional()
  @IsNumber()
  @IsPositive()
  quantity?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  successUrl?: string;

  @IsOptional()
  @IsString()
  cancelUrl?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  userEmail?: string;

  @IsOptional()
  @IsString()
  organizationName?: string;
}

export class CheckoutSessionStatusResponseDto {
  sessionId!: string;
  status!: 'SUCCEEDED' | 'PENDING' | 'FAILED' | 'CANCELLED';
  planTier?: string;
  billingPeriod?: string;
  amount?: number;
  currency?: string;
  paymentId?: string;
  receiptUrl?: string;
  createdAt?: string;
}
