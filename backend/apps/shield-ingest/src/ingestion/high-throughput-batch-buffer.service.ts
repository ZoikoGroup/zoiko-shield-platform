import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { KafkaProducerService } from '../kafka/kafka.producer.service';
import { MeteringService } from '../metering/metering.service';

export interface BufferedTelemetryEvent {
  eventId?: string;
  source?: string;
  eventType?: string;
  timestamp?: string;
  payload: Record<string, any>;
  tenantId?: string;
  environmentId?: string;
}

export interface BufferedRawEvent {
  batchEventId: string;
  tenantId: string;
  environmentId: string;
  connectorId: string;
  sourceEventId?: string;
  eventType?: string;
  payload: Record<string, any>;
  receivedAt: string;
  payloadHash: string;
}

export interface BatchFlushReceipt {
  batchId: string;
  flushedEventsCount: number;
  tenantId: string;
  batchRootHash: string;
  flushedAt: string;
  durationMs: number;
}

export interface IngestBufferMetrics {
  totalEventsEnqueued: number;
  totalBatchesFlushed: number;
  currentPendingEvents: number;
  averageBatchSize: number;
  lastFlushTimestampIso: string | null;
}

export interface BufferStats {
  currentQueueLength: number;
  maxBufferSize: number;
  occupancyRatio: number;
  totalFlushed: number;
  totalDropped: number;
  backpressureState: boolean;
}

@Injectable()
export class HighThroughputBatchBufferService implements OnModuleDestroy {
  private readonly logger = new Logger(HighThroughputBatchBufferService.name);

  private readonly buffer: BufferedRawEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly maxBatchSize: number = 1000;
  private readonly maxBufferSize: number = 50000;
  private readonly maxWaitMs: number = 100;

  private totalEventsEnqueued = 0;
  private totalBatchesFlushed = 0;
  private totalDropped = 0;
  private lastFlushIso: string | null = null;

  constructor(
    @Optional() private readonly kafkaProducer?: KafkaProducerService,
    @Optional() private readonly meteringService?: MeteringService,
  ) {
    this.scheduleNextFlush();
  }

  onModuleDestroy() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushBufferSync();
  }

  /**
   * Enqueues a batch of incoming telemetry events with high-throughput lock-free micro-buffering.
   */
  async ingestBatch(
    tenantId: string,
    events: BufferedTelemetryEvent[],
  ): Promise<{
    acceptedCount: number;
    droppedCount: number;
    bufferOccupancyRatio: number;
    backpressureTriggered: boolean;
  }> {
    let accepted = 0;
    let dropped = 0;

    for (const evt of events) {
      if (this.buffer.length >= this.maxBufferSize) {
        dropped += 1;
        this.totalDropped += 1;
        continue;
      }

      this.enqueueEvent(
        tenantId,
        evt.environmentId || 'production',
        evt.source || 'batch-stream',
        evt.payload || {},
        evt.eventId,
        evt.eventType,
      );
      accepted += 1;
    }

    const occupancy = this.buffer.length / this.maxBufferSize;
    const backpressure = occupancy > 0.8;

    return {
      acceptedCount: accepted,
      droppedCount: dropped,
      bufferOccupancyRatio: Number(occupancy.toFixed(4)),
      backpressureTriggered: backpressure,
    };
  }

  /**
   * Enqueues an incoming raw telemetry event into the high-throughput micro-batch buffer.
   * Auto-flushes immediately if buffer reaches maxBatchSize.
   */
  enqueueEvent(
    tenantId: string,
    environmentId: string,
    connectorId: string,
    payload: Record<string, any>,
    sourceEventId?: string,
    eventType?: string,
  ): { batchEventId: string; queued: boolean; currentBufferDepth: number } {
    const canonicalPayload = JSON.stringify(payload || {});
    const payloadHash = createHash('sha256').update(canonicalPayload).digest('hex');
    const batchEventId = `bev-${randomUUID()}`;

    const record: BufferedRawEvent = {
      batchEventId,
      tenantId: tenantId || 'tenant-default',
      environmentId: environmentId || 'default-env',
      connectorId: connectorId || 'generic-connector',
      sourceEventId,
      eventType: eventType || 'RAW_TELEMETRY_LOG',
      payload: payload || {},
      receivedAt: new Date().toISOString(),
      payloadHash,
    };

    this.buffer.push(record);
    this.totalEventsEnqueued += 1;

    if (this.buffer.length >= this.maxBatchSize) {
      this.flushBufferSync();
    }

    return {
      batchEventId,
      queued: true,
      currentBufferDepth: this.buffer.length,
    };
  }

  /**
   * Flushes current buffered events as an atomic batch.
   */
  flushBufferSync(): BatchFlushReceipt | null {
    if (this.buffer.length === 0) {
      this.scheduleNextFlush();
      return null;
    }

    const startTime = Date.now();
    const batchEvents = this.buffer.splice(0, this.maxBatchSize);
    const batchId = `batch-${randomUUID()}`;

    // Compute cryptographic Merkle-like root hash for the micro-batch
    const hasher = createHash('sha256');
    for (const evt of batchEvents) {
      hasher.update(evt.payloadHash);
    }
    const batchRootHash = hasher.digest('hex');

    const primaryTenantId = batchEvents[0]?.tenantId || 'tenant-default';

    // Publish to high-speed ingestion pipeline topic if Kafka is available
    if (this.kafkaProducer) {
      try {
        for (const evt of batchEvents) {
          this.kafkaProducer.emit(
            'shield.raw.events',
            {
              tenantId: evt.tenantId,
              batchId,
              event: evt,
              batchRootHash,
            },
          );
        }
      } catch (err: any) {
        this.logger.error(`[HIGH_THROUGHPUT_BUFFER] Failed to publish batch ${batchId}: ${err.message}`);
      }
    }

    // Record high-speed ingestion metering in batch
    if (this.meteringService) {
      try {
        this.meteringService.recordUsageObservation({
          tenantId: primaryTenantId,
          sourceType: 'INGESTION_RAW_EVENTS',
          acceptedQuantity: batchEvents.length,
          unit: 'events',
          usageState: 'ACCEPTED',
        });
      } catch (err: any) {
        this.logger.warn(`[HIGH_THROUGHPUT_BUFFER] Metering batch recording warning: ${err.message}`);
      }
    }

    this.totalBatchesFlushed += 1;
    this.lastFlushIso = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    this.logger.debug(
      `[HIGH_THROUGHPUT_BUFFER] Flushed batch '${batchId}' with ${batchEvents.length} events in ${durationMs}ms (Root: ${batchRootHash.substring(0, 12)}...)`,
    );

    this.scheduleNextFlush();

    return {
      batchId,
      flushedEventsCount: batchEvents.length,
      tenantId: primaryTenantId,
      batchRootHash,
      flushedAt: this.lastFlushIso,
      durationMs,
    };
  }

  getMetrics(): IngestBufferMetrics {
    const avg =
      this.totalBatchesFlushed > 0
        ? Math.round(this.totalEventsEnqueued / this.totalBatchesFlushed)
        : 0;

    return {
      totalEventsEnqueued: this.totalEventsEnqueued,
      totalBatchesFlushed: this.totalBatchesFlushed,
      currentPendingEvents: this.buffer.length,
      averageBatchSize: avg,
      lastFlushTimestampIso: this.lastFlushIso,
    };
  }

  getBufferStats(): BufferStats {
    const occupancy = this.buffer.length / this.maxBufferSize;
    return {
      currentQueueLength: this.buffer.length,
      maxBufferSize: this.maxBufferSize,
      occupancyRatio: Number(occupancy.toFixed(4)),
      totalFlushed: this.totalEventsEnqueued - this.buffer.length,
      totalDropped: this.totalDropped,
      backpressureState: occupancy > 0.8,
    };
  }

  private scheduleNextFlush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flushBufferSync();
    }, this.maxWaitMs);
    if (this.flushTimer && typeof this.flushTimer.unref === 'function') {
      this.flushTimer.unref();
    }
  }
}
