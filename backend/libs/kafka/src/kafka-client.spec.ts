import { kafkaConfig } from './kafka-client';

describe('kafkaConfig', () => {
  const saved = { ...process.env };

  afterEach(() => {
    for (const key of [
      'KAFKA_BROKERS',
      'KAFKA_SSL',
      'KAFKA_SASL_MECHANISM',
      'KAFKA_SASL_USERNAME',
      'KAFKA_SASL_PASSWORD',
    ]) {
      delete process.env[key];
      if (saved[key] !== undefined) process.env[key] = saved[key];
    }
  });

  it('defaults to a local plaintext broker', () => {
    delete process.env.KAFKA_BROKERS;
    const config = kafkaConfig('test');
    expect(config.brokers).toEqual(['localhost:9092']);
    expect(config.ssl).toBe(false);
    expect((config as { sasl?: unknown }).sasl).toBeUndefined();
  });

  it('splits a comma-separated broker list', () => {
    // Every call site previously wrapped the whole string in a single-element
    // array, so a multi-broker cluster was treated as one hostname and could
    // not be reached at all.
    process.env.KAFKA_BROKERS = 'a:9092,b:9092, c:9092';
    expect(kafkaConfig('test').brokers).toEqual(['a:9092', 'b:9092', 'c:9092']);
  });

  it('enables TLS on request', () => {
    process.env.KAFKA_SSL = 'true';
    expect(kafkaConfig('test').ssl).toBe(true);
  });

  it('implies TLS whenever SASL is configured', () => {
    // SASL over plaintext would put the credential on the wire. Not left to a
    // second variable somebody can forget.
    process.env.KAFKA_SASL_MECHANISM = 'plain';
    process.env.KAFKA_SASL_USERNAME = 'user';
    process.env.KAFKA_SASL_PASSWORD = 'pass';
    const config = kafkaConfig('test');
    expect(config.ssl).toBe(true);
    expect(config.sasl).toMatchObject({ mechanism: 'plain', username: 'user' });
  });

  it('refuses a SASL mechanism with no credentials', () => {
    process.env.KAFKA_SASL_MECHANISM = 'scram-sha-512';
    delete process.env.KAFKA_SASL_USERNAME;
    expect(() => kafkaConfig('test')).toThrow(/requires KAFKA_SASL_USERNAME/);
  });

  it('refuses an unsupported SASL mechanism', () => {
    process.env.KAFKA_SASL_MECHANISM = 'kerberos';
    process.env.KAFKA_SASL_USERNAME = 'user';
    process.env.KAFKA_SASL_PASSWORD = 'pass';
    expect(() => kafkaConfig('test')).toThrow(/Unsupported KAFKA_SASL_MECHANISM/);
  });

  it('configures OAUTHBEARER without a username or password', () => {
    // How Google's Managed Service for Apache Kafka authenticates: the
    // attached service account's token, no static credential anywhere.
    process.env.KAFKA_SASL_MECHANISM = 'oauthbearer';
    const config = kafkaConfig('test');
    expect(config.ssl).toBe(true);
    expect(config.sasl).toMatchObject({ mechanism: 'oauthbearer' });
    expect(
      typeof (config.sasl as { oauthBearerProvider?: unknown })
        .oauthBearerProvider,
    ).toBe('function');
  });
});
