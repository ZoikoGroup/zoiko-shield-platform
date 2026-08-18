import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import type {
  CustomerKycStatus,
  CustomerLifecycleStatus,
} from '../customer.entity';

export class UpdateCustomerDto {
  @IsOptional()
  @IsUUID()
  partyId?: string;

  @IsOptional()
  @IsString()
  customerType?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED', 'OFFBOARDED'])
  lifecycleStatus?: CustomerLifecycleStatus;

  @IsOptional()
  @IsIn(['PENDING', 'VERIFIED', 'REJECTED'])
  kycStatus?: CustomerKycStatus;

  @IsOptional()
  @IsString()
  segment?: string;
}
