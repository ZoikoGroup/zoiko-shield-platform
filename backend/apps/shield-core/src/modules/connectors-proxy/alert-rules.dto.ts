import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** The event fields a tenant may write conditions about. */
export const ALERT_RULE_FIELDS = [
  'event_class',
  'event_category',
  'event_activity',
  'severity',
  'actor_user_id',
  'actor_email',
  'source_ip',
  'destination_ip',
  'resource_id',
  'resource_type',
  'action',
  'outcome',
] as const;

export const ALERT_RULE_OPERATORS = [
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'IN',
] as const;

export const ALERT_RULE_SEVERITIES = [
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
] as const;

const MAX_VALUE_LENGTH = 200;
const MAX_IN_VALUES = 25;

/** A condition value is a short string, or (for IN) a short list of them. */
@ValidatorConstraint({ name: 'isConditionValue', async: false })
export class ConditionValueConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const ok = (v: unknown) =>
      typeof v === 'string' && v.length > 0 && v.length <= MAX_VALUE_LENGTH;
    if ((args.object as { operator?: string })?.operator === 'IN') {
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.length <= MAX_IN_VALUES &&
        value.every(ok)
      );
    }
    return ok(value);
  }

  defaultMessage(): string {
    return `value must be text up to ${MAX_VALUE_LENGTH} characters (a list of up to ${MAX_IN_VALUES} for IN)`;
  }
}

export class AlertConditionDto {
  @IsIn(ALERT_RULE_FIELDS)
  field!: (typeof ALERT_RULE_FIELDS)[number];

  @IsIn(ALERT_RULE_OPERATORS)
  operator!: (typeof ALERT_RULE_OPERATORS)[number];

  @Validate(ConditionValueConstraint)
  value!: string | string[];
}

class AlertRuleBase {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AlertConditionDto)
  conditions!: AlertConditionDto[];

  /** Alert only after this many matching events within `windowMinutes`. */
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(1000)
  threshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  windowMinutes?: number;
}

export class CreateAlertRuleDto extends AlertRuleBase {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsIn(ALERT_RULE_SEVERITIES)
  severity!: (typeof ALERT_RULE_SEVERITIES)[number];
}

export class UpdateAlertRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(ALERT_RULE_SEVERITIES)
  severity?: (typeof ALERT_RULE_SEVERITIES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AlertConditionDto)
  conditions?: AlertConditionDto[];

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(1000)
  threshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  windowMinutes?: number;
}

export class PreviewAlertRuleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AlertConditionDto)
  conditions!: AlertConditionDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class SetAlertRuleEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}
