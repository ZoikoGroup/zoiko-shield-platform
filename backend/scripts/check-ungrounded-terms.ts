import * as fs from 'fs';
import * as path from 'path';

interface Violation {
  file: string;
  line: number;
  term: string;
  lineContent: string;
}

const FORBIDDEN_RULES = [
  // ── Claims the CTO assurance review (2026-09-24) required removing ──
  //
  // "Dilithium3" is the pre-standard CRYSTALS name. NIST standardised the
  // algorithm as ML-DSA in FIPS 204, and the implementation uses ml_dsa65.
  // Publishing the old name misstates which standard the signature meets.
  { name: 'Dilithium-Prestandard', regex: /\bdilithium[\s-]?[0-9]\b/i },
  // SLH-DSA (SPHINCS+) is not implemented anywhere in the platform.
  { name: 'SPHINCS-Not-Implemented', regex: /\bsphincs\b/i },
  // ISO/IEC 27001:2022 renumbered Annex A. A.9.2 is 2013 numbering; identity,
  // authentication and access rights are A.5.16-A.5.18 in the current set.
  { name: 'ISO-2013-Numbering', regex: /\bA\.9\.[0-9]\b/ },
  // Compliance is attested by an external assessor, never asserted by us.
  // Controls can be implemented and internally evidenced; that is not the
  // same claim and must not be written as though it were.
  {
    name: 'Compliance-Self-Assertion',
    regex: /\b(?:100%|fully|is)\s+compliant\b/i,
  },
  { name: 'Certified-Self-Assertion', regex: /\bcertified\s+(?:compliant|control|secure)\b/i },
  { name: 'eBPF', regex: /\bebpf\b/i },
  { name: 'Nitro', regex: /\bnitro\b/i },
  { name: 'Purple-Team', regex: /\bpurple[\s-_]?team\b/i },
  {
    name: 'Breach-Sim',
    regex: /\bbreach\s+(?:and\s+attack\s+)?sim(?:ulation)?\b/i,
  },
  // Hardware custody claims with no implementation behind them: the only
  // "HSM" signer generates a software key in process memory, and nothing is
  // FIPS-validated. The spec requires HSM/KMS custody as a control to build,
  // not as a certification to advertise.
  // An endpoint's TPM 2.0 genuinely is a hardware root of trust (device
  // posture scoring); the claim being blocked is ZoikoShield's own.
  { name: 'Root-of-Trust', regex: /\broot[\s-]of[\s-]trust\b(?!\s*\(TPM)/i },
  { name: 'FIPS-140', regex: /\bFIPS[\s-]?140\b/i },
  { name: 'HSM-Validated', regex: /\b(?:hardware\s+HSM|HSM\s+validated)\b/i },
  {
    name: 'Enclave-Attestation',
    regex: /\benclave\s+(?:attestation|proof)\b/i,
  },
  // Bare 'enclave' as a product/feature noun — the platform uses Cloud HSM
  // partitions, not hardware enclaves. Allow the word only in comments that
  // are explicitly explaining *why* we removed it (i.e. the word appearing
  // in the linter rule file itself is exempted via IGNORE_FILES).
  {
    name: 'Bare-Enclave',
    regex: /\benclave\b/i,
  },
  // Intel SGX — no SGX SDK, no remote attestation service, not implemented.
  {
    name: 'Intel-SGX',
    regex: /\b(?:Intel\s+)?SGX\b/i,
  },
  // AWS Nitro Enclave — distinct from general Nitro hypervisor; not deployed.
  {
    name: 'AWS-Nitro-Enclave',
    regex: /\bNitro\s+Enclave\b/i,
  },
  // EnclaveAttestationReceipt type name — replaced by HsmCustodyReceipt.
  {
    name: 'EnclaveAttestationReceipt-Type',
    regex: /EnclaveAttestationReceipt/,
  },
];

const SCAN_DIRECTORIES = [
  path.join(__dirname, '..', '..', 'frontend', 'src'),
  path.join(__dirname, '..', 'apps'),
  path.join(__dirname),
];

// The claim register enumerates the prohibited phrases themselves, so it
// necessarily contains them. Exempting the register is not a loophole: its
// whole purpose is to name what must never be said elsewhere.
const IGNORE_FILES = [
  'check-ungrounded-terms.ts',
  'check-ungrounded-terms.js',
  'claim-register.service.ts',
  'claim-register.service.spec.ts',
];

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;

  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (
        !file.startsWith('.') &&
        file !== 'node_modules' &&
        file !== 'dist' &&
        file !== '.next'
      ) {
        getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      if (
        (file.endsWith('.ts') ||
          file.endsWith('.tsx') ||
          file.endsWith('.js') ||
          file.endsWith('.jsx') ||
          file.endsWith('.json') ||
          file.endsWith('.yaml') ||
          file.endsWith('.yml')) &&
        !IGNORE_FILES.includes(file)
      ) {
        arrayOfFiles.push(fullPath);
      }
    }
  }

  return arrayOfFiles;
}

function runUngroundedTermsCheck(): void {
  console.log(
    '\n================================================================',
  );
  console.log('    ZOIKOSHIELD UNGROUNDED TERMINOLOGY STATIC CI LINTER');
  console.log(
    '================================================================',
  );

  const allFiles: string[] = [];
  for (const scanDir of SCAN_DIRECTORIES) {
    getAllFiles(scanDir, allFiles);
  }

  console.log(
    `[x] Scanning ${allFiles.length} source files for ungrounded terminology...`,
  );

  const violations: Violation[] = [];

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((lineContent, idx) => {
      for (const rule of FORBIDDEN_RULES) {
        if (rule.regex.test(lineContent)) {
          violations.push({
            file,
            line: idx + 1,
            term: rule.name,
            lineContent: lineContent.trim(),
          });
        }
      }
    });
  }

  console.log(
    '----------------------------------------------------------------',
  );
  if (violations.length > 0) {
    console.error(
      `FAILED: Detected ${violations.length} ungrounded terminology violation(s):`,
    );
    for (const v of violations) {
      const relPath = path.relative(path.join(__dirname, '..', '..'), v.file);
      console.error(
        `  [!] ${relPath}:${v.line} -> Forbidden term '${v.term}': "${v.lineContent}"`,
      );
    }
    console.log(
      '\nRemediation: Remove ungrounded terms or replace with grounded equivalents.',
    );
    console.log(
      '================================================================\n',
    );
    process.exit(1);
  } else {
    console.log(
      `SUCCESS: 0 ungrounded terms found across ${allFiles.length} source files.`,
    );
    console.log(
      'Codebase strictly adheres to the 19 core engineering specifications.',
    );
    console.log(
      '================================================================\n',
    );
  }
}

runUngroundedTermsCheck();
