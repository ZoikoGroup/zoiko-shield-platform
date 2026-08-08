import { IsIn, IsOptional, IsString } from 'class-validator';
import type { EnvironmentStatus } from '../environment.entity';

const ENVIRONMENT_STATUSES: EnvironmentStatus[] = ['ACTIVE', 'DISABLED'];

export class UpdateEnvironmentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(ENVIRONMENT_STATUSES)
  status?: EnvironmentStatus;
}
