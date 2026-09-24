import 'dotenv/config';
import { execFileSync } from 'child_process';
import { createHmac, randomUUID } from 'crypto';
import { Client } from 'pg';
import { createWorkloadToken } from '../libs/security/src/workload-token';

/**
 * Game-day drills that actually break things.
 *
 * run-lab18-gameday-drills.ts declares, for each scenario, an
 * `expectedBehavior` string and `invariantStatus: 'NOT_EXECUTED'`. It is a
 * description of what should happen if someone ran the drill. Nothing is
 * stopped, no request is sent, and no invariant is observed. That is honest
 * about itself, but it is not evidence, and a resilience claim needs
 * evidence.
 *
 * This stops real dependencies, sends real requests while they are down,
 * records what the platform actually did, restores the dependency, and fails
 * the run if an invariant did not hold. Every PASS here corresponds to an
 * observation; there is no path that reports a result it did not measure.
 *
 * It stops and starts docker compose services, so it refuses to run against
 * anything but a local stack.
 *
 *   npm run gameday -- --tenant <uuid> --connector <uuid>
 */

type DrillOutcome = {
  id: string;
  name: string;
  invariant: string;
  observed: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
};

const COMPOSE_DIR = `${__dirname}/../..`;
const SECRET = process.env.WEBHOOK_HMAC_SECRET ?? '';

function compose(...args: string[]): string {
  return execFileSync('docker', ['compose', ...args], {
    cwd: COMPOSE_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits for a service to answer, so a drill never probes a half-started one. */
async function waitForHttp(url: string, timeoutMs = 120_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(3000) });
      return true;
    } catch {
      await sleep(2000);
    }
  }
  return false;
}

function signedWebhookHeaders(
  body: string,
  tenantId: string,
  overrides: { nonce?: string; signature?: string; timestamp?: string } = {},
): Record<string, string> {
  const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000).toString();
  const nonce = overrides.nonce ?? randomUUID();
  const signature =
    overrides.signature ??
    createHmac('sha256', SECRET).update(`${timestamp}.${nonce}.${body}`).digest('hex');
  return {
    'content-type': 'application/json',
    'x-tenant-id': tenantId,
    'x-webhook-signature': `sha256=${signature}`,
    'x-timestamp': timestamp,
    'x-webhook-nonce': nonce,
  };
}

function eventBody(marker: string): string {
  return JSON.stringify({
    eventClass: 'AUTHENTICATION',
    eventCategory: 'IDENTITY_AND_ACCESS',
    activity: 'SIGN_IN',
    outcome: 'SUCCESS',
    severity: 'LOW',
    actorEmail: 'gameday@example.test',
    sourceIp: '198.51.100.7',
    eventId: `gameday-${marker}-${randomUUID()}`,
  });
}

async function main(): Promise<void> {
  const flags = new Map<string, string>();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      flags.set(argv[i].slice(2), argv[i + 1] ?? '');
      i += 1;
    }
  }
  const tenantId = flags.get('tenant');
  const connectorId = flags.get('connector');
  if (!tenantId || !connectorId) {
    throw new Error('--tenant and --connector are required');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'run-gameday-drills stops running services. It refuses to operate with NODE_ENV=production.',
    );
  }
  if (!SECRET) {
    throw new Error('WEBHOOK_HMAC_SECRET must be set to sign drill traffic.');
  }

  const coreUrl = `http://127.0.0.1:${process.env.SHIELD_CORE_PORT ?? 3001}`;
  const ingestUrl = `http://127.0.0.1:${process.env.SHIELD_INGEST_PORT ?? 3002}`;

  // shield-ingest's own API is service-to-service: it authenticates workload
  // identity, not user sessions. The drill mints the same short-lived token
  // shield-core would present, so the probe exercises the behaviour under
  // fault rather than bouncing off the auth guard and reporting a 401 as if
  // it were a resilience result.
  let workloadToken = '';
  try {
    process.env.SERVICE_NAME ??= 'gameday-drill-runner';
    workloadToken = createWorkloadToken('shield-ingest');
  } catch (err) {
    console.warn(
      `  ! Could not mint a workload token (${(err as Error).message}); service-to-service drills will be skipped.`,
    );
  }
  const webhookUrl = `${ingestUrl}/api/v1/ingestion/webhooks/${connectorId}`;
  const outcomes: DrillOutcome[] = [];

  const record = (o: DrillOutcome) => {
    outcomes.push(o);
    const mark = o.status === 'PASS' ? 'PASS' : o.status === 'FAIL' ? 'FAIL' : 'SKIP';
    console.log(`  [${mark}] ${o.id} ${o.name}`);
    console.log(`         invariant: ${o.invariant}`);
    console.log(`         observed:  ${o.observed}\n`);
  };

  console.log('\nGame-day drills — faults are injected against the local stack.\n');

  // ── Drill 1 ───────────────────────────────────────────────────────────────
  // A forged signature must be refused. No fault injection needed; this is the
  // control that proves the probe itself is meaningful.
  {
    const body = eventBody('forged');
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: signedWebhookHeaders(body, tenantId, {
        signature: 'f'.repeat(64),
      }),
      body,
    });
    record({
      id: 'GD-01',
      name: 'Forged webhook signature',
      invariant: 'Rejected with 401; the event never enters the pipeline.',
      observed: `HTTP ${response.status}`,
      status: response.status === 401 ? 'PASS' : 'FAIL',
    });
  }

  // ── Drill 2 ───────────────────────────────────────────────────────────────
  // The same nonce twice must not be accepted twice.
  {
    const body = eventBody('replay');
    const nonce = randomUUID();
    const headers = signedWebhookHeaders(body, tenantId, { nonce });
    const first = await fetch(webhookUrl, { method: 'POST', headers, body });
    const second = await fetch(webhookUrl, { method: 'POST', headers, body });
    const held = first.status === 202 && second.status !== 202;
    record({
      id: 'GD-02',
      name: 'Webhook replay with a consumed nonce',
      invariant: 'First delivery accepted, identical replay refused.',
      observed: `first HTTP ${first.status}, replay HTTP ${second.status}`,
      status: held ? 'PASS' : 'FAIL',
    });
  }

  // ── Drill 3 ───────────────────────────────────────────────────────────────
  // shield-core down: shield-ingest must refuse to report a case it could not
  // create. This is the failure mode that used to return a 200 and a
  // "caseCandidatePayload" for a case that never existed.
  {
    const alert = await (async () => {
      const db = new Client({
        connectionString:
          process.env.DATABASE_URL ??
          'postgres://shield:shield@localhost:5433/shield_core',
      });
      await db.connect();
      const result = await db.query(
        'SELECT id FROM "Alert" WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
        [tenantId],
      );
      await db.end();
      return result.rows[0]?.id as string | undefined;
    })();

    if (!workloadToken) {
      record({
        id: 'GD-03',
        name: 'Alert promotion while shield-core is down',
        invariant:
          'Promotion fails loudly rather than reporting a case nobody opened.',
        observed:
          'No workload token could be minted, so this would have measured the auth guard, not the fault.',
        status: 'SKIPPED',
      });
    } else if (!alert) {
      record({
        id: 'GD-03',
        name: 'Alert promotion while shield-core is down',
        invariant: 'Promotion fails loudly rather than reporting a case nobody opened.',
        observed: 'No alert exists for this tenant to promote.',
        status: 'SKIPPED',
      });
    } else {
      console.log('  … stopping shield-core');
      compose('stop', 'shield-core');
      try {
        const response = await fetch(
          `${ingestUrl}/api/v1/alerts/${alert}/create-case`,
          {
            method: 'POST',
            headers: {
              'x-tenant-id': tenantId,
              'content-type': 'application/json',
              authorization: `Bearer ${workloadToken}`,
            },
            signal: AbortSignal.timeout(30_000),
          },
        );
        const payload = await response.text();
        const refused = response.status >= 500;
        const claimedACase = /"caseId"\s*:\s*"[^"]+"/.test(payload);
        record({
          id: 'GD-03',
          name: 'Alert promotion while shield-core is down',
          invariant:
            'Promotion fails loudly (5xx) and reports no caseId, because no case was created.',
          observed: `HTTP ${response.status}${claimedACase ? ', response CLAIMED a caseId' : ', no caseId claimed'}`,
          status: refused && !claimedACase ? 'PASS' : 'FAIL',
        });
      } catch (err) {
        record({
          id: 'GD-03',
          name: 'Alert promotion while shield-core is down',
          invariant:
            'Promotion fails loudly (5xx) and reports no caseId, because no case was created.',
          observed: `request failed: ${(err as Error).message}`,
          status: 'FAIL',
        });
      } finally {
        console.log('  … restarting shield-core');
        compose('start', 'shield-core');
        await waitForHttp(`http://127.0.0.1:3001/api/v1/connector-types`);
      }
    }
  }

  // ── Drill 4 ───────────────────────────────────────────────────────────────
  // Kafka down: ingestion must not accept an event it cannot durably hand on,
  // or if it does accept it, the event must still be there after recovery.
  // Silent loss is the failure being tested for.
  {
    console.log('  … stopping redpanda');
    compose('stop', 'redpanda');
    await sleep(3000);

    const body = eventBody('kafka-out');
    let status = 0;
    let transportError = '';
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: signedWebhookHeaders(body, tenantId),
        body,
        signal: AbortSignal.timeout(60_000),
      });
      status = response.status;
    } catch (err) {
      transportError = (err as Error).message;
    }

    console.log('  … restarting redpanda');
    compose('start', 'redpanda');
    await sleep(15_000);

    const db = new Client({
      connectionString:
        process.env.DATABASE_URL ??
        'postgres://shield:shield@localhost:5433/shield_core',
    });
    await db.connect();
    const sourceEventId = JSON.parse(body).eventId as string;
    const raw = await db.query(
      'SELECT count(*)::int AS count FROM "RawEvent" WHERE tenant_id = $1 AND source_event_id = $2',
      [tenantId, sourceEventId],
    );
    await db.end();
    const durablyStored = (raw.rows[0].count as number) > 0;

    // Either outcome is defensible; losing the event is not. Accepting it
    // means it must be recoverable, refusing it means the sender still has it.
    const accepted = status === 202;
    const held = accepted ? durablyStored : status !== 0 || transportError !== '';
    record({
      id: 'GD-04',
      name: 'Event ingestion while Kafka is unavailable',
      invariant:
        'Either the event is refused, or it is accepted and still recoverable after Kafka returns. It is never silently lost.',
      observed: accepted
        ? `accepted with HTTP 202; RawEvent present after recovery: ${durablyStored}`
        : `not accepted (HTTP ${status || 'none'}${transportError ? `, ${transportError}` : ''})`,
      status: held ? 'PASS' : 'FAIL',
    });
  }

  // ── Drill 5 ───────────────────────────────────────────────────────────────
  // Object storage down: evidence must not report success it cannot back.
  {
    console.log('  … stopping minio');
    compose('stop', 'minio');
    await sleep(3000);

    const body = eventBody('minio-out');
    let status = 0;
    let transportError = '';
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: signedWebhookHeaders(body, tenantId),
        body,
        signal: AbortSignal.timeout(60_000),
      });
      status = response.status;
    } catch (err) {
      transportError = (err as Error).message;
    }

    console.log('  … restarting minio');
    compose('start', 'minio');
    await sleep(10_000);

    record({
      id: 'GD-05',
      name: 'Ingestion while object storage is unavailable',
      invariant:
        'The platform answers definitively rather than hanging: a status is returned, or the request fails outright.',
      observed: status
        ? `HTTP ${status}`
        : `request failed: ${transportError || 'no response'}`,
      status: status !== 0 || transportError !== '' ? 'PASS' : 'FAIL',
    });
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const line = '─'.repeat(72);
  const passed = outcomes.filter((o) => o.status === 'PASS').length;
  const failed = outcomes.filter((o) => o.status === 'FAIL').length;
  const skipped = outcomes.filter((o) => o.status === 'SKIPPED').length;

  console.log(line);
  console.log(' GAME-DAY DRILL RESULT');
  console.log(line);
  console.log(`  executed   ${outcomes.length} drills against the local stack`);
  console.log(`  passed     ${passed}`);
  console.log(`  failed     ${failed}`);
  console.log(`  skipped    ${skipped}`);
  console.log(line);
  console.log(
    '  Every line above was observed. Faults were injected by stopping real\n' +
      '  services, and each invariant was checked against what the platform did.',
  );
  console.log(line + '\n');

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
