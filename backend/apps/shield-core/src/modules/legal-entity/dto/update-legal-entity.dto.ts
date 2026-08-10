import { IsOptional, IsString } from 'class-validator';

export class UpdateLegalEntityDto {
  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  countryOfRegistration?: string;

  @IsOptional()
  @IsString()
  registeredAddress?: string;
}
