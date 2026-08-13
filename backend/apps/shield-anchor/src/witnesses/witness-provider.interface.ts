export interface WitnessReceiptResult {
  witnessId: string;
  witnessType: string;
  receiptHash: string;
  signature?: string;
  publicKey?: string;
  algorithm?: string;
}

/** Real witness integrations (public blockchain timestamping, RFC 3161 TSA, etc.) plug in behind this later — out of scope this pass. */
export interface WitnessProvider {
  readonly witnessType: string;
  attest(merkleRoot: string): Promise<WitnessReceiptResult>;
}
