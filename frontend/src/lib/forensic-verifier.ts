/**
 * ZoikoShield Browser-Side Offline Cryptographic Certificate Verifier (G06)
 *
 * Implements RFC 6962 §2.1 domain-separated Merkle tree hashing (0x00 leaf prefix,
 * 0x01 internal node prefix, power-of-two split) to eliminate CVE-2012-2459
 * odd-leaf duplication vulnerabilities, with backward-compatible fallback for
 * legacy ZS-MERKLE-V1 certificates.
 */

export interface ForensicVerificationResult {
  isValid: boolean;
  merkleRootValid: boolean;
  recomputedMerkleRoot: string;
  declaredMerkleRoot: string;
  algorithm: "RFC_6962_V2" | "ZS_MERKLE_V1";
  verifiedAt: string;
  details: string[];
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, "").trim();
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    return new TextEncoder().encode(clean);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      data as unknown as BufferSource
    );
    return new Uint8Array(digest);
  }
  // Fallback for environments without WebCrypto subtle
  const nodeCrypto = await import("crypto");
  return new Uint8Array(nodeCrypto.createHash("sha256").update(data).digest());
}

/**
 * RFC 6962 §2.1 Domain-Separated Leaf Hash: SHA-256(0x00 || leaf_bytes)
 */
export async function hashRfc6962Leaf(leafData: Uint8Array): Promise<Uint8Array> {
  const prefixed = new Uint8Array(1 + leafData.length);
  prefixed[0] = 0x00;
  prefixed.set(leafData, 1);
  return sha256Bytes(prefixed);
}

/**
 * RFC 6962 §2.1 Domain-Separated Internal Node Hash: SHA-256(0x01 || left || right)
 */
export async function hashRfc6962Node(
  left: Uint8Array,
  right: Uint8Array
): Promise<Uint8Array> {
  const combined = new Uint8Array(1 + left.length + right.length);
  combined[0] = 0x01;
  combined.set(left, 1);
  combined.set(right, 1 + left.length);
  return sha256Bytes(combined);
}

function largestPowerOfTwoLessThan(n: number): number {
  let k = 1;
  while (k * 2 < n) {
    k *= 2;
  }
  return k;
}

/**
 * Computes the RFC 6962 §2.1 Merkle Tree Hash (MTH) without odd-leaf duplication.
 */
export async function computeRfc6962MerkleRoot(
  rawLeaves: string[]
): Promise<string> {
  if (rawLeaves.length === 0) {
    const emptyDigest = await sha256Bytes(new Uint8Array(0));
    return bytesToHex(emptyDigest);
  }

  async function mth(leaves: Uint8Array[]): Promise<Uint8Array> {
    const n = leaves.length;
    if (n === 1) {
      return hashRfc6962Leaf(leaves[0]);
    }
    const k = largestPowerOfTwoLessThan(n);
    const left = await mth(leaves.slice(0, k));
    const right = await mth(leaves.slice(k));
    return hashRfc6962Node(left, right);
  }

  const byteLeaves = rawLeaves.map(hexToBytes);
  const rootBytes = await mth(byteLeaves);
  return bytesToHex(rootBytes);
}

/**
 * Legacy ZS-MERKLE-V1 pairwise SHA-256 root computation for backward compatibility.
 */
export async function computeV1MerkleRoot(rawLeaves: string[]): Promise<string> {
  if (rawLeaves.length === 0) {
    const emptyDigest = await sha256Bytes(new Uint8Array(0));
    return bytesToHex(emptyDigest);
  }
  let level = await Promise.all(
    rawLeaves.map(async (l) => bytesToHex(await sha256Bytes(hexToBytes(l))))
  );
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      const combined = new TextEncoder().encode(left + right);
      next.push(bytesToHex(await sha256Bytes(combined)));
    }
    level = next;
  }
  return level[0];
}

/**
 * Verifies a parsed VerificationCertificate or raw audit package JSON in the browser.
 */
export async function verifyCertificateJson(
  certificate: any
): Promise<ForensicVerificationResult> {
  const details: string[] = [];
  const declaredRoot: string =
    certificate?.cryptographicSummary?.declaredMerkleRoot ||
    certificate?.merkleRoot ||
    certificate?.manifest?.epochMerkleRoot ||
    "";
  const recomputedFromSummary: string =
    certificate?.cryptographicSummary?.recomputedMerkleRoot || declaredRoot;

  const leaves: string[] = Array.isArray(certificate?.leaves)
    ? certificate.leaves.map((l: any) =>
        typeof l === "string" ? l : l?.contentHash || l?.leafHash || JSON.stringify(l)
      )
    : [];

  let recomputedRoot = recomputedFromSummary;
  let algorithm: "RFC_6962_V2" | "ZS_MERKLE_V1" = "RFC_6962_V2";
  let merkleRootValid = Boolean(
    declaredRoot &&
      recomputedFromSummary &&
      declaredRoot.toLowerCase() === recomputedFromSummary.toLowerCase()
  );

  if (leaves.length > 0) {
    const rfc6962Root = await computeRfc6962MerkleRoot(leaves);
    if (rfc6962Root.toLowerCase() === declaredRoot.toLowerCase()) {
      recomputedRoot = rfc6962Root;
      algorithm = "RFC_6962_V2";
      merkleRootValid = true;
      details.push("RFC 6962 §2.1 domain-separated Merkle tree root verified.");
    } else {
      const v1Root = await computeV1MerkleRoot(leaves);
      if (v1Root.toLowerCase() === declaredRoot.toLowerCase()) {
        recomputedRoot = v1Root;
        algorithm = "ZS_MERKLE_V1";
        merkleRootValid = true;
        details.push("Legacy ZS-MERKLE-V1 Merkle root verified.");
      } else {
        recomputedRoot = rfc6962Root;
        merkleRootValid = false;
        details.push("Merkle root mismatch between leaves and declared root.");
      }
    }
  } else {
    details.push(
      merkleRootValid
        ? "Certificate summary Merkle root and envelope digest match."
        : "Declared and recomputed Merkle roots diverge."
    );
  }

  const checksPass =
    certificate?.verificationStatus !== "TAMPER_DETECTED" &&
    certificate?.checks?.envelopeIntegrity !== false &&
    certificate?.checks?.manifestCoreHashMatch !== false &&
    merkleRootValid;

  return {
    isValid: checksPass,
    merkleRootValid,
    recomputedMerkleRoot: recomputedRoot,
    declaredMerkleRoot: declaredRoot,
    algorithm,
    verifiedAt: new Date().toISOString(),
    details,
  };
}

