import { IsIn, IsOptional, IsString } from 'class-validator';
import type { EnvironmentType } from '../environment.entity';

const ENVIRONMENT_TYPES: EnvironmentType[] = [
  'PRODUCTION',
  'STAGING',
  'DEVELOPMENT',
  'TEST',
  'SIMULATION',
];

export class CreateEnvironmentDto {
  @IsString()
  name: string;

  @IsIn(ENVIRONMENT_TYPES)
  environmentType: EnvironmentType;

  @IsOptional()
  @IsString()
  region?: string;
}
