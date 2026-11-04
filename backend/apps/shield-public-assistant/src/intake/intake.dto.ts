import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { JOURNEYS, type Journey } from './intake.service';

export class CreateKeyDto {
  @IsIn(JOURNEYS)
  journey!: Journey;
}

export class IntakeBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotency_key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  notice_version?: string;

  @IsOptional()
  @IsBoolean()
  consent?: boolean;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  work_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contact_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  organization?: string;

  @IsOptional()
  @IsIn(['us', 'eu', 'uk', 'apac', 'undecided'])
  market?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  topic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  document_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  purpose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  use_case?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  request_summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  asset_band?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  ingestion_band?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  persona?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  topic_ids?: string[];

  @IsOptional()
  @IsBoolean()
  transcript_share?: boolean;

  @IsOptional()
  @IsBoolean()
  marketing_opt_in?: boolean;
}

export class SummaryPreviewDto {
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  lines!: string[];
}

export class SubmissionStatusDto {
  @IsString()
  @MaxLength(64)
  public_reference!: string;

  @IsString()
  @MaxLength(128)
  status_token!: string;
}
