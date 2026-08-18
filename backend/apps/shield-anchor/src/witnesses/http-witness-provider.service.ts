import { createHash, verify as verifySignature } from 'crypto';
import { WitnessReceiptResult } from './witness-provider.interface';

export class HttpWitnessProvider {
  private urls(): string[] {
    return (process.env.ANCHOR_WITNESS_URLS ?? '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
  }

  private trustedKeys(): Record<string, string> {
    try {
      return JSON.parse(
        process.env.ANCHOR_WITNESS_PUBLIC_KEYS ?? '{}',
      ) as Record<string, string>;
    } catch {
      throw new Error(
        'ANCHOR_WITNESS_PUBLIC_KEYS must be a JSON object keyed by witness ID',
      );
    }
  }

  async attestAll(merkleRoot: string): Promise<WitnessReceiptResult[]> {
    const urls = this.urls();
    const trustedKeys = this.trustedKeys();
    if (process.env.NODE_ENV === 'production' && urls.length < 2) {
      throw new Error(
        'At least two independently operated ANCHOR_WITNESS_URLS are required in production',
      );
    }
    if (
      process.env.NODE_ENV === 'production' &&
      urls.some((url) => !url.startsWith('https://'))
    ) {
      throw new Error('Production witness endpoints must use HTTPS');
    }
    return Promise.all(
      urls.map(async (url) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ merkleRoot, hashAlgorithm: 'SHA-256' }),
        });
        if (!response.ok)
          throw new Error(`Witness '${url}' returned ${response.status}`);
        const receipt = (await response.json()) as WitnessReceiptResult;
        if (
          !receipt.witnessId ||
          !receipt.signature ||
          !receipt.algorithm ||
          !receipt.receiptHash
        ) {
          throw new Error(
            `Witness '${url}' returned an incomplete signed receipt`,
          );
        }
        const publicKey = trustedKeys[receipt.witnessId];
        if (!publicKey)
          throw new Error(
            `Witness '${receipt.witnessId}' has no pinned public key`,
          );
        const expectedHash = createHash('sha256')
          .update(`${receipt.witnessId}.${merkleRoot}`)
          .digest('hex');
        if (receipt.receiptHash !== expectedHash)
          throw new Error(
            `Witness '${receipt.witnessId}' receipt hash is invalid`,
          );
        if (!['Ed25519', 'ECDSA_SHA_256'].includes(receipt.algorithm)) {
          throw new Error(
            `Witness '${receipt.witnessId}' uses unsupported algorithm '${receipt.algorithm}'`,
          );
        }
        const digestAlgorithm =
          receipt.algorithm === 'Ed25519' ? null : 'sha256';
        const valid = verifySignature(
          digestAlgorithm,
          Buffer.from(receipt.receiptHash, 'utf-8'),
          publicKey,
          Buffer.from(receipt.signature, 'hex'),
        );
        if (!valid)
          throw new Error(
            `Witness '${receipt.witnessId}' signature is invalid`,
          );
        return {
          ...receipt,
          publicKey,
          witnessType: receipt.witnessType || 'HTTP_SIGNED',
        };
      }),
    );
  }
}
