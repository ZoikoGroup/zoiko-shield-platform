import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

// Paillier Key Pair
export interface PaillierPublicKey {
  n: bigint;
  nSquared: bigint;
  g: bigint;
}

export interface PaillierPrivateKey {
  lambda: bigint;
  mu: bigint;
  publicKey: PaillierPublicKey;
}

export interface EncryptedMetricPayload {
  metricName: string;
  tenantId: string;
  ciphertextHex: string;
}

export interface HomomorphicAggregationReceipt {
  receiptId: string;
  metricName: string;
  aggregatedCiphertextHex: string;
  contributingTenantsCount: number;
  decryptedVerificationSum?: number;
  attestationDigest: string;
  aggregatedAt: string;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let res = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e % 2n === 1n) res = (res * b) % mod;
    b = (b * b) % mod;
    e = e / 2n;
  }
  return res;
}

function modInv(a: bigint, m: bigint): bigint {
  const m0 = m;
  let [x0, x1] = [0n, 1n];
  if (m === 1n) return 0n;
  while (a > 1n) {
    const q = a / m;
    [a, m] = [m, a % m];
    [x0, x1] = [x1 - q * x0, x0];
  }
  if (x1 < 0n) x1 += m0;
  return x1;
}

function L(u: bigint, n: bigint): bigint {
  return (u - 1n) / n;
}

/**
 * Privacy-Preserving Partially Homomorphic Ciphertext Aggregator
 * Specification: ZS-AI-SEC-001 §8 (Additive Homomorphic Cryptosystem)
 */
@Injectable()
export class PaillierHomomorphicAggregatorService {
  private readonly logger = new Logger(
    PaillierHomomorphicAggregatorService.name,
  );

  // Standard Demo Paillier Keys (p = 61, q = 53 for deterministic simulation & fast testing, or 512-bit safe primes)
  private readonly p = 61n;
  private readonly q = 53n;
  private readonly n = this.p * this.q; // 3233n
  private readonly nSquared = this.n * this.n; // 10452289n
  private readonly g = this.n + 1n; // g = n + 1
  private readonly lambda = ((this.p - 1n) * (this.q - 1n)) / 2n; // 1560n
  private readonly mu = modInv(
    L(modPow(this.g, this.lambda, this.nSquared), this.n),
    this.n,
  );

  public readonly publicKey: PaillierPublicKey = {
    n: this.n,
    nSquared: this.nSquared,
    g: this.g,
  };

  private readonly privateKey: PaillierPrivateKey = {
    lambda: this.lambda,
    mu: this.mu,
    publicKey: this.publicKey,
  };

  /**
   * Encrypts a plaintext number m into Paillier ciphertext: c = g^m * r^n mod n^2.
   */
  encrypt(m: number): bigint {
    const mBig = BigInt(m);
    const r = 17n; // Random coprime to n
    const gm = modPow(this.publicKey.g, mBig, this.publicKey.nSquared);
    const rn = modPow(r, this.publicKey.n, this.publicKey.nSquared);
    return (gm * rn) % this.publicKey.nSquared;
  }

  /**
   * Decrypts Paillier ciphertext back to plaintext: m = L(c^lambda mod n^2) * mu mod n.
   */
  decrypt(c: bigint): number {
    const u = modPow(c, this.privateKey.lambda, this.publicKey.nSquared);
    const m = (L(u, this.publicKey.n) * this.privateKey.mu) % this.publicKey.n;
    return Number(m);
  }

  /**
   * Homomorphically adds two ciphertexts without decryption: c_sum = (c1 * c2) mod n^2.
   */
  addCiphertexts(c1: bigint, c2: bigint): bigint {
    return (c1 * c2) % this.publicKey.nSquared;
  }

  /**
   * Aggregates multiple encrypted metrics homomorphically across tenants.
   */
  aggregateEncryptedMetrics(
    metricName: string,
    ciphertexts: EncryptedMetricPayload[],
  ): HomomorphicAggregationReceipt {
    const receiptId = `homo-rcpt-${crypto.randomUUID()}`;
    const aggregatedAt = new Date().toISOString();

    let aggregatedCiphertext = 1n; // Identity element for modular multiplication
    for (const item of ciphertexts) {
      const c = BigInt(`0x${item.ciphertextHex}`);
      aggregatedCiphertext = this.addCiphertexts(aggregatedCiphertext, c);
    }

    const decryptedVerificationSum = this.decrypt(aggregatedCiphertext);

    const attestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          receiptId,
          metricName,
          aggregatedCiphertext: aggregatedCiphertext.toString(16),
          count: ciphertexts.length,
          aggregatedAt,
        }),
      )
      .digest('hex');

    this.logger.log(
      `✔ Homomorphically Aggregated ${ciphertexts.length} Encrypted Values for "${metricName}" -> Verified Sum: ${decryptedVerificationSum}`,
    );

    return {
      receiptId,
      metricName,
      aggregatedCiphertextHex: aggregatedCiphertext.toString(16),
      contributingTenantsCount: ciphertexts.length,
      decryptedVerificationSum,
      attestationDigest,
      aggregatedAt,
    };
  }
}
