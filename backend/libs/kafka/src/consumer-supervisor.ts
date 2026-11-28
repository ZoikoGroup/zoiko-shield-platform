import type { Consumer, EachMessagePayload } from 'kafkajs';

/** How long to wait before the first retry, and the longest wait between retries. */
export const INITIAL_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 30_000;
/** A consumer that stayed up this long counts as having recovered: the backoff starts over. */
export const STABLE_AFTER_MS = 60_000;

export interface ConsumerStatus {
  /** Topics being consumed. */
  topics: string[];
  /** True while the consumer is connected, subscribed and has joined its group. */
  running: boolean;
  lastError: string | null;
  lastStartedAt: string | null;
  /** How many consumers have been started (1 = it never had to retry). */
  attempts: number;
}

export interface ConsumerSupervisorOptions {
  /** Used in log lines. */
  name: string;
  /** Called at start; the consumer subscribes to these. */
  topics: () => string[];
  /** A fresh consumer for each attempt. */
  buildConsumer: () => Consumer;
  eachMessage: (payload: EachMessagePayload) => Promise<void>;
  logger: {
    log: (m: string) => void;
    warn: (m: string) => void;
    error: (m: string) => void;
  };
}

/**
 * Keeps a Kafka consumer alive.
 *
 * The services used to connect once at startup inside a try/catch that only logged a
 * failure. If the broker was not ready at that moment (both restart together after a
 * Docker or host restart), the consumer never started and nothing retried: everything fed
 * by it stalled silently while the service looked healthy.
 *
 * This runs the consumer under a supervisor that:
 *  - never blocks application startup (the app comes up even when Kafka is down);
 *  - retries forever with capped exponential backoff;
 *  - starts a replacement consumer if one crashes in a way kafkajs will not recover from;
 *  - reports its state through `getStatus()` so a health endpoint can show it;
 *  - stops promptly on shutdown, never waiting on the broker.
 */
export class ConsumerSupervisor {
  private stopping = false;
  private running = false;
  private lastError: string | null = null;
  private lastStartedAt: Date | null = null;
  private attempts = 0;
  private current: Consumer | null = null;
  private wake: (() => void) | null = null;
  private sleepTimer: NodeJS.Timeout | null = null;
  private sleepDone: (() => void) | null = null;

  constructor(private readonly options: ConsumerSupervisorOptions) {}

  /** Starts supervising in the background. Returns immediately. */
  start(): void {
    void this.supervise();
  }

  getStatus(): ConsumerStatus {
    return {
      topics: this.options.topics(),
      running: this.running,
      lastError: this.lastError,
      lastStartedAt: this.lastStartedAt?.toISOString() ?? null,
      attempts: this.attempts,
    };
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.wake?.();
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepDone?.();
    // The loop is not awaited: if the broker is unreachable it may be stuck inside
    // connect(), and shutdown must never wait on Kafka. It sees `stopping` and ends itself.
    await this.current?.disconnect().catch(() => undefined);
    this.running = false;
  }

  private async supervise(): Promise<void> {
    const { name, logger } = this.options;
    let delay = INITIAL_BACKOFF_MS;
    while (!this.stopping) {
      const consumer = this.options.buildConsumer();
      this.current = consumer;
      this.attempts += 1;
      let startedAt = 0;
      const topics = this.options.topics();
      try {
        const needsReplacing = this.watch(consumer);
        await consumer.connect();
        await Promise.all(
          topics.map((topic) =>
            consumer.subscribe({ topic, fromBeginning: false }),
          ),
        );
        await consumer.run({ eachMessage: this.options.eachMessage });
        startedAt = Date.now();
        this.running = true;
        this.lastError = null;
        this.lastStartedAt = new Date(startedAt);
        logger.log(`Kafka consumer subscribed to: ${topics.join(', ')}`);
        await needsReplacing;
        if (this.stopping) return;
        logger.warn(`${name}: Kafka consumer stopped; starting a new one.`);
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        // A failure caused by shutting down is expected, not an error worth reporting.
        if (this.stopping) return;
        logger.error(
          `${name}: Kafka consumer is not running: ${this.lastError}. Retrying in ${delay} ms.`,
        );
      } finally {
        this.running = false;
        await consumer.disconnect().catch(() => undefined);
      }
      if (this.stopping) return;
      // Wait `delay`, then double it for next time (capped). A consumer that stayed up long
      // enough has proved itself, so its next failure starts again from the short wait.
      const stable = startedAt > 0 && Date.now() - startedAt >= STABLE_AFTER_MS;
      const wait = stable ? INITIAL_BACKOFF_MS : delay;
      delay = stable ? INITIAL_BACKOFF_MS * 2 : Math.min(delay * 2, MAX_BACKOFF_MS);
      await this.sleep(wait);
    }
  }

  /**
   * Resolves when this consumer must be replaced. kafkajs restarts a consumer that hits a
   * retriable error by itself (`restart: true`): that only changes `running` until it has
   * rejoined its group. A crash it will not recover from, or a stop, needs a new one.
   */
  private watch(consumer: Consumer): Promise<void> {
    return new Promise<void>((resolve) => {
      this.wake = resolve;
      consumer.on(consumer.events.CRASH, (event: any) => {
        this.running = false;
        this.lastError = event?.payload?.error?.message ?? 'consumer crashed';
        this.options.logger.error(
          `${this.options.name}: Kafka consumer crashed: ${this.lastError}`,
        );
        if (event?.payload?.restart === false) resolve();
      });
      consumer.on(consumer.events.GROUP_JOIN, () => {
        this.running = true;
      });
      consumer.on(consumer.events.STOP, () => resolve());
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.sleepDone = resolve;
      this.sleepTimer = setTimeout(() => {
        this.sleepTimer = null;
        this.sleepDone = null;
        resolve();
      }, ms);
    });
  }
}
