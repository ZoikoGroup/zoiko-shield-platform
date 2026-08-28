import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

export interface HybridDualSignatureResult {
  signatureId: string;
  algorithmSuite: 'HYBRID_ECDSA_P256_ML_DSA_65';
  keyId: string;
  classicalSignatureHex: string;
  pqcSignatureHex: string;
  hybridCombinedSignatureBase64: string;
  classicalPublicKeyPem: string;
  pqcPublicKeyBase64: string;
  signedAt: string;
}

export interface HybridVerificationResult {
  isValid: boolean;
  classicalValid: boolean;
  pqcValid: boolean;
  tamperDetected: boolean;
  verifiedAt: string;
}

/**
 * Post-Quantum Hybrid Dual-Signing Engine (ZS-T0-TECH-001 §5.3 / ZS-T0-AUD-001 §8)
 * Combines Classical ECDSA P-256 with NIST FIPS 204 ML-DSA-65 (Crystals-Dilithium)
 * to future-proof Merkle epoch roots and compliance evidence against quantum decryption.
 */
@Injectable()
export class PqcDualSignerService {
  private readonly logger = new Logger(PqcDualSignerService.name);
  private readonly keyId: string;

  // Classical Keypair (ECDSA P-256)
  private readonly classicalPrivateKey: crypto.KeyObject;
  private readonly classicalPublicKeyPem: string;

  private readonly pqcPrivateKey: Uint8Array;
  private readonly pqcPublicKeyBase64: string;

  constructor() {
    this.keyId = `pqc-hsm-${crypto.randomUUID().slice(0, 8)}`;

    // 1. Initialize Classical ECDSA P-256 Keypair
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    this.classicalPrivateKey = privateKey;
    this.classicalPublicKeyPem = publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();

    // 2. Initialize FIPS 204 ML-DSA-65 key material.
    const pqcKeys = ml_dsa65.keygen();
    this.pqcPrivateKey = pqcKeys.secretKey;
    this.pqcPublicKeyBase64 = Buffer.from(pqcKeys.publicKey).toString('base64');

    this.logger.log(`Initialized PQC Hybrid Dual-Signer [KeyId: ${this.keyId}] (ECDSA-P256 + ML-DSA-65)`);
  }

  /**
   * Generates a hybrid dual-signature over payload using both Classical and Post-Quantum algorithms.
   */
  async signHybrid(payload: string | Buffer): Promise<HybridDualSignatureResult> {
    const dataBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf-8');
    const signatureId = `sig-pqc-${crypto.randomUUID()}`;

    // 1. Classical ECDSA P-256 Signature
    const classicalSigner = crypto.createSign('SHA256');
    classicalSigner.update(dataBuffer);
    classicalSigner.end();
    const classicalSignatureHex = classicalSigner.sign(this.classicalPrivateKey).toString('hex');

    // 2. FIPS 204 ML-DSA-65 signature.
    const pqcSignatureHex = Buffer.from(
      ml_dsa65.sign(new Uint8Array(dataBuffer), this.pqcPrivateKey),
    ).toString('hex');

    // 3. Hybrid Combined Container Signature
    const combinedContainer = JSON.stringify({
      sigId: signatureId,
      suite: 'HYBRID_ECDSA_P256_ML_DSA_65',
      cSig: classicalSignatureHex,
      qSig: pqcSignatureHex,
    });
    const hybridCombinedSignatureBase64 = Buffer.from(combinedContainer, 'utf-8').toString('base64');

    return {
      signatureId,
      algorithmSuite: 'HYBRID_ECDSA_P256_ML_DSA_65',
      keyId: this.keyId,
      classicalSignatureHex,
      pqcSignatureHex,
      hybridCombinedSignatureBase64,
      classicalPublicKeyPem: this.classicalPublicKeyPem,
      pqcPublicKeyBase64: this.pqcPublicKeyBase64,
      signedAt: new Date().toISOString(),
    };
  }

  /**
   * Verifies both Classical ECDSA and Post-Quantum ML-DSA signatures.
   */
  verifyHybrid(payload: string | Buffer, sigResult: HybridDualSignatureResult): HybridVerificationResult {
    const dataBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf-8');

    // 1. Verify Classical Signature
    let classicalValid = false;
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(dataBuffer);
      verify.end();
      classicalValid = verify.verify(
        sigResult.classicalPublicKeyPem,
        Buffer.from(sigResult.classicalSignatureHex, 'hex'),
      );
    } catch {
      classicalValid = false;
    }

    // 2. Verify FIPS 204 ML-DSA-65 signature.
    let pqcValid = false;
    try {
      pqcValid = ml_dsa65.verify(
        new Uint8Array(Buffer.from(sigResult.pqcSignatureHex, 'hex')),
        new Uint8Array(dataBuffer),
        new Uint8Array(Buffer.from(sigResult.pqcPublicKeyBase64, 'base64')),
      );
    } catch {
      pqcValid = false;
    }

    const isValid = classicalValid && pqcValid;
    const tamperDetected = !isValid;

    return {
      isValid,
      classicalValid,
      pqcValid,
      tamperDetected,
      verifiedAt: new Date().toISOString(),
    };
  }
}
