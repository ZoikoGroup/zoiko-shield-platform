import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { PERMISSION_CODES } from '../authorization/constants';
import {
  PRIVACY_LEGAL_REVIEWER_PERMISSION_CODES,
  TENANT_OWNER_PERMISSION_CODES,
} from './onboarding.service';

/**
 * Every action shield-core authorizes must be granted to some role. An action
 * no role holds makes its endpoint refuse everyone: that is how proposing a
 * response action, approving one and creating an export all came to be
 * impossible for every customer.
 */

// Granted to platform roles by migrations, not by the tenant template roles.
const PLATFORM_GRANTED = new Set<string>([
  PERMISSION_CODES.DELETION_APPROVE,
  PERMISSION_CODES.LEGAL_HOLD_CREATE,
]);

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

function authorizedActions(): Map<string, string> {
  const codesByKey = PERMISSION_CODES as Record<string, string>;
  const found = new Map<string, string>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('authorizationDecisionService')) continue;
    for (const m of text.matchAll(/action:\s*'([a-z_]+:[a-z_:-]+)'/g)) {
      found.set(m[1], relative(SRC, file));
    }
    for (const m of text.matchAll(/action:\s*PERMISSION_CODES\.(\w+)/g)) {
      found.set(codesByKey[m[1]], relative(SRC, file));
    }
  }
  return found;
}

describe('tenant role grants', () => {
  it('finds the authorized actions to check', () => {
    expect(authorizedActions().size).toBeGreaterThan(10);
  });

  it('grants every authorized action to some role', () => {
    const granted = new Set([
      ...TENANT_OWNER_PERMISSION_CODES,
      ...PRIVACY_LEGAL_REVIEWER_PERMISSION_CODES,
      ...PLATFORM_GRANTED,
    ]);
    const orphaned = [...authorizedActions()]
      .filter(([code]) => !granted.has(code))
      .map(([code, file]) => `${code} (${file})`);
    expect(orphaned).toEqual([]);
  });

  it('keeps legal-hold release with the reviewers who place holds', () => {
    expect(PRIVACY_LEGAL_REVIEWER_PERMISSION_CODES).toEqual(
      expect.arrayContaining([PERMISSION_CODES.LEGAL_HOLD_CREATE, PERMISSION_CODES.LEGAL_HOLD_RELEASE]),
    );
    expect(TENANT_OWNER_PERMISSION_CODES).not.toContain(PERMISSION_CODES.LEGAL_HOLD_RELEASE);
  });
});
