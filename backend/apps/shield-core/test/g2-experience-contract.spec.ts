import * as fs from 'fs';
import * as path from 'path';

/**
 * G2-EXPERIENCE-01: the nine G2 experience contracts (spec §20, gate G2).
 *
 * The first scaffold of these surfaces passed a reading of the requirements
 * while satisfying none of them: nine identical files, each with a dropdown
 * that let the reader choose which of the seven state classes to render. That
 * inverts UX-INV-03 — a page that can be switched to NOMINAL by hand renders
 * a compliant state with no evidence behind it at all.
 *
 * These invariants exist to stop that regressing. The important one is
 * Invariant 3: a contract surface must derive its state from its sources and
 * must not hold state of its own that decides which state class to show.
 */
describe('G2-EXPERIENCE-01: G2 Experience Contract Surfaces', () => {
  const frontendSrc = path.resolve(__dirname, '../../../../frontend/src');
  const appDir = path.join(frontendSrc, 'app');

  /** The nine G2 contracts and the route that satisfies each. */
  const contracts: { id: string; route: string }[] = [
    { id: 'W19', route: 'cases/incidents/command' },
    { id: 'W20', route: 'operations/shift-handover' },
    { id: 'W29', route: 'assets' },
    { id: 'W30', route: 'findings' },
    { id: 'W30', route: 'findings/[id]' },
    { id: 'W31', route: 'risk/executive' },
    { id: 'W32', route: 'audit/reports/generate' },
    { id: 'W36', route: 'admin/export' },
    { id: 'W37', route: 'developer' },
    { id: 'W38', route: 'trust' },
  ];

  const pageFor = (route: string) => path.join(appDir, route, 'page.tsx');
  const read = (route: string) => fs.readFileSync(pageFor(route), 'utf8');

  it('Invariant 1: every G2 contract has a route with a default page export', () => {
    for (const { id, route } of contracts) {
      expect({ id, route, exists: fs.existsSync(pageFor(route)) }).toEqual({
        id,
        route,
        exists: true,
      });
      expect(read(route)).toContain('export default function');
    }
  });

  it('Invariant 2: every G2 surface renders through ContractSurface and declares its contract id', () => {
    for (const { id, route } of contracts) {
      const content = read(route);
      expect({ route, usesSurface: content.includes('ContractSurface') }).toEqual({
        route,
        usesSurface: true,
      });
      expect({ route, declaresId: content.includes(`contractId="${id}"`) }).toEqual({
        route,
        declaresId: true,
      });
    }
  });

  it('Invariant 3: no G2 surface holds its own experience state (UX-INV-03)', () => {
    // A page that can set its own status can render NOMINAL without evidence.
    // State must come from useContractSources, which derives it from what the
    // sources returned.
    const stateClassLiteral =
      /useState[^;]*['"](?:NOMINAL|LOADING|PARTIAL|STALE|DEGRADED|UNAUTHORIZED|UNAVAILABLE)['"]/;
    const offenders: string[] = [];
    for (const { route } of contracts) {
      const content = read(route);
      if (stateClassLiteral.test(content)) offenders.push(route);
      if (!content.includes('useContractSources')) {
        offenders.push(`${route} (does not derive state from sources)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('Invariant 4: the derivation reaches NOMINAL only with no outstanding reasons', () => {
    const contractState = fs.readFileSync(
      path.join(frontendSrc, 'lib/contract-state.ts'),
      'utf8',
    );
    // NOMINAL must be the final else of the status ladder, guarded by there
    // being no reasons — not an independently reachable branch.
    expect(contractState).toContain('status = "NOMINAL"');
    expect(contractState).toMatch(/reasons\.length > 0[\s\S]*?status = "PARTIAL"/);
    // Unauthorized and unavailable must short-circuit ahead of it.
    const nominalIndex = contractState.indexOf('status = "NOMINAL"');
    for (const earlier of ['UNAUTHORIZED', 'UNAVAILABLE', 'DEGRADED', 'STALE']) {
      expect(contractState.indexOf(`status = "${earlier}"`)).toBeLessThan(
        nominalIndex,
      );
    }
  });

  it('Invariant 5: degraded, stale and partial banners render above contract content', () => {
    const surface = fs.readFileSync(
      path.join(frontendSrc, 'components/contracts/ContractSurface.tsx'),
      'utf8',
    );
    for (const state of ['DegradedState', 'StaleState', 'PartialState']) {
      expect(surface).toContain(state);
      expect(surface.indexOf(state)).toBeLessThan(surface.indexOf('{children}'));
    }
  });

  it('Invariant 6: every G2 surface carries its provenance', () => {
    const surface = fs.readFileSync(
      path.join(frontendSrc, 'components/contracts/ContractSurface.tsx'),
      'utf8',
    );
    // The source table states which endpoint answered and when.
    expect(surface).toContain('ProvenanceTable');
    expect(surface).toContain('correlationId');
  });

  it('Invariant 7: unmet contract requirements are declared, not omitted', () => {
    // UnbackedField renders a requirement the platform cannot yet satisfy.
    // Silently dropping such a field would redefine the contract down to
    // whatever happens to be implemented.
    const surface = fs.readFileSync(
      path.join(frontendSrc, 'components/contracts/ContractSurface.tsx'),
      'utf8',
    );
    expect(surface).toContain('export function UnbackedField');
    expect(surface).toContain('Required by the contract; no source records this');
  });
});
