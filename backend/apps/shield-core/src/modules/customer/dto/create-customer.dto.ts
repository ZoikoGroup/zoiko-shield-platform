import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCustomerDto {
  @IsUUID()
  partyId: string;

  @IsString()
  customerType: string;

  @IsOptional()
  @IsString()
  segment?: string;
}
