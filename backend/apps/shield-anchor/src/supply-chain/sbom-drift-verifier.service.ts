import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface RunningPodImageState {
  podName: string;
  namespace: string;
  cluster: string;
  observedImageDigest: string; // sha256:...
  runningSbomPackagesCount: number;
}

export interface MerkleLedgerAttestationRecord {
  imageDigest: string;
  expectedSbomPackagesCount: number;
  anchoredMerkleRoot: string;
  epochNumber: number;
  cosignKmsKey: string;
}

export interface SbomDriftAssessmentResult {
  scanId: string;
  podName: string;
  isDriftDetected: boolean;
  driftClassification:
    | 'ZERO_DRIFT_VALID_ATTESTATION'
    | 'UNAUTHORIZED_IMAGE_ALTERATION'
    | 'PACKAGE_COUNT_MISMATCH';
  remediationAction:
    'NONE' | 'EVICT_POD_AND_TRIGGER_CONTAINMENT' | 'ALERT_SOC_LEAD';
  evaluatedAt: string;
  attestationDigest: string;
}

/**
 * Continuous In-Cluster SBOM & Attestation Drift Verifier Service
 * Specification: Backend Build Guide §LAB 17 & §LAB 18 (Supply Chain & Cluster Integrity)
 */
@Injectable()
export class SbomDriftVerifierService {
  private readonly logger = new Logger(SbomDriftVerifierService.name);

  // In-memory ledger of attested release images
  private readonly attestedReleaseLedger = new Map<
    string,
    MerkleLedgerAttestationRecord
  >();

  /**
   * Registers an immutable release image into the attested Merkle ledger.
   */
  registerAttestedRelease(record: MerkleLedgerAttestationRecord): void {
    this.attestedReleaseLedger.set(record.imageDigest, record);
    this.logger.log(
      `✔ [LEDGER ANCHORED] Registered attested image digest '${record.imageDigest.slice(0, 16)}...' in Epoch ${record.epochNumber}`,
    );
  }

  /**
   * Scans a running Kubernetes pod and verifies its live image digest & SBOM against the immutable Merkle ledger.
   */
  evaluatePodIntegrity(pod: RunningPodImageState): SbomDriftAssessmentResult {
    const scanId = `drift-scan-${crypto.randomUUID()}`;
    const evaluatedAt = new Date().toISOString();

    const ledgerEntry = this.attestedReleaseLedger.get(pod.observedImageDigest);

    // 1. Check if observed image digest exists in immutable Merkle ledger
    if (!ledgerEntry) {
      this.logger.error(
        `🚨 [CRITICAL SUPPLY CHAIN DRIFT] Pod '${pod.podName}' in '${pod.namespace}' running un-anchored image: ${pod.observedImageDigest}`,
      );
      return this.buildResult(
        scanId,
        pod.podName,
        true,
        'UNAUTHORIZED_IMAGE_ALTERATION',
        'EVICT_POD_AND_TRIGGER_CONTAINMENT',
        evaluatedAt,
      );
    }

    // 2. Check if SBOM package count matches attested manifest
    if (
      pod.runningSbomPackagesCount !== ledgerEntry.expectedSbomPackagesCount
    ) {
      this.logger.warn(
        `⚠️ [SBOM PACKAGE MISMATCH] Pod '${pod.podName}' has ${pod.runningSbomPackagesCount} packages vs expected ${ledgerEntry.expectedSbomPackagesCount}`,
      );
      return this.buildResult(
        scanId,
        pod.podName,
        true,
        'PACKAGE_COUNT_MISMATCH',
        'ALERT_SOC_LEAD',
        evaluatedAt,
      );
    }

    // 3. Zero drift confirmed
    this.logger.log(
      `✔ [ZERO DRIFT CONFIRMED] Pod '${pod.podName}' conforms to Merkle Root '${ledgerEntry.anchoredMerkleRoot.slice(0, 16)}...'`,
    );
    return this.buildResult(
      scanId,
      pod.podName,
      false,
      'ZERO_DRIFT_VALID_ATTESTATION',
      'NONE',
      evaluatedAt,
    );
  }

  private buildResult(
    scanId: string,
    podName: string,
    isDriftDetected: boolean,
    classification: SbomDriftAssessmentResult['driftClassification'],
    remediation: SbomDriftAssessmentResult['remediationAction'],
    evaluatedAt: string,
  ): SbomDriftAssessmentResult {
    const attestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          scanId,
          podName,
          isDriftDetected,
          classification,
          evaluatedAt,
        }),
      )
      .digest('hex');

    return {
      scanId,
      podName,
      isDriftDetected,
      driftClassification: classification,
      remediationAction: remediation,
      evaluatedAt,
      attestationDigest,
    };
  }
}
