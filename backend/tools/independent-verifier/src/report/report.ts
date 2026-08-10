export interface VerificationResult {
  packageId: string;
  verifierVersion: string;
  manifestValid: boolean;
  schemaValid: boolean;
  declaredEvidenceDigestsConsistent: boolean;
  artifactBytesVerification: 'VERIFIED' | 'NOT_PROVIDED' | 'FAILED';
  ledgerValid: boolean;
  checkpointValid: boolean;
  merkleProofValid: boolean;
  treeProfileSupported: boolean;
  signatureValid: boolean;
  witnessesValid: boolean;
  witnessAssuranceState: string;
  approvalBindingValid: boolean;
  knownGapsPresent: boolean;
  overallResult: 'VERIFIED' | 'VERIFIED_WITH_LIMITATIONS' | 'CRYPTOGRAPHICALLY_VERIFIED_NOT_EXTERNALLY_WITNESSED' | 'FAILED' | 'UNSUPPORTED_VERSION' | 'INCOMPLETE';
  verifiedAt: string;
  notes: string[];
}

/**
 * overallResult logic (spec correction #3 witness capping, correction #9
 * evidence-verification split): any structural/crypto check false, or an
 * unsupported treeProfile/schema, or artifactBytesVerification === 'FAILED'
 * → FAILED (unsupported version is its own explicit UNSUPPORTED_VERSION
 * state, never silently treated as FAILED or PASSED). Only mock witnessing
 * exists this pass, so the ceiling for a structurally-sound package is
 * CRYPTOGRAPHICALLY_VERIFIED_NOT_EXTERNALLY_WITNESSED, never plain VERIFIED.
 */
export function computeOverallResult(r: Omit<VerificationResult, 'overallResult' | 'notes'>): { overallResult: VerificationResult['overallResult']; notes: string[] } {
  const notes: string[] = [];

  if (!r.treeProfileSupported || !r.schemaValid) {
    notes.push('Unsupported tree profile or manifest schema version — verifier cannot assess this package');
    return { overallResult: 'UNSUPPORTED_VERSION', notes };
  }

  const structuralChecksPassed =
    r.manifestValid && r.declaredEvidenceDigestsConsistent && r.ledgerValid && r.checkpointValid && r.merkleProofValid && r.signatureValid && r.approvalBindingValid;

  if (!structuralChecksPassed || r.artifactBytesVerification === 'FAILED') {
    notes.push('One or more structural/cryptographic checks failed — see individual fields');
    return { overallResult: 'FAILED', notes };
  }

  if (r.witnessAssuranceState === 'TEST_ONLY') {
    notes.push('Only a MOCK witness channel is present — this package is cryptographically sound but has NOT been externally witnessed. At least two independently-operated real witness channels are required for full external witnessing.');
    return { overallResult: 'CRYPTOGRAPHICALLY_VERIFIED_NOT_EXTERNALLY_WITNESSED', notes };
  }

  if (r.knownGapsPresent || r.artifactBytesVerification === 'NOT_PROVIDED') {
    notes.push('Manifest declares known gaps/limitations, or evidence bytes were not provided for byte-level re-verification');
    return { overallResult: 'VERIFIED_WITH_LIMITATIONS', notes };
  }

  return { overallResult: 'VERIFIED', notes };
}

export function printReport(result: VerificationResult): void {
  const line = (label: string, value: string) => console.log(`${label}:\n${value}\n`);
  console.log(`Package:\n${result.packageId}\n`);
  line('Manifest', result.manifestValid ? 'PASS' : 'FAIL');
  line('Evidence digests (declared)', result.declaredEvidenceDigestsConsistent ? 'PASS' : 'FAIL');
  line('Artifact bytes', result.artifactBytesVerification);
  line('Ledger', result.ledgerValid ? 'PASS' : 'FAIL');
  line('Checkpoint', result.checkpointValid ? 'PASS' : 'FAIL');
  line('Merkle proof', result.merkleProofValid ? 'PASS' : 'FAIL');
  line('Signature', result.signatureValid ? 'PASS' : 'FAIL');
  line('Witnesses', result.witnessesValid ? 'PASS' : 'FAIL');
  line('Witness assurance state', result.witnessAssuranceState);
  line('Approval binding', result.approvalBindingValid ? 'PASS' : 'FAIL');
  line('Known limitations', String(result.knownGapsPresent ? 'PRESENT' : 'NONE'));
  line('Result', result.overallResult);
  if (result.notes.length > 0) {
    console.log('Notes:');
    for (const note of result.notes) console.log(`  - ${note}`);
  }
  console.log('\nThis result does NOT certify compliance, legal sufficiency, or the absence of a security breach — it verifies only that this package has not been silently modified and that its cryptographic proofs are internally consistent.');
}
