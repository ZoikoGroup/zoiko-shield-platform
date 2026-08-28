import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

// GF(256) Tables for Shamir's Secret Sharing (Polynomial 0x11D: x^8 + x^4 + x^3 + x^2 + 1)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x = x << 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero in GF(256)');
  if (a === 0) return 0;
  return GF_EXP[(GF_LOG[a] + 255 - GF_LOG[b]) % 255];
}

export interface CustodianKeyShare {
  shareIndex: number; // x coordinate (1..255)
  custodianId: string;
  custodianRole: string;
  shareHex: string; // y coordinate vector in hex
}

export interface BreakGlassVaultSession {
  sessionId: string;
  tenantId: string;
  thresholdK: number;
  totalSharesN: number;
  custodianShares: CustodianKeyShare[];
  createdAt: string;
}

export interface QuorumRecoveryResult {
  sessionId: string;
  recoveredSecret: string;
  participatingCustodians: string[];
  quorumMet: boolean;
  breakGlassAttestationDigest: string;
  unlockedAt: string;
}

/**
 * Shamir (k-of-n) Break-Glass Multi-Sig Quorum Engine
 * Specification: ZS-SEC-KEY-001 §9 & ZS-SOAR-DISP-001 §6
 */
@Injectable()
export class BreakGlassQuorumService {
  private readonly logger = new Logger(BreakGlassQuorumService.name);

  /**
   * Splits a master break-glass secret into N shares with threshold K.
   */
  generateBreakGlassShares(req: {
    tenantId: string;
    secretText: string;
    thresholdK: number;
    totalSharesN: number;
    custodians: { custodianId: string; custodianRole: string }[];
  }): BreakGlassVaultSession {
    if (
      req.thresholdK < 2 ||
      req.thresholdK > req.totalSharesN ||
      req.totalSharesN > 255
    ) {
      throw new Error(
        `Invalid threshold: k=${req.thresholdK}, n=${req.totalSharesN}`,
      );
    }
    if (req.custodians.length !== req.totalSharesN) {
      throw new Error(`Custodian list length must equal totalSharesN`);
    }

    const secretBytes = Buffer.from(req.secretText, 'utf8');
    const secretLen = secretBytes.length;
    const k = req.thresholdK;
    const n = req.totalSharesN;

    // For each byte in the secret, generate a random polynomial of degree (k - 1)
    // P(x) = secret + a1*x + a2*x^2 + ... + a_{k-1}*x^{k-1}
    const coefficients: Uint8Array[] = [];
    for (let byteIdx = 0; byteIdx < secretLen; byteIdx++) {
      const poly = new Uint8Array(k);
      poly[0] = secretBytes[byteIdx]; // P(0) = secret byte
      const randBytes = crypto.randomBytes(k - 1);
      for (let c = 1; c < k; c++) {
        poly[c] = randBytes[c - 1];
      }
      coefficients.push(poly);
    }

    // Evaluate polynomial for each custodian x in 1..n
    const custodianShares: CustodianKeyShare[] = [];
    for (let i = 0; i < n; i++) {
      const x = i + 1;
      const shareData = new Uint8Array(secretLen);

      for (let byteIdx = 0; byteIdx < secretLen; byteIdx++) {
        const poly = coefficients[byteIdx];
        let y = 0;
        let xPower = 1;
        for (let c = 0; c < k; c++) {
          y ^= gfMul(poly[c], xPower);
          xPower = gfMul(xPower, x);
        }
        shareData[byteIdx] = y;
      }

      custodianShares.push({
        shareIndex: x,
        custodianId: req.custodians[i].custodianId,
        custodianRole: req.custodians[i].custodianRole,
        shareHex: Buffer.from(shareData).toString('hex'),
      });
    }

    const sessionId = `bg-session-${crypto.randomUUID()}`;
    this.logger.log(
      `Provisioned Break-Glass Quorum Vault [${sessionId}] (${k}-of-${n} threshold)`,
    );

    return {
      sessionId,
      tenantId: req.tenantId,
      thresholdK: k,
      totalSharesN: n,
      custodianShares,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Reconstructs the master break-glass secret using Lagrange interpolation over GF(256).
   */
  reconstructMasterSecret(
    submittedShares: CustodianKeyShare[],
    thresholdK: number,
  ): QuorumRecoveryResult {
    if (submittedShares.length < thresholdK) {
      throw new UnauthorizedException(
        `Quorum threshold NOT met: Provided ${submittedShares.length} shares, required minimum ${thresholdK}`,
      );
    }

    // Use the first thresholdK unique shares
    const uniqueShares = submittedShares.slice(0, thresholdK);
    const secretLen = Buffer.from(uniqueShares[0].shareHex, 'hex').length;
    const recoveredBytes = new Uint8Array(secretLen);

    // Lagrange Interpolation at x = 0
    // L_i(0) = Product_{j != i} (x_j / (x_j ^ x_i))
    for (let byteIdx = 0; byteIdx < secretLen; byteIdx++) {
      let secretByte = 0;

      for (let i = 0; i < thresholdK; i++) {
        const xi = uniqueShares[i].shareIndex;
        const yi = Buffer.from(uniqueShares[i].shareHex, 'hex')[byteIdx];

        let basisLagrange = 1;
        for (let j = 0; j < thresholdK; j++) {
          if (i !== j) {
            const xj = uniqueShares[j].shareIndex;
            const numerator = xj;
            const denominator = xj ^ xi;
            basisLagrange = gfMul(basisLagrange, gfDiv(numerator, denominator));
          }
        }

        secretByte ^= gfMul(yi, basisLagrange);
      }

      recoveredBytes[byteIdx] = secretByte;
    }

    const recoveredSecret = Buffer.from(recoveredBytes).toString('utf8');
    const sessionId = `bg-unlock-${crypto.randomUUID()}`;
    const unlockedAt = new Date().toISOString();

    const breakGlassAttestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          sessionId,
          participants: uniqueShares.map((s) => s.custodianId),
          unlockedAt,
        }),
      )
      .digest('hex');

    this.logger.warn(
      `🚨 [BREAK-GLASS VAULT UNLOCKED] Secret recovered by Quorum of ${uniqueShares.length} Custodians!`,
    );

    return {
      sessionId,
      recoveredSecret,
      participatingCustodians: uniqueShares.map((s) => s.custodianId),
      quorumMet: true,
      breakGlassAttestationDigest,
      unlockedAt,
    };
  }
}
