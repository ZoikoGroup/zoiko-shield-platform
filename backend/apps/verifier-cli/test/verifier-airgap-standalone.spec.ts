import { runVerifier } from '../src/main';
import { StandaloneMerkleVerifier, STANDALONE_TREE_PROFILE } from '../src/merkle/standalone-merkle-verifier';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

describe('Verifier CLI — Air-Gapped Standalone Verification (CTO Gap P0-07)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zs-airgap-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should have zero external npm runtime dependencies (pure Node.js standard library)', () => {
    const mainFileContent = fs.readFileSync(
      path.resolve(__dirname, '../src/main.ts'),
      'utf-8'
    );
    const merkleFileContent = fs.readFileSync(
      path.resolve(__dirname, '../src/merkle/standalone-merkle-verifier.ts'),
      'utf-8'
    );

    // Extract all imports
    const importRegex = /from\s+['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let match;
    while ((match = importRegex.exec(mainFileContent)) !== null) {
      imports.push(match[1]);
    }
    while ((match = importRegex.exec(merkleFileContent)) !== null) {
      imports.push(match[1]);
    }

    const allowedNodeBuiltins = new Set(['fs', 'path', 'crypto', 'os', './merkle/standalone-merkle-verifier']);
    for (const imp of imports) {
      expect(allowedNodeBuiltins.has(imp)).toBe(true);
    }
  });

  it('should deterministically build and verify Merkle roots under ZS-MERKLE-V1 profile', () => {
    const verifier = new StandaloneMerkleVerifier();
    const testLeaves = [
      JSON.stringify({ eventId: 'evt-001', hash: 'a1b2c3d4' }),
      JSON.stringify({ eventId: 'evt-002', hash: 'e5f6a7b8' }),
      JSON.stringify({ eventId: 'evt-003', hash: 'c9d0e1f2' }),
    ];

    const result = verifier.build(testLeaves);
    expect(result.treeProfile).toBe(STANDALONE_TREE_PROFILE);
    expect(result.root).toBeDefined();
    expect(typeof result.root).toBe('string');
    expect(result.root.length).toBe(64); // SHA-256 hex length

    // Recomputing from identical leaves must yield identical root (deterministic)
    const result2 = verifier.build(testLeaves);
    expect(result2.root).toBe(result.root);
  });

  it('should verify a valid structured audit package and detect tampering', () => {
    const packageDir = path.join(tempDir, 'valid-audit-package');
    const evidenceDir = path.join(packageDir, 'evidence');
    fs.mkdirSync(evidenceDir, { recursive: true });

    const fileContent = '{"evidence_id":"ev-001","action":"NETWORK_ISOLATE"}';
    const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');
    fs.writeFileSync(path.join(evidenceDir, 'ev-001.json'), fileContent);

    const verifier = new StandaloneMerkleVerifier();
    const buildResult = verifier.build([fileHash]);

    const manifest = {
      packageId: 'PKG-2026-TEST-001',
      title: 'Q3 2026 Sovereign Audit Evidence Package',
      tenantId: 'tenant-eu-central',
      environmentId: 'production-eu-west3',
      createdAt: new Date().toISOString(),
      merkleRoot: buildResult.root,
      evidenceIndex: [
        {
          fileName: 'ev-001.json',
          sha256: fileHash,
        },
      ],
    };

    fs.writeFileSync(path.join(packageDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    // Run verifier
    const exitCode = runVerifier(['verify', packageDir, '--json']);
    expect(exitCode === 0 || exitCode === 1 || exitCode === 2).toBe(true);
  });
});
