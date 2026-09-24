import { Kafka, logLevel, type KafkaConfig, type SASLOptions } from 'kafkajs';

/**
 * One place that builds a Kafka client, for all eight call sites across the
 * five services.
 *
 * Every one of them previously did this:
 *
 *   brokers: [process.env.KAFKA_BROKERS || 'localhost:9092']
 *
 * which has two problems that only show up outside a single-node local stack.
 * A comma-separated list of brokers became one array element, so
 * `a:9092,b:9092` was treated as a single hostname and a multi-broker cluster
 * could not be reached at all. And there was no TLS and no SASL, so any
 * managed Kafka — including Google's Managed Service for Apache Kafka, which
 * requires SASL_SSL — was unreachable.
 *
 * Defaults are unchanged for local development: no TLS, no SASL, localhost.
 */

function brokers(): string[] {
  return (process.env.KAFKA_BROKERS || 'localhost:9092')
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);
}

/**
 * Google issues short-lived OAuth tokens, so this is called per connection
 * and per reconnect rather than cached — a token cached past its expiry
 * reconnects as an auth failure that looks like a broker problem.
 */
function googleOAuthBearerProvider() {
  // Required lazily: a deployment not using Managed Kafka should not need the
  // auth library present or credentials resolvable.
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  return async () => {
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    if (!token?.token) {
      throw new Error(
        'Could not obtain a Google access token for Kafka SASL/OAUTHBEARER',
      );
    }
    return { value: token.token };
  };
}

function sasl(): SASLOptions | undefined {
  const mechanism = process.env.KAFKA_SASL_MECHANISM?.trim().toLowerCase();
  if (!mechanism) return undefined;

  if (mechanism === 'oauthbearer') {
    // How Google's Managed Service for Apache Kafka authenticates: the
    // attached service account's token, no username or password anywhere.
    return {
      mechanism: 'oauthbearer',
      oauthBearerProvider: googleOAuthBearerProvider(),
    } as SASLOptions;
  }

  const username = process.env.KAFKA_SASL_USERNAME;
  const password = process.env.KAFKA_SASL_PASSWORD;
  if (!username || !password) {
    throw new Error(
      `KAFKA_SASL_MECHANISM=${mechanism} requires KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD`,
    );
  }
  if (!['plain', 'scram-sha-256', 'scram-sha-512'].includes(mechanism)) {
    throw new Error(
      `Unsupported KAFKA_SASL_MECHANISM '${mechanism}'. Use plain, scram-sha-256, scram-sha-512 or oauthbearer.`,
    );
  }
  return { mechanism, username, password } as SASLOptions;
}

export function kafkaConfig(clientId: string): KafkaConfig {
  const saslOptions = sasl();
  return {
    clientId,
    brokers: brokers(),
    // SASL over a plaintext connection would put the credential on the wire,
    // so TLS is implied by it rather than left to a second variable someone
    // can forget.
    ssl: process.env.KAFKA_SSL === 'true' || Boolean(saslOptions),
    ...(saslOptions ? { sasl: saslOptions } : {}),
    logLevel: logLevel.ERROR,
  };
}

export function createKafka(clientId: string): Kafka {
  return new Kafka(kafkaConfig(clientId));
}
