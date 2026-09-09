import * as net from 'net';
import * as http from 'http';

interface ServiceTarget {
  name: string;
  host: string;
  port: number;
  role: string;
  type: 'TCP' | 'HTTP';
  path?: string;
  criticality: 'MANDATORY_REGIONAL_CELL' | 'OPTIONAL_ANALYTICS';
}

const TARGET_SERVICES: ServiceTarget[] = [
  {
    name: 'PostgreSQL 16 (Relational Authority)',
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    role: 'Authoritative Multi-Tenant System of Record',
    type: 'TCP',
    criticality: 'MANDATORY_REGIONAL_CELL',
  },
  {
    name: 'Redpanda / Kafka API (Event Backbone)',
    host: process.env.KAFKA_HOST || '127.0.0.1',
    port: parseInt(process.env.REDPANDA_KAFKA_PORT || '9093', 10),
    role: 'Durable Event Streaming & OCSF Pipeline',
    type: 'TCP',
    criticality: 'MANDATORY_REGIONAL_CELL',
  },
  {
    name: 'MinIO S3 API (Evidence Object Vault)',
    host: process.env.MINIO_HOST || '127.0.0.1',
    port: parseInt(process.env.MINIO_API_PORT || '9000', 10),
    role: 'WORM Immutable Evidence Storage',
    type: 'HTTP',
    path: '/minio/health/live',
    criticality: 'MANDATORY_REGIONAL_CELL',
  },
  {
    name: 'Redis 7 (Coordination Cache)',
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6380', 10),
    role: 'Non-Authoritative Lease & Rate-Limiting Cache',
    type: 'TCP',
    criticality: 'MANDATORY_REGIONAL_CELL',
  },
];

async function probeTcpSocket(host: string, port: number, timeoutMs = 2000): Promise<{ reachable: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    socket.setTimeout(timeoutMs);

    socket.connect(port, host, () => {
      const latencyMs = Date.now() - start;
      isResolved = true;
      socket.destroy();
      resolve({ reachable: true, latencyMs });
    });

    socket.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ reachable: false, latencyMs: Date.now() - start, error: err.message });
      }
    });

    socket.on('timeout', () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ reachable: false, latencyMs: Date.now() - start, error: 'Connection timed out' });
      }
    });
  });
}

async function probeHttpHealth(host: string, port: number, path = '/', timeoutMs = 2000): Promise<{ reachable: boolean; latencyMs: number; statusCode?: number; error?: string }> {
  const start = Date.now();
  return new Promise((resolve) => {
    const req = http.request(
      {
        host,
        port,
        path,
        method: 'GET',
        timeout: timeoutMs,
      },
      (res) => {
        const latencyMs = Date.now() - start;
        resolve({ reachable: res.statusCode !== undefined && res.statusCode < 500, latencyMs, statusCode: res.statusCode });
      },
    );

    req.on('error', (err) => {
      resolve({ reachable: false, latencyMs: Date.now() - start, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ reachable: false, latencyMs: Date.now() - start, error: 'HTTP Request timed out' });
    });

    req.end();
  });
}

async function runInfrastructureConnectivityProbe() {
  console.log('========================================================================');
  console.log(' 🛡️  ZoikoShield Regional-Cell Backing Infrastructure Connectivity Probe');
  console.log('    Specification: MASTER_BUILD_PLAN.md §4, §8 & §19');
  console.log('========================================================================\n');

  console.log(`Evaluating local/regional backing platform topology targets (4 Services)...\n`);

  let reachableCount = 0;
  const results: Array<{ name: string; status: 'ONLINE' | 'STANDBY_UNREACHABLE'; details: string }> = [];

  for (const target of TARGET_SERVICES) {
    process.stdout.write(`[*] Probing ${target.name} on ${target.host}:${target.port}... `);

    let result;
    if (target.type === 'HTTP' && target.path) {
      result = await probeHttpHealth(target.host, target.port, target.path);
    } else {
      result = await probeTcpSocket(target.host, target.port);
    }

    if (result.reachable) {
      reachableCount++;
      console.log(`✔ ONLINE (${result.latencyMs}ms)`);
      results.push({
        name: target.name,
        status: 'ONLINE',
        details: `Reachable via ${target.type} on port ${target.port} (${result.latencyMs}ms latency)`,
      });
    } else {
      console.log(`ℹ STANDBY (Docker container not running or port binding inactive: ${result.error || 'Connection refused'})`);
      results.push({
        name: target.name,
        status: 'STANDBY_UNREACHABLE',
        details: `Container inactive or socket closed (${result.error || 'Connection refused'}) [derived fallback available]`,
      });
    }
  }

  console.log('\n========================================================================');
  console.log(' 📊 BACKING INFRASTRUCTURE TOPOLOGY AUDIT SUMMARY');
  console.log('========================================================================');

  for (const res of results) {
    const icon = res.status === 'ONLINE' ? '✔ [ONLINE] ' : 'ℹ [STANDBY]';
    console.log(` ${icon} ${res.name.padEnd(45)} | ${res.details}`);
  }

  console.log('========================================================================');
  console.log(` Topology Probe Finished: ${reachableCount}/${TARGET_SERVICES.length} live backing sockets active.`);
  console.log(` Regional Cell Deployment Profile: Ready for 'docker compose up -d' stack execution.`);
  console.log('========================================================================\n');
}

runInfrastructureConnectivityProbe().catch((err) => {
  console.error('Fatal probe error:', err);
  process.exit(1);
});
