export interface ManifestCore {
  tenantId: string;
  scope: unknown;
  period: unknown;
  schemaBundle: { id: string; hash: string };
  frameworkVersions: unknown[];
  mappingVersions: unknown[];
  evidenceIndex: Array<{ evidenceId: string; contentHash: string; integrityState: string }>;
  ledgerEntries: Array<{ tenantId: string; sequence: number; evidenceId: string; previousEntryHash: string | null; entryHash: string; evidenceMetadata: Record<string, unknown> }>;
  evaluationIndex: unknown[];
  assessmentIndex: unknown[];
  riskIndex: unknown[];
  exceptionIndex: unknown[];
  knownGaps: unknown[];
  limitations: string[];
  verifierProfile: { minVerifierVersion: string; verifierSourceVersion: string; treeProfile: string; hashAlgorithm: string; canonicalizationProfile: string };
  exportMetadata: unknown;
}

export interface ProofEnvelope {
  checkpoint: {
    id: string;
    anchorSequence: number;
    ledgerSequence: number;
    ledgerHeadHash: string;
    packageId?: string;
    packageVersion?: number;
    manifestCoreHash?: string;
    merkleRoot: string;
    treeProfile: string;
    hashAlgorithm: string;
    canonicalizationProfile: string;
    signingKeyId: string;
    signature: string;
    witnessAssuranceState: string;
    status: string;
  };
  merkleRoot: string;
  proofsByLeafIndex: Record<string, Array<{ siblingHash: string; position: 'LEFT' | 'RIGHT' }>>;
  signature: string;
  signingKey: { keyId: string; publicKey: string; algorithm: string; status: string };
  witnessReceipts: Array<{ witnessId: string; witnessType: string; receiptHash: string; status: string }>;
  witnessAssuranceState: string;
}

export interface AuditPackageApprovalRecord {
  approverId: string;
  manifestCoreHash: string;
  authorizationDecisionId: string;
  approvedAt: string;
}

export interface ExportedManifest extends ManifestCore {
  proofEnvelope: ProofEnvelope;
  auditPackageApproval: AuditPackageApprovalRecord;
}

const REQUIRED_TOP_LEVEL_FIELDS: (keyof ExportedManifest)[] = [
  'tenantId', 'scope', 'period', 'schemaBundle', 'evidenceIndex', 'ledgerEntries', 'evaluationIndex',
  'assessmentIndex', 'riskIndex', 'exceptionIndex', 'knownGaps', 'limitations', 'verifierProfile',
  'exportMetadata', 'proofEnvelope', 'auditPackageApproval',
];

export interface SchemaCheckResult {
  valid: boolean;
  missingFields: string[];
}

/** Structural validation only — no external schema-validation library, kept dependency-free. */
export function validateManifestSchema(manifest: unknown): SchemaCheckResult {
  if (typeof manifest !== 'object' || manifest === null) {
    return { valid: false, missingFields: ['<root is not an object>'] };
  }
  const record = manifest as Record<string, unknown>;
  const missingFields = REQUIRED_TOP_LEVEL_FIELDS.filter((f) => !(f in record));
  return { valid: missingFields.length === 0, missingFields };
}
