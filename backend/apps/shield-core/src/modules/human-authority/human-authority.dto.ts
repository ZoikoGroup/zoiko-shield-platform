import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export const DECISION_ORIGINS = [
  'HUMAN',
  'AI_ASSISTED',
  'AI_AUTONOMOUS',
] as const;
export type DecisionOrigin = (typeof DECISION_ORIGINS)[number];

export class HumanAuthorityAttestationDto {
  @IsIn(DECISION_ORIGINS)
  decisionOrigin!: DecisionOrigin;

  @IsBoolean()
  humanConfirmation!: boolean;

  @IsString()
  @MinLength(12)
  authorityStatement!: string;

  @IsOptional()
  @IsUUID()
  aiOutputId?: string;

  @IsOptional()
  @IsUUID()
  aiHumanReviewId?: string;
}
