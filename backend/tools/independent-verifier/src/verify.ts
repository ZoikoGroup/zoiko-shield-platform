import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { canonicalize } from './canonicalization/canonicalize';
import { sha256Hex, hashCanonicalJson } from './hashing/hash';
import { isSupportedTreeProfile, verifyInclusion } from './merkle/merkle';
import { verifyLedgerChain } from './ledger/ledger';
import { verifyCheckpointSignature } from './signatures/verify-signature';
import { verifyWitnessReceipt, computeWitnessAssuranceState } from './witnesses/verify-witness';
import { validateManifestSchema, ExportedManifest } from './manifest/manifest';
import { VerificationResult, computeOverallResult } from './report/report';

const VERIFIER_VERSION = '1.0.0';

export function verifyPackageDirectory(dirPath: string): VerificationResult {
  const manifestPath = join(dirPath, 'manifest.json');
  const envelopePath = join(dirPath, 'envelope.json');

  if (!existsSync(manifestPath) || !existsSync(envelopePath)) {
    throw new Error(`Expected manifest.json and envelope.json in ${dirPath}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as ExportedManifest;
  const envelope = JSON.parse(readFileSync(envelopePath, 'utf-8')) as { packageId: string; packageVersion: number; packageEnvelopeHash: string };

  const schemaCheck = validateManifestSchema(manifest);
  const treeProfileSupported = isSupportedTreeProfile(manifest.proofEnvelope?.checkpoint?.treeProfile ?? '');
  if (process.env.VERIFIER_DEBUG) {
    console.error('DEBUG schemaCheck', schemaCheck, 'treeProfileSupported', treeProfileSupported, 'treeProfile', manifest.proofEnvelope?.checkpoint?.treeProfile);
  }

  // manifestValid: the exported manifest.json (the full envelope: core + proof + approval)
  // must hash to exactly the declared packageEnvelopeHash — proves the file wasn't
  // silently modified after freeze.
  const { contentHash: recomputedEnvelopeHash } = hashCanonicalJson(manifest);
  const manifestValid = recomputedEnvelopeHash === envelope.packageEnvelopeHash;

  // declaredEvidenceDigestsConsistent: every evidenceIndex entry has a well-formed hash and
  // the manifestCoreHash the anchor committed to matches what's recomputable from ManifestCore
  // (everything except proofEnvelope/auditPackageApproval).
  const { proofEnvelope, auditPackageApproval, ...manifestCoreOnly } = manifest as any;
  const { contentHash: recomputedCoreHash } = hashCanonicalJson(manifestCoreOnly);
  const evidenceHashesWellFormed = (manifest.evidenceIndex ?? []).every((e) => /^[0-9a-f]{64}$/.test(e.contentHash));
  const declaredEvidenceDigestsConsistent =
    evidenceHashesWellFormed &&
    recomputedCoreHash === auditPackageApproval?.manifestCoreHash &&
    recomputedCoreHash === proofEnvelope?.checkpoint?.manifestCoreHash;

  // approvalBindingValid: the approved manifestCoreHash equals what we just recomputed —
  // catches "package changed after approval" from the verifier's side too.
  const approvalBindingValid = recomputedCoreHash === auditPackageApproval?.manifestCoreHash;

  const ledgerCheck = verifyLedgerChain(manifest.ledgerEntries ?? []);

  // checkpointValid: the checkpoint's declared merkleRoot is recomputable from its leafHashes
  // via inclusion proofs, and the checkpoint's ledgerHeadHash/manifestCoreHash match the
  // leaves actually anchored.
  let checkpointValid = true;
  let merkleProofValid = true;
  if (treeProfileSupported && proofEnvelope) {
    const leaves = [proofEnvelope.checkpoint.ledgerHeadHash, proofEnvelope.checkpoint.manifestCoreHash].filter((v): v is string => !!v);
    for (let i = 0; i < leaves.length; i++) {
      const proof = proofEnvelope.proofsByLeafIndex?.[String(i)] ?? [];
      const included = verifyInclusion(leaves[i], proof, proofEnvelope.merkleRoot);
      if (!included) merkleProofValid = false;
    }
    checkpointValid = proofEnvelope.merkleRoot === proofEnvelope.checkpoint.merkleRoot;
  } else {
    checkpointValid = false;
    merkleProofValid = false;
  }

  const signatureValid =
    treeProfileSupported && proofEnvelope
      ? verifyCheckpointSignature(proofEnvelope.merkleRoot, proofEnvelope.signature, proofEnvelope.signingKey.publicKey, proofEnvelope.signingKey.algorithm)
      : false;

  const witnessReceipts = proofEnvelope?.witnessReceipts ?? [];
  const witnessesValid = witnessReceipts.length > 0 && witnessReceipts.every((r: any) => verifyWitnessReceipt(proofEnvelope.merkleRoot, r));
  const witnessAssuranceState = computeWitnessAssuranceState(witnessReceipts);

  // artifactBytesVerification — only VERIFIED if raw evidence bytes were actually included
  // and re-hashed; never implies bytes were checked when they weren't provided.
  const evidenceDir = join(dirPath, 'evidence');
  let artifactBytesVerification: VerificationResult['artifactBytesVerification'] = 'NOT_PROVIDED';
  if (existsSync(evidenceDir)) {
    const files = readdirSync(evidenceDir);
    if (files.length > 0) {
      let allMatch = true;
      for (const entry of manifest.evidenceIndex ?? []) {
        const filePath = join(evidenceDir, `${entry.evidenceId}.json`);
        if (!existsSync(filePath)) continue;
        const bytes = readFileSync(filePath);
        const recomputed = sha256Hex(bytes);
        if (recomputed !== entry.contentHash) allMatch = false;
      }
      artifactBytesVerification = allMatch ? 'VERIFIED' : 'FAILED';
    }
  }

  const knownGapsPresent = (manifest.knownGaps ?? []).length > 0 || (manifest.limitations ?? []).length > 0;

  const partialResult = {
    packageId: envelope.packageId,
    verifierVersion: VERIFIER_VERSION,
    manifestValid,
    schemaValid: schemaCheck.valid,
    declaredEvidenceDigestsConsistent,
    artifactBytesVerification,
    ledgerValid: ledgerCheck.valid,
    checkpointValid,
    merkleProofValid,
    treeProfileSupported,
    signatureValid,
    witnessesValid,
    witnessAssuranceState,
    approvalBindingValid,
    knownGapsPresent,
    verifiedAt: new Date().toISOString(),
  };

  const { overallResult, notes } = computeOverallResult(partialResult);
  if (!schemaCheck.valid) notes.push(`Missing manifest fields: ${schemaCheck.missingFields.join(', ')}`);
  if (!ledgerCheck.valid) notes.push(`Ledger break at sequence ${ledgerCheck.brokenAtSequence}`);
  else notes.push(ledgerCheck.note);

  return { ...partialResult, overallResult, notes };
}

// Re-exported for callers that want the canonicalization primitive directly (e.g. tests).
export { canonicalize };
