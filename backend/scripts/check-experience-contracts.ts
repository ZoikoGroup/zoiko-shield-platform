import 'dotenv/config';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Traceability for the G1-blocking experience contracts.
 *
 * ERB-01 names 29 contracts as G1-blocking: W01–W18, W21–W28 and W33–W35.
 * Until this file existed, the identifier "W14" appeared nowhere in the
 * repository — not in a route, a component, a test or a comment. There was no
 * way to answer "is W24 built?" except by opening pages and guessing, and no
 * way for a gate reviewer to check the answer.
 *
 * This is the register. Each contract names the route that implements it, or
 * records that nothing does. `npm run check:experience-contracts` fails when a
 * contract claims a route that is not on disk, so the register cannot rot into
 * a list of aspirations.
 *
 * A route existing is not the same as a contract being satisfied — the
 * defensibility requirements in the spec are what satisfy it, and this check
 * does not evaluate them. It answers the narrower question the register can
 * answer honestly: is there a surface at all.
 */

type Contract = {
  id: string;
  title: string;
  /** Route under frontend/src/app, or null when nothing implements it. */
  route: string | null;
  /** Why it is not built, when it is not. */
  note?: string;
};

const APP_DIR = join(__dirname, '..', '..', 'frontend', 'src', 'app');

const G1_CONTRACTS: Contract[] = [
  { id: 'W01', title: 'Application shell, navigation and tenant/environment switcher', route: '/' },
  { id: 'W02', title: 'Sign-in, federation, MFA/passkey and step-up', route: '/login' },
  { id: 'W03', title: 'JIT privileged-access request and approval', route: '/admin/jit' },
  {
    id: 'W04',
    title: 'Notification center and acknowledgment',
    route: null,
    note: 'No notification surface exists. notification.* topics are published and never displayed.',
  },
  { id: 'W05', title: 'Operational command center', route: '/' },
  { id: 'W06', title: 'Tenant onboarding wizard', route: '/onboarding' },
  { id: 'W07', title: 'Connector catalog, setup and credential flow', route: '/connectors' },
  { id: 'W08', title: 'Connector health and coverage dashboard', route: '/ingestion' },
  { id: 'W09', title: 'Users, roles and segregation-of-duties administration', route: '/team' },
  { id: 'W10', title: 'Entitlements, usage, forecast and service obligations', route: '/services' },
  { id: 'W11', title: 'Audit and privileged-activity explorer', route: '/audit' },
  {
    id: 'W12',
    title: 'Policy/configuration approval, deployment and rollback',
    route: null,
    note: 'No policy approval or rollback surface. Approval services exist in shield-core with no UI.',
  },
  { id: 'W13', title: 'Alert queue', route: '/alerts' },
  {
    id: 'W14',
    title: 'Alert detail',
    route: null,
    note: 'No per-alert route. /alerts is a queue only; an alert cannot be opened to see why it fired.',
  },
  {
    id: 'W15',
    title: 'Detection content management',
    route: null,
    note: 'No detection lifecycle surface. Rules are registered at boot and cannot be viewed, tested or staged.',
  },
  { id: 'W16', title: 'Case workspace', route: '/cases/[caseId]' },
  { id: 'W17', title: 'Response action proposal and approval', route: '/actions' },
  {
    id: 'W18',
    title: 'Playbook run view',
    route: null,
    note: 'No playbook run surface. Steps, approvals and compensation are not visible anywhere.',
  },
  { id: 'W21', title: 'Framework and control library', route: '/controls' },
  {
    id: 'W22',
    title: 'Control detail',
    route: null,
    note: 'No per-control route, so implementation, evaluators, gaps and exceptions cannot be inspected.',
  },
  { id: 'W23', title: 'Evidence object viewer', route: '/ledger' },
  {
    id: 'W24',
    title: 'Evidence operations queue',
    route: null,
    note: 'No queue for expected-but-missing evidence, collection failures, staleness or backfill.',
  },
  { id: 'W25', title: 'Audit package builder and freeze', route: '/audit' },
  { id: 'W26', title: 'Auditor workspace', route: '/verify-certificate' },
  {
    id: 'W27',
    title: 'Risk register and acceptance',
    route: null,
    note: 'No risk register surface. risk.* topics are published with nothing to display them.',
  },
  {
    id: 'W28',
    title: 'Exception workflow',
    route: null,
    note: 'No exception request or approval surface, though exception.expired.v1 is consumed.',
  },
  { id: 'W33', title: 'AI assistant panel', route: '/copilot' },
  {
    id: 'W34',
    title: 'AI proposal card pattern',
    route: null,
    note: 'No accept/modify/reject proposal card with grounding and human-decision evidence.',
  },
  { id: 'W35', title: 'Internal AI governance operations', route: '/ai-governance' },
];

function routeExists(route: string): boolean {
  const relative = route === '/' ? '' : route.replace(/^\//, '');
  return existsSync(join(APP_DIR, relative, 'page.tsx'));
}

function main(): void {
  const line = '─'.repeat(78);
  console.log(line);
  console.log(' G1-BLOCKING EXPERIENCE CONTRACT TRACEABILITY (ERB-01: W01-W18, W21-W28, W33-W35)');
  console.log(line);

  const missingRoute: Contract[] = [];
  const brokenClaim: Contract[] = [];

  for (const contract of G1_CONTRACTS) {
    if (contract.route === null) {
      missingRoute.push(contract);
      console.log(`  NOT BUILT  ${contract.id}  ${contract.title}`);
      console.log(`             ${contract.note ?? ''}`);
      continue;
    }
    if (!routeExists(contract.route)) {
      brokenClaim.push(contract);
      console.log(`  BROKEN     ${contract.id}  ${contract.title}`);
      console.log(`             claims ${contract.route}, which is not on disk`);
      continue;
    }
    console.log(`  surface    ${contract.id}  ${contract.title.padEnd(58)} ${contract.route}`);
  }

  const built = G1_CONTRACTS.length - missingRoute.length - brokenClaim.length;
  console.log(line);
  console.log(`  ${built} of ${G1_CONTRACTS.length} G1-blocking contracts have a surface.`);
  console.log(`  ${missingRoute.length} have none: ${missingRoute.map((c) => c.id).join(', ') || '-'}`);
  if (brokenClaim.length > 0) {
    console.log(`  ${brokenClaim.length} claim a route that does not exist: ${brokenClaim.map((c) => c.id).join(', ')}`);
  }
  console.log(line);
  console.log(
    '  A surface existing is not the same as the contract being satisfied. This\n' +
      '  check answers only whether something is there to review; the spec\'s\n' +
      '  defensibility requirements are what decide whether it passes.',
  );
  console.log(line);

  // A register that claims a route which is not on disk is worse than no
  // register, so that fails. Contracts honestly recorded as unbuilt do not:
  // the gate decides what to do about them, this check just keeps count.
  if (brokenClaim.length > 0) process.exitCode = 1;
}

main();
