import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import type { StreamingEventType } from '../live-telemetry-stream.service';

export class BroadcastStreamEventDto {
  @IsString()
  @IsNotEmpty()
  eventType!: StreamingEventType;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsObject()
  payload!: Record<string, any>;
}

export class TriggerSimulatedEventDto {
  @IsString()
  @IsNotEmpty()
  eventType!: 'ALERT' | 'JIT' | 'MERKLE' | 'FREEZE';

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsObject()
  customPayload?: Record<string, any>;
}
