import 'dotenv/config';
import * as http from 'http';
import { createHmac, randomUUID } from 'crypto';
import { Client } from 'pg';
import { declarePlatformSession } from '../libs/database/src';

/**
 * Sustained-rate load test against the real ingestion path.
 *
 * The existing benchmark (benchmark-detection-pipeline.ts) calls
 * `rule.evaluate()` in a loop inside one process. It never opens a socket,
 * never serializes an event, never touches Kafka or Postgres, and never
 * involves shield-ingest at all. It measures how fast a pure function runs,
 * which is not what the scale envelope is about, and reporting its numbers as
 * throughput would overstate the platform by orders of magnitude.
 *
 * This drives real HTTP webhooks at a target rate against a running
 * shield-ingest, then waits for the asynchronous pipeline behind it to drain,
 * and reports what actually happened:
 *
 *   - offered vs accepted rate, and why requests were refused
 *   - request latency percentiles measured at the client
 *   - how many events reached NormalizedEvent, and how long the backlog took
 *     to clear after the load stopped
 *
 * A number this produces is a measurement of this machine and this
 * deployment. It is not a claim about production capacity, and the report
 * says so.
 *
 *   npm run loadtest:ingestion -- --rate 500 --seconds 30 \
 *     --tenant <uuid> --connector <uuid>
 */

type Args = {
  rate: number;
  seconds: number;
  connections: number;
  tenantId: string;
  connectorId: string;
  host: string;
  port: number;
  drainTimeoutMs: number;
};

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      flags.set(argv[i].slice(2), argv[i + 1] ?? '');
      i += 1;
    }
  }
  const required = (name: string): string => {
    const value = flags.get(name);
    if (!value) throw new Error(`--${name} is required`);
    return value;
  };
  return {
    rate: Number(flags.get('rate') ?? 200),
    seconds: Number(flags.get('seconds') ?? 30),
    connections: Number(flags.get('connections') ?? 64),
    tenantId: required('tenant'),
    connectorId: required('connector'),
    host: flags.get('host') ?? '127.0.0.1',
    port: Number(flags.get('port') ?? 3002),
    drainTimeoutMs: Number(flags.get('drain-timeout-ms') ?? 120_000),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

async function normalizedEventCount(
  client: Client,
  tenantId: string,
): Promise<number> {
  const result = await client.query(
    'SELECT count(*)::int AS count FROM ingest."NormalizedEvent" WHERE tenant_id = $1',
    [tenantId],
  );
  return result.rows[0].count as number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const secret = process.env.WEBHOOK_HMAC_SECRET;
  if (!secret) {
    throw new Error(
      'WEBHOOK_HMAC_SECRET must be set to the same value shield-ingest uses, or every request is rejected before it reaches the pipeline.',
    );
  }

  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgres://shield:shield@localhost:5433/shield_core';
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  await declarePlatformSession(db, 'ingestion load test');

  const baselineNormalized = await normalizedEventCount(db, args.tenantId);

  // Keep-alive matters: without it every request pays a fresh TCP handshake
  // and the test measures connection setup rather than the pipeline.
  const agent = new http.Agent({
    keepAlive: true,
    maxSockets: args.connections,
    maxFreeSockets: args.connections,
  });

  const latencies: number[] = [];
  const statusCounts = new Map<number, number>();
  const errorCounts = new Map<string, number>();
  let sent = 0;
  let accepted = 0;
  let inFlight = 0;
  let maxInFlight = 0;

  const path = `/api/v1/ingestion/webhooks/${args.connectorId}`;

  const sendOne = (sequence: number): Promise<void> =>
    new Promise<void>((resolve) => {
      const body = JSON.stringify({
        eventClass: 'AUTHENTICATION',
        eventCategory: 'IDENTITY_AND_ACCESS',
        activity: 'SIGN_IN',
        outcome: sequence % 4 === 0 ? 'FAILURE' : 'SUCCESS',
        severity: 'MEDIUM',
        actorEmail: `loadtest-${sequence % 500}@example.test`,
        sourceIp: `198.51.100.${sequence % 254}`,
        eventId: `loadtest-${sequence}-${randomUUID()}`,
      });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = randomUUID();
      const signature = createHmac('sha256', secret)
        .update(`${timestamp}.${nonce}.${body}`)
        .digest('hex');

      const started = process.hrtime.bigint();
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      const request = http.request(
        {
          agent,
          host: args.host,
          port: args.port,
          path,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
            'x-tenant-id': args.tenantId,
            'x-webhook-signature': `sha256=${signature}`,
            'x-timestamp': timestamp,
            'x-webhook-nonce': nonce,
          },
        },
        (response) => {
          response.resume();
          response.on('end', () => {
            const elapsedMs =
              Number(process.hrtime.bigint() - started) / 1_000_000;
            latencies.push(elapsedMs);
            const status = response.statusCode ?? 0;
            statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
            if (status === 202 || status === 200 || status === 201) {
              accepted += 1;
            }
            inFlight -= 1;
            resolve();
          });
        },
      );

      request.on('error', (err) => {
        const key = (err as NodeJS.ErrnoException).code ?? err.message;
        errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
        inFlight -= 1;
        resolve();
      });

      request.end(body);
    });

  console.log(
    `\nOffering ${args.rate} events/sec for ${args.seconds}s to http://${args.host}:${args.port}${path}\n`,
  );

  const pending: Promise<void>[] = [];
  const startedAt = Date.now();
  const intervalMs = 1000;
  const runDeadline = startedAt + args.seconds * 1000;

  // Paced in one-second batches. Each tick offers `rate` requests whether or
  // not the previous tick finished: the point is to hold the offered rate
  // steady and see what the service does with it, not to back off and report
  // a number the service was never asked to sustain.
  for (let tick = 0; Date.now() < runDeadline; tick += 1) {
    const tickStart = Date.now();
    for (let i = 0; i < args.rate; i += 1) {
      pending.push(sendOne(sent));
      sent += 1;
    }
    const elapsed = Date.now() - tickStart;
    if (elapsed < intervalMs) {
      await new Promise((r) => setTimeout(r, intervalMs - elapsed));
    }
  }

  const offerEndedAt = Date.now();
  await Promise.all(pending);
  const allRepliedAt = Date.now();

  latencies.sort((a, b) => a - b);
  const offerSeconds = (offerEndedAt - startedAt) / 1000;
  const wallSeconds = (allRepliedAt - startedAt) / 1000;

  // Now wait for the asynchronous half: accepted is not processed.
  const drainStart = Date.now();
  let normalized = await normalizedEventCount(db, args.tenantId);
  let lastSeen = normalized;
  let stableFor = 0;
  while (
    normalized - baselineNormalized < accepted &&
    Date.now() - drainStart < args.drainTimeoutMs
  ) {
    await new Promise((r) => setTimeout(r, 2000));
    normalized = await normalizedEventCount(db, args.tenantId);
    if (normalized === lastSeen) {
      stableFor += 2000;
      // Stopped moving well short of the target: the backlog is not draining,
      // which is a result, not a reason to keep waiting.
      if (stableFor >= 20_000) break;
    } else {
      stableFor = 0;
      lastSeen = normalized;
    }
  }
  const drainSeconds = (Date.now() - drainStart) / 1000;
  const processed = normalized - baselineNormalized;

  await db.end();

  const line = '─'.repeat(72);
  console.log(line);
  console.log(' INGESTION LOAD TEST RESULT');
  console.log(line);
  console.log(`  target rate          ${args.rate}/sec for ${args.seconds}s`);
  console.log(
    `  offered              ${sent} requests over ${offerSeconds.toFixed(1)}s`,
  );
  console.log(`  accepted (2xx)       ${accepted}`);
  console.log(`  achieved offer rate  ${(sent / offerSeconds).toFixed(0)}/sec`);
  console.log(
    `  achieved accept rate ${(accepted / wallSeconds).toFixed(0)}/sec (over ${wallSeconds.toFixed(1)}s to last reply)`,
  );
  console.log(
    `  peak in-flight       ${maxInFlight} (socket pool ${args.connections})`,
  );
  console.log('');
  console.log('  request latency measured at the client');
  console.log(
    `    p50                ${percentile(latencies, 50).toFixed(1)} ms`,
  );
  console.log(
    `    p95                ${percentile(latencies, 95).toFixed(1)} ms`,
  );
  console.log(
    `    p99                ${percentile(latencies, 99).toFixed(1)} ms`,
  );
  console.log(
    `    max                ${(latencies[latencies.length - 1] ?? 0).toFixed(1)} ms`,
  );
  console.log('');
  console.log('  responses by status');
  for (const [status, count] of [...statusCounts].sort((a, b) => a[0] - b[0])) {
    console.log(`    ${status}              ${count}`);
  }
  if (errorCounts.size > 0) {
    console.log('  transport errors');
    for (const [code, count] of errorCounts) {
      console.log(`    ${code}              ${count}`);
    }
  }
  console.log('');
  console.log('  pipeline behind the 202');
  console.log(`    normalized events  ${processed} of ${accepted} accepted`);
  console.log(
    `    drain time         ${drainSeconds.toFixed(1)}s after load stopped`,
  );
  if (processed < accepted) {
    console.log(
      `    BACKLOG            ${accepted - processed} accepted events never reached NormalizedEvent`,
    );
  }
  console.log(line);
  console.log(
    '  These figures describe this machine and this deployment. They are not\n' +
      '  a production capacity claim, and nothing here has been extrapolated.',
  );
  console.log(line + '\n');

  // A run that could not sustain the offered rate, or left a backlog, is a
  // failed run — it must not pass silently in CI.
  if (accepted < sent) process.exitCode = 1;
  if (processed < accepted) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
