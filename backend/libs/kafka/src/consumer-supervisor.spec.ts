import { ConsumerSupervisor, MAX_BACKOFF_MS, STABLE_AFTER_MS } from './consumer-supervisor';

type Listeners = Record<string, (e?: any) => void>;
interface FakeConsumer {
  events: Record<string, string>;
  listeners: Listeners;
  on: jest.Mock;
  connect: jest.Mock;
  subscribe: jest.Mock;
  run: jest.Mock;
  disconnect: jest.Mock;
}

const fake = (connect?: jest.Mock): FakeConsumer => {
  const listeners: Listeners = {};
  return {
    events: { CRASH: 'crash', GROUP_JOIN: 'join', STOP: 'stop' },
    listeners,
    on: jest.fn((event: string, cb: (e?: any) => void) => {
      listeners[event] = cb;
    }),
    connect: connect ?? jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
};

/** A supervisor whose consumers come from `queue` (the last one repeats). */
function build(queue: FakeConsumer[], topics = ['a.v1', 'b.v1']) {
  const built: FakeConsumer[] = [];
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const eachMessage = jest.fn().mockResolvedValue(undefined);
  const supervisor = new ConsumerSupervisor({
    name: 'test-service',
    topics: () => topics,
    buildConsumer: () => {
      const next = queue[Math.min(built.length, queue.length - 1)];
      built.push(next);
      return next as any;
    },
    eachMessage,
    logger,
  });
  return { supervisor, built, logger, eachMessage };
}
const settle = () => jest.advanceTimersByTimeAsync(0);

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('ConsumerSupervisor: starting', () => {
  it('connects, subscribes to every topic, runs, and reports running', async () => {
    const c = fake();
    const { supervisor, eachMessage, logger } = build([c]);
    supervisor.start();
    await settle();

    expect(c.connect).toHaveBeenCalledTimes(1);
    expect(c.subscribe).toHaveBeenCalledWith({ topic: 'a.v1', fromBeginning: false });
    expect(c.subscribe).toHaveBeenCalledWith({ topic: 'b.v1', fromBeginning: false });
    expect(c.run).toHaveBeenCalledWith({ eachMessage });
    expect(supervisor.getStatus()).toMatchObject({ running: true, lastError: null, attempts: 1, topics: ['a.v1', 'b.v1'] });
    expect(supervisor.getStatus().lastStartedAt).not.toBeNull();
    expect(logger.log).toHaveBeenCalledWith('Kafka consumer subscribed to: a.v1, b.v1');
    await supervisor.stop();
  });

  it('start() returns at once: the application is never held up by Kafka', async () => {
    const stuck = fake(jest.fn(() => new Promise(() => undefined)));
    const { supervisor } = build([stuck]);
    expect(supervisor.start()).toBeUndefined();
    await settle();
    expect(supervisor.getStatus().running).toBe(false);
    await supervisor.stop(); // and shutdown is not held up either
  });
});

describe('ConsumerSupervisor: recovery (the reported bug)', () => {
  it('retries while the broker is down, then recovers', async () => {
    const down = () => fake(jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND redpanda')));
    const up = fake();
    const { supervisor, built, logger } = build([down(), down(), up]);
    supervisor.start();

    await settle();
    expect(supervisor.getStatus()).toMatchObject({ running: false, lastError: 'getaddrinfo ENOTFOUND redpanda', attempts: 1 });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Retrying in 1000 ms'));

    await jest.advanceTimersByTimeAsync(1_000);
    expect(built).toHaveLength(2);
    expect(supervisor.getStatus().running).toBe(false);
    expect(logger.error).toHaveBeenLastCalledWith(expect.stringContaining('Retrying in 2000 ms'));

    await jest.advanceTimersByTimeAsync(2_000);
    expect(built).toHaveLength(3);
    expect(supervisor.getStatus()).toMatchObject({ running: true, lastError: null, attempts: 3 });
    expect(up.run).toHaveBeenCalledTimes(1);
    await supervisor.stop();
  });

  it('doubles the wait each time, never waiting longer than the cap', async () => {
    const { supervisor, built } = build([fake(jest.fn().mockRejectedValue(new Error('down')))]);
    supervisor.start();
    await settle();
    for (const wait of [1_000, 2_000, 4_000, 8_000, 16_000, MAX_BACKOFF_MS, MAX_BACKOFF_MS]) {
      const before = built.length;
      await jest.advanceTimersByTimeAsync(wait - 1);
      expect(built.length).toBe(before); // not early
      await jest.advanceTimersByTimeAsync(1);
      expect(built.length).toBe(before + 1); // exactly on time
    }
    await supervisor.stop();
  });

  it('subscribing failing is also retried (not only connecting)', async () => {
    const a = fake();
    a.subscribe.mockRejectedValue(new Error('topic not available'));
    const b = fake();
    const { supervisor } = build([a, b]);
    supervisor.start();
    await settle();
    expect(supervisor.getStatus().lastError).toBe('topic not available');
    await jest.advanceTimersByTimeAsync(1_000);
    expect(supervisor.getStatus().running).toBe(true);
    await supervisor.stop();
  });

  it('starts a replacement when a consumer crashes for good', async () => {
    const a = fake();
    const b = fake();
    const { supervisor, built } = build([a, b]);
    supervisor.start();
    await settle();

    a.listeners.crash({ payload: { error: new Error('group coordinator lost'), restart: false } });
    await settle();
    expect(supervisor.getStatus()).toMatchObject({ running: false, lastError: 'group coordinator lost' });
    expect(a.disconnect).toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2_000);
    expect(built).toHaveLength(2);
    expect(b.run).toHaveBeenCalledTimes(1);
    expect(supervisor.getStatus().running).toBe(true);
    await supervisor.stop();
  });

  it('leaves a crash that kafkajs restarts itself alone, and tracks when it rejoins', async () => {
    const a = fake();
    const { supervisor, built } = build([a]);
    supervisor.start();
    await settle();

    a.listeners.crash({ payload: { error: new Error('rebalance'), restart: true } });
    expect(supervisor.getStatus().running).toBe(false); // not consuming until it rejoins
    await jest.advanceTimersByTimeAsync(10_000);
    expect(built).toHaveLength(1); // kafkajs handles this one: no second consumer

    a.listeners.join();
    expect(supervisor.getStatus().running).toBe(true);
    await supervisor.stop();
  });

  it('a consumer that stayed up proves itself: its next failure starts from the short wait again', async () => {
    const first = fake();
    const rest = fake(jest.fn().mockRejectedValue(new Error('down')));
    const { supervisor, built } = build([first, rest]);
    supervisor.start();
    await settle();
    await jest.advanceTimersByTimeAsync(STABLE_AFTER_MS + 1);
    first.listeners.crash({ payload: { error: new Error('lost'), restart: false } });
    await settle();
    await jest.advanceTimersByTimeAsync(1_000); // short wait, not a long one
    expect(built).toHaveLength(2);
    await supervisor.stop();
  });

  it('a consumer that keeps dying straight after starting gets longer waits, not a hot loop', async () => {
    const flapping = fake();
    const { supervisor, built } = build([flapping]);
    const die = async () => {
      flapping.listeners.crash({ payload: { error: new Error('lost'), restart: false } });
      await settle();
    };
    supervisor.start();
    await settle();

    await die(); // first failure: wait 1 s
    await jest.advanceTimersByTimeAsync(999);
    expect(built).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(built).toHaveLength(2);

    await die(); // it died again straight away: the wait has grown to 2 s, not reset to 1 s
    await jest.advanceTimersByTimeAsync(1_999);
    expect(built).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(built).toHaveLength(3);
    await supervisor.stop();
  });
});

describe('ConsumerSupervisor: shutting down', () => {
  it('disconnects, cancels a pending retry, and starts nothing new', async () => {
    const down = fake(jest.fn().mockRejectedValue(new Error('down')));
    const { supervisor, built } = build([down]);
    supervisor.start();
    await settle(); // now waiting to retry
    await supervisor.stop();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(built).toHaveLength(1);
    expect(down.disconnect).toHaveBeenCalled();
    expect(supervisor.getStatus().running).toBe(false);
  });

  it('shuts down a healthy consumer', async () => {
    const c = fake();
    const { supervisor } = build([c]);
    supervisor.start();
    await settle();
    await supervisor.stop();
    expect(c.disconnect).toHaveBeenCalled();
    expect(supervisor.getStatus().running).toBe(false);
  });

  it('does not report an error for a connection attempt that fails because we are shutting down', async () => {
    let rejectConnect!: (e: Error) => void;
    const stuck = fake(jest.fn(() => new Promise((_, reject) => (rejectConnect = reject))));
    const { supervisor, logger } = build([stuck]);
    supervisor.start();
    await settle();
    await supervisor.stop();
    rejectConnect(new Error('connection closed by disconnect'));
    await settle();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('stop() before start() is harmless', async () => {
    const { supervisor } = build([fake()]);
    await expect(supervisor.stop()).resolves.toBeUndefined();
  });
});
