#!/usr/bin/env node
import { verifyPackageDirectory } from './verify';
import { printReport } from './report/report';

function main() {
  const args = process.argv.slice(2);
  if (args[0] !== 'verify' || !args[1]) {
    console.error('Usage: zoikoshield-verifier verify <path-to-exported-package-directory>');
    process.exit(2);
  }

  const dirPath = args[1];
  try {
    const result = verifyPackageDirectory(dirPath);
    printReport(result);
    process.exit(result.overallResult === 'FAILED' || result.overallResult === 'UNSUPPORTED_VERSION' ? 1 : 0);
  } catch (err) {
    console.error(`Verification could not run: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
