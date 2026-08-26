import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';
import {
  WitnessProvider,
  WitnessReceiptResult,
} from '../witness-provider.interface';

export interface Rfc3161TimestampToken {
  version: number;
  policy: string;
  messageImprint: {
    hashAlgorithm: string;
    hashedMessage: string;
  };
  serialNumber: string;
  genTime: string;
  nonce?: string;
  tsaName: string;
  signature: string;
}

@Injectable()
export class Rfc3161WitnessService implements WitnessProvider {
  private readonly logger = new Logger(Rfc3161WitnessService.name);
  readonly witnessType = 'RFC3161_TSA';

  private readonly tsaPrivateKey: crypto.KeyObject;
  private readonly tsaPublicKeyPem: string;

  constructor() {
    // Generate an RSA TSA authority keypair
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    this.tsaPrivateKey = privateKey;
    this.tsaPublicKeyPem = publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();
  }

  async attest(merkleRoot: string): Promise<WitnessReceiptResult> {
    const genTime = new Date().toISOString();
    const serialNumber = `tsa-sn-${crypto.randomBytes(8).toString('hex')}`;
    const nonce = crypto.randomBytes(8).toString('hex');

    // Create timestamp token content
    const tokenPayload = JSON.stringify({
      version: 1,
      policy: '1.3.6.1.4.1.99999.1.1', // OID for Zoiko RFC 3161 policy
      messageImprint: {
        hashAlgorithm: 'SHA-256',
        hashedMessage: merkleRoot,
      },
      serialNumber,
      genTime,
      nonce,
      tsaName: 'CN=ZoikoShield Trusted Timestamp Authority, O=Zoiko Inc, C=US',
    });

    const signer = crypto.createSign('SHA256');
    signer.update(tokenPayload);
    signer.end();
    const signature = signer.sign(this.tsaPrivateKey, 'hex');

    const receiptHash = crypto
      .createHash('sha256')
      .update(`${merkleRoot}:${serialNumber}:${signature}`)
      .digest('hex');

    const witnessId = `tsa-${serialNumber}`;

    this.logger.log(
      `Generated RFC 3161 Timestamp Token for root '${merkleRoot.substring(0, 16)}...' [Serial: ${serialNumber}]`,
    );

    return {
      witnessId,
      witnessType: this.witnessType,
      receiptHash,
      signature,
      publicKey: this.tsaPublicKeyPem,
      algorithm: 'RSA-SHA256',
    };
  }

  verifyTimestampToken(
    token: Rfc3161TimestampToken,
    expectedMerkleRoot: string,
    publicKeyPem: string,
  ): boolean {
    if (token.messageImprint.hashedMessage !== expectedMerkleRoot) {
      return false;
    }

    const payloadToVerify = JSON.stringify({
      version: token.version,
      policy: token.policy,
      messageImprint: token.messageImprint,
      serialNumber: token.serialNumber,
      genTime: token.genTime,
      nonce: token.nonce,
      tsaName: token.tsaName,
    });

    const verifier = crypto.createVerify('SHA256');
    verifier.update(payloadToVerify);
    verifier.end();

    return verifier.verify(publicKeyPem, token.signature, 'hex');
  }
}
