import { IsOptional, IsString } from 'class-validator';

export class CreateLegalEntityDto {
  @IsString()
  legalName: string;

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
