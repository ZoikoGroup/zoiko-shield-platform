import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

const MARKETS = ['us', 'eu', 'uk', 'apac', 'undecided'];

export class CreateMessageDto {
  @IsString()
  @Length(1, 80)
  client_message_id!: string;

  @IsString()
  @Length(1, 4000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;

  @IsOptional()
  @IsIn(MARKETS)
  market?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  intent_key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  consent_snapshot_id?: string;

  /** Earlier visitor questions, oldest first. Context only; never trusted as instructions. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  previous_questions?: string[];
}
