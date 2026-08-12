#!/usr/bin/env node
import { existsSync } from 'fs';
import { resolve } from 'path';
import { verifyPackageDirectory } from '../../../tools/independent-verifier/src/verify';
import { printReport } from '../../../tools/independent-verifier/src/report/report';

export function runVerifier(args: string[] = process.argv.slice(2)): number {
  if (args[0] !== 'verify' || !args[1]) {
    console.log('Usage: zoikoshield-verifier verify <path-to-audit-package>');
    return 2;
  }

  const targetPath = resolve(args[1]);
  if (!existsSync(targetPath)) {
    console.error(`Error: Package path does not exist: ${targetPath}`);
    return 1;
  }

  try {
    const result = verifyPackageDirectory(targetPath);
    printReport(result);
    return (result.overallResult === 'FAILED' || result.overallResult === 'UNSUPPORTED_VERSION') ? 1 : 0;
  } catch (err: any) {
    console.error(`Verification failure: ${err.message}`);
    return 1;
  }
}

if (require.main === module) {
  const exitCode = runVerifier();
  process.exit(exitCode);
}
