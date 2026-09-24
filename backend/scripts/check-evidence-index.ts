import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Keeps docs/G1_EVIDENCE_INDEX.md honest.
 *
 * The CTO assurance review asked for an evidence index rather than a narrative
 * percentage, on the grounds that a percentage cannot be reproduced by an
 * independent reviewer. An index has the same weakness the moment a row cites
 * an artifact that does not exist, so this checks the two things that would
 * make it worthless:
 *
 *   - a row claiming PASS against a file path that is not on disk
 *   - a state outside the agreed vocabulary
 *
 * It deliberately does not evaluate whether a PASS is deserved. No script can
 * do that. It checks that the claim is traceable to something real, which is
 * the minimum an index must guarantee before anyone signs against it.
 */

const REPO_ROOT = join(__dirname, '..', '..');
const INDEX_PATH = join(REPO_ROOT, 'docs', 'G1_EVIDENCE_INDEX.md');

const VALID_STATES = new Set([
  'NOT_RUN',
  'FAIL',
  'BLOCKED',
  'PASS',
  'PASS-WITH-ACCEPTED-EXCEPTION',
  // Compliance-posture rows use evidence-state language rather than gate
  // states, because "PASS" is not a thing anyone may say about a standard
  // they have not been assessed against.
  'IMPLEMENTED + INTERNALLY EVIDENCED',
  'MAPPING / IMPLEMENTATION EVIDENCE',
  'CODED / LIVE PROOF PENDING',
  'ACCOUNTABILITY EVIDENCE INCOMPLETE',
  'APPLICABILITY + MAPPING REQUIRED',
  'PARTIAL MAPPING / EVIDENCE REQUIRED',
  'INTERNAL TEST PASS / EXTERNAL PROOF PENDING',
  'PASS (internal)',
  'OPEN',
  'PROPOSAL',
]);

function main(): void {
  if (!existsSync(INDEX_PATH)) {
    console.error('docs/G1_EVIDENCE_INDEX.md does not exist.');
    process.exitCode = 1;
    return;
  }

  const lines = readFileSync(INDEX_PATH, 'utf8').split('\n');
  const problems: string[] = [];
  let rows = 0;
  let citedArtifacts = 0;

  // Column positions differ per table (the ADR table puts State third), so
  // each table's header is read rather than assuming a fixed layout. Guessing
  // the column is how a checker starts reporting confident nonsense.
  let stateColumn = -1;
  let evidenceColumn = -1;

  lines.forEach((line, index) => {
    if (!line.trim().startsWith('|')) {
      // A blank line ends the current table.
      if (line.trim() === '') {
        stateColumn = -1;
        evidenceColumn = -1;
      }
      return;
    }
    const cells = line.split('|').map((c) => c.trim());

    const headerState = cells.findIndex((c) => c === 'State');
    if (headerState !== -1) {
      stateColumn = headerState;
      evidenceColumn = cells.findIndex(
        (c) => c === 'Evidence artifact' || c === 'What is true',
      );
      return;
    }
    if (/^\|[\s|:-]+\|$/.test(line.trim())) return;
    if (stateColumn === -1) return;

    const state = (cells[stateColumn] ?? '').replace(/\*\*/g, '').trim();
    if (!state) return;

    rows += 1;
    if (!VALID_STATES.has(state)) {
      problems.push(
        `line ${index + 1}: state '${state}' is not in the agreed vocabulary`,
      );
    }

    const evidence =
      evidenceColumn === -1
        ? ''
        : (cells[evidenceColumn] ?? '').replace(/`/g, '').trim();

    if (evidence.includes('/') && evidence.endsWith('.md')) {
      citedArtifacts += 1;
      if (!existsSync(join(REPO_ROOT, evidence))) {
        problems.push(
          `line ${index + 1}: cites '${evidence}', which is not on disk`,
        );
      }
    }

    // The failure this exists to prevent: a PASS with nothing behind it.
    if (
      state === 'PASS' &&
      evidenceColumn !== -1 &&
      ['—', '', '-'].includes(evidence)
    ) {
      problems.push(
        `line ${index + 1}: PASS with no evidence artifact. A gate with nothing behind it is NOT_RUN.`,
      );
    }
  });

  const line = '─'.repeat(72);
  console.log(line);
  console.log(' G1 EVIDENCE INDEX CHECK');
  console.log(line);
  console.log(`  rows checked          ${rows}`);
  console.log(`  file artifacts cited  ${citedArtifacts}`);

  if (problems.length === 0) {
    console.log('  Every row has a recognised state, and every cited artifact exists.');
    console.log(line);
    console.log(
      '  This does not judge whether a PASS is deserved. It checks the claim is\n' +
        '  traceable to something real, which is what a reviewer needs to start.',
    );
    console.log(line);
    return;
  }

  console.error(`\n  ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`    ${problem}`);
  console.error(line);
  process.exitCode = 1;
}

main();
