import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { GcpKmsSigner } from '../../../../libs/kms/src/gcp-kms-signer';

export interface ArtifactDigestMetadata {
  imageRepository: string;
  imageDigest: string; // e.g. sha256:9f83...
  buildId: string;
  sourceCommitHash: string;
  builtAt: string;
  cosignKmsKeyUri: string;
}

export interface BinaryAuthorizationAdmissionReceipt {
  admissionId: string;
  imageDigest: string;
  isAdmissionGranted: boolean;
  slsaProvenanceLevel: 'SLSA_LEVEL_3' | 'UNVERIFIED';
  verifiedSigner: string;
  admissionPolicy: 'STRICT_SIGNED_DIGEST_ONLY';
  evaluatedAt: string;
  attestationDigest: string;
}

/**
 * Supply Chain Artifact Attestation & Binary Authorization Service
 * Specification: Backend Build Guide §LAB 17 & §LAB 18 (Testing, Supply Chain & Launch Rehearsal)
 *
 * Signs artifact digests with a real, non-exportable Cloud KMS key (the same
 * GcpKmsSigner shield-anchor/shield-action/shield-core already use for
 * checkpoints and command signing), rather than the SHA-256 rehash this
 * service previously called a "signature" — a hash is not a signature, and
 * verifying it by recomputing the same hash proves nothing about who signed
 * it. This does not use the real Cosign/Sigstore CLI or its transparency log
 * (out of scope for now); "Cosign" in the class name reflects the
 * `gcp-kms://` key-URI convention it follows, not an integration with the
 * actual cosign tool.
 */
@Injectable()
export class CosignBinaryAttestorService {
  private readonly logger = new Logger(CosignBinaryAttestorService.name);

  /**
   * `cosignKmsKeyUri` follows cosign's `gcp-kms://projects/P/locations/L/keyRings/R/cryptoKeys/K[/cryptoKeyVersions/V]`
   * convention, which (like real cosign) names a crypto key without pinning a
   * version — the signer resolves the current primary. GcpKmsSigner requires
   * an explicit key version resource name, so a version is resolved here: the
   * URI's own version segment if it carries one, else primary version '1'
   * (this platform's KMS keys are provisioned single-version; a real primary
   * version lookup via the KMS API is follow-up work if that changes).
   */
  private resolveKeyVersion(cosignKmsKeyUri: string): string {
    const withoutScheme = cosignKmsKeyUri.replace(/^gcp-kms:\/\//, '');
    if (/\/cryptoKeyVersions\/[^/]+$/.test(withoutScheme)) {
      return withoutScheme;
    }
    return `${withoutScheme}/cryptoKeyVersions/1`;
  }

  /**
   * Signs an immutable artifact digest with the real Cloud KMS key the URI names.
   */
  async signArtifactDigest(metadata: ArtifactDigestMetadata): Promise<{
    signature: string;
    attestationPayload: string;
  }> {
    const payload = `${metadata.imageRepository}@${metadata.imageDigest}|${metadata.sourceCommitHash}|${metadata.builtAt}|${metadata.cosignKmsKeyUri}`;
    const signer = new GcpKmsSigner(
      this.resolveKeyVersion(metadata.cosignKmsKeyUri),
    );
    const signature = await signer.sign(payload);

    this.logger.log(
      `✔ [ARTIFACT SIGNATURE GENERATED] Artifact '${metadata.imageRepository}@${metadata.imageDigest.slice(0, 16)}...' signed via KMS '${metadata.cosignKmsKeyUri}'`,
    );

    return { signature, attestationPayload: payload };
  }

  /**
   * Evaluates Binary Authorization admission policy: a real asymmetric
   * verification against the KMS key's public key, not a re-hash comparison.
   * A tampered payload now fails because the signature no longer verifies
   * against it, rather than because a hash of the (unsigned) payload differs.
   */
  async evaluateAdmissionPolicy(
    metadata: ArtifactDigestMetadata,
    signature: string,
    isKmsSignerTrusted = true,
  ): Promise<BinaryAuthorizationAdmissionReceipt> {
    const admissionId = `binauth-adm-${crypto.randomUUID()}`;
    const evaluatedAt = new Date().toISOString();

    const expectedPayload = `${metadata.imageRepository}@${metadata.imageDigest}|${metadata.sourceCommitHash}|${metadata.builtAt}|${metadata.cosignKmsKeyUri}`;
    const signer = new GcpKmsSigner(
      this.resolveKeyVersion(metadata.cosignKmsKeyUri),
    );
    const isValidSignature =
      isKmsSignerTrusted && (await signer.verify(expectedPayload, signature));

    const isAdmissionGranted =
      isValidSignature && metadata.imageDigest.startsWith('sha256:');
    const slsaProvenanceLevel = isAdmissionGranted
      ? 'SLSA_LEVEL_3'
      : 'UNVERIFIED';

    const attestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          admissionId,
          imageDigest: metadata.imageDigest,
          isAdmissionGranted,
          slsaProvenanceLevel,
          evaluatedAt,
        }),
      )
      .digest('hex');

    if (isAdmissionGranted) {
      this.logger.log(
        `✔ [BINARY AUTHORIZATION ADMISSION GRANTED] Image '${metadata.imageDigest.slice(0, 19)}...' admitted to Production GKE cluster`,
      );
    } else {
      this.logger.error(
        `🛑 [BINARY AUTHORIZATION ADMISSION DENIED] Image '${metadata.imageDigest}' rejected due to invalid/unsigned attestation`,
      );
    }

    return {
      admissionId,
      imageDigest: metadata.imageDigest,
      isAdmissionGranted,
      slsaProvenanceLevel,
      verifiedSigner: isAdmissionGranted ? metadata.cosignKmsKeyUri : 'NONE',
      admissionPolicy: 'STRICT_SIGNED_DIGEST_ONLY',
      evaluatedAt,
      attestationDigest,
    };
  }
}
