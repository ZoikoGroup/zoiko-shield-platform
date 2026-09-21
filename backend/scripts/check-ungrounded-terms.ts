import * as fs from 'fs';
import * as path from 'path';

interface Violation {
  file: string;
  line: number;
  term: string;
  lineContent: string;
}

const FORBIDDEN_RULES = [
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
];

const SCAN_DIRECTORIES = [
  path.join(__dirname, '..', '..', 'frontend', 'src'),
  path.join(__dirname, '..', 'apps'),
  path.join(__dirname),
];

const IGNORE_FILES = ['check-ungrounded-terms.ts', 'check-ungrounded-terms.js'];

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
