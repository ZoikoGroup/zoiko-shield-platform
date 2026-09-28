import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { p256, p256_hasher } from '@noble/curves/nist.js';
import { createOPRF } from '@noble/curves/abstract/oprf.js';
import { sha256 } from '@noble/hashes/sha2.js';

const oprfSuite = createOPRF({
  name: 'P256-SHA256',
  Point: p256.Point,
  // Wrapped rather than passed directly: @noble/hashes' sha256 return type
  // (Uint8Array<ArrayBufferLike>) doesn't structurally satisfy this lib's
  // stricter Uint8Array<ArrayBuffer> generic under this project's TS config,
  // even though it's the exact usage documented by @noble/curves itself.
  hash: (msg) => sha256(msg) as unknown as Uint8Array<ArrayBuffer>,
  hashToGroup: p256_hasher.hashToCurve,
  hashToScalar: p256_hasher.hashToScalar,
});

const toBytes = (s: string) => new TextEncoder().encode(s.trim().toLowerCase());
const toHex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const fromHex = (h: string) => new Uint8Array(Buffer.from(h, 'hex'));

export interface MpcPsiQueryItem {
  /** Hex-encoded blinded curve point — opaque to the server without the
   * client's blind scalar. Never a hash of the raw indicator; never
   * derived from a shared/known secret. */
  blindedIndicatorHash: string;
  metadataTag?: string;
}

export interface MpcBlindEvaluationResult {
  metadataTag?: string;
  /** Hex-encoded evaluated point — the server's blind-signature-like
   * response. Meaningless without the client's own blind scalar. */
  evaluatedHex: string;
}

export interface MpcServerDatasetEntry {
  iocType: 'IP' | 'DOMAIN' | 'FILE_HASH_SHA256';
  /** OPRF output for this known-bad indicator. Safe to reveal: recovering
   * the raw indicator from it requires either brute-forcing a low-entropy
   * input space or an OPRF blind, neither of which this value carries. */
  oprfOutputHex: string;
  threatConfidence: number;
  threatActorCampaign: string;
}

export interface MpcMatchResult {
  receiptId: string;
  tenantId: string;
  totalQueriedCount: number;
  matchedIndicatorsCount: number;
  matches: Array<{
    iocType: 'IP' | 'DOMAIN' | 'FILE_HASH_SHA256';
    threatConfidence: number;
    threatActorCampaign: string;
  }>;
  attestationDigest: string;
  evaluatedAt: string;
}

/**
 * Zero-Knowledge Multi-Party Computation (MPC) Threat Intelligence Matcher —
 * SERVER role only.
 * Specification: ZS-SOC-FEED-001 §10 (Privacy-Preserving Threat Feeds & Private Set Intersection)
 *
 * Real 2-party Private Set Intersection via RFC 9497 OPRF (@noble/curves,
 * already a transitive dependency via @noble/post-quantum — no new package).
 * This class's public surface takes only opaque blinded curve points: no
 * parameter here can carry a tenant's raw IOC or blinding secret, unlike the
 * prior version, whose `evaluatePrivateSetIntersection(tenantId,
 * tenantSecretKey, ...)` took the tenant's secret key as a plaintext
 * server-side argument — the server could trivially recompute anything the
 * tenant "blinded" with it, which defeats the entire point of PSI. The
 * caller-side blinding/finalizing is TenantPsiClient in this same file: the
 * server genuinely cannot determine which of its indicators matched a
 * tenant's query — only the caller who performs `finalize` can compute
 * that, which is what a real PSI protocol guarantees.
 */
@Injectable()
export class MpcThreatMatcherService {
  private readonly logger = new Logger(MpcThreatMatcherService.name);

  // Persistent server OPRF key, derived deterministically from an
  // operator-provided seed so blinded queries stay verifiable across
  // restarts (a random key each boot would silently invalidate every
  // previously-issued blind). Never logged, never returned to a caller.
  private readonly secretKey: Uint8Array;

  private readonly globalMaliciousDataset = [
    {
      rawIoc: '198.51.100.99',
      iocType: 'IP' as const,
      campaign: 'APT29_CozyBear_C2',
      confidence: 0.99,
    },
    {
      rawIoc: 'malware-c2-drop.attacker.org',
      iocType: 'DOMAIN' as const,
      campaign: 'DarkSide_Ransomware_Gateway',
      confidence: 0.95,
    },
    {
      rawIoc:
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      iocType: 'FILE_HASH_SHA256' as const,
      campaign: 'Lazarus_Backdoor_Payload',
      confidence: 0.98,
    },
  ];

  private readonly datasetCache: MpcServerDatasetEntry[];

  constructor() {
    const seedMaterial =
      process.env.MPC_THREAT_FEED_OPRF_SEED?.trim() ||
      'DEV_ONLY_MPC_OPRF_SEED_DO_NOT_USE_IN_PRODUCTION';
    if (!process.env.MPC_THREAT_FEED_OPRF_SEED?.trim()) {
      this.logger.warn(
        'MPC_THREAT_FEED_OPRF_SEED is not set — using a fixed development seed. Set it in production so the OPRF key is not a public literal.',
      );
    }
    const seed = crypto.createHash('sha256').update(seedMaterial).digest();
    const keys = oprfSuite.oprf.deriveKeyPair(seed, new Uint8Array());
    this.secretKey = keys.secretKey;

    // Precompute this server's own dataset OPRF outputs once (self-play:
    // the server has no privacy to protect from itself).
    this.datasetCache = this.globalMaliciousDataset.map((item) => {
      const input = toBytes(item.rawIoc);
      const { blind, blinded } = oprfSuite.oprf.blind(input);
      const evaluated = oprfSuite.oprf.blindEvaluate(this.secretKey, blinded);
      const output = oprfSuite.oprf.finalize(input, blind, evaluated);
      return {
        iocType: item.iocType,
        oprfOutputHex: toHex(output),
        threatConfidence: item.confidence,
        threatActorCampaign: item.campaign,
      };
    });
  }

  /**
   * The server's own indicator set in OPRF-output form — safe to reveal
   * (see MpcServerDatasetEntry doc comment). A caller uses this together
   * with TenantPsiClient.finalizeAndIntersect to compute the intersection
   * locally; this class never computes it.
   */
  getSafeToRevealDataset(): MpcServerDatasetEntry[] {
    return this.datasetCache;
  }

  /**
   * Evaluates blinded queries with the server's OPRF key. Takes only opaque
   * blinded curve points — no tenant secret or raw indicator ever reaches
   * this method.
   */
  evaluateBlindedQueries(
    blindedQueries: MpcPsiQueryItem[],
  ): MpcBlindEvaluationResult[] {
    return blindedQueries.map((q) => {
      const blinded = fromHex(q.blindedIndicatorHash);
      const evaluated = oprfSuite.oprf.blindEvaluate(this.secretKey, blinded);
      return { metadataTag: q.metadataTag, evaluatedHex: toHex(evaluated) };
    });
  }
}

/**
 * Tenant/client role for the OPRF-based PSI protocol. Pure, stateless
 * functions — no server key, no network call, no dependency on
 * MpcThreatMatcherService. The caller keeps `blind` scalars locally between
 * `blindIndicators` and `finalizeAndIntersect`; they must never be sent to
 * the server.
 */
export const TenantPsiClient = {
  /** Blinds each raw indicator locally. Send only `blindedQuery` to the server. */
  blindIndicators(rawIocs: string[]): Array<{
    rawIoc: string;
    blind: Uint8Array;
    blindedQuery: MpcPsiQueryItem;
  }> {
    return rawIocs.map((rawIoc, i) => {
      const { blind, blinded } = oprfSuite.oprf.blind(toBytes(rawIoc));
      return {
        rawIoc,
        blind,
        blindedQuery: {
          blindedIndicatorHash: toHex(blinded),
          metadataTag: `q-${i}`,
        },
      };
    });
  },

  /**
   * Unblinds the server's evaluation results and compares locally against
   * the server's safe-to-reveal dataset. Only this step — run entirely by
   * the caller — determines the intersection; the server never sees it.
   */
  finalizeAndIntersect(
    tenantId: string,
    blinded: Array<{
      rawIoc: string;
      blind: Uint8Array;
      blindedQuery: MpcPsiQueryItem;
    }>,
    evaluationResults: MpcBlindEvaluationResult[],
    serverDataset: MpcServerDatasetEntry[],
  ): MpcMatchResult {
    const receiptId = `mpc-psi-rcpt-${crypto.randomUUID()}`;
    const evaluatedAt = new Date().toISOString();
    const datasetByOutput = new Map(
      serverDataset.map((entry) => [entry.oprfOutputHex, entry]),
    );

    const matches: MpcMatchResult['matches'] = [];
    for (const item of blinded) {
      const result = evaluationResults.find(
        (r) => r.metadataTag === item.blindedQuery.metadataTag,
      );
      if (!result) continue;
      const output = oprfSuite.oprf.finalize(
        toBytes(item.rawIoc),
        item.blind,
        fromHex(result.evaluatedHex),
      );
      const match = datasetByOutput.get(toHex(output));
      if (match) {
        matches.push({
          iocType: match.iocType,
          threatConfidence: match.threatConfidence,
          threatActorCampaign: match.threatActorCampaign,
        });
      }
    }

    const attestationDigest = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          receiptId,
          tenantId,
          queriedCount: blinded.length,
          matchedCount: matches.length,
          evaluatedAt,
        }),
      )
      .digest('hex');

    return {
      receiptId,
      tenantId,
      totalQueriedCount: blinded.length,
      matchedIndicatorsCount: matches.length,
      matches,
      attestationDigest,
      evaluatedAt,
    };
  },
};
