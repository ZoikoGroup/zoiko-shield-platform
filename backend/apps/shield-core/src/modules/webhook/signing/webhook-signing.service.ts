import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * HMAC-SHA256 is acceptable here because the endpoint and ZoikoShield
 * share the verification secret (spec §45) — never reuses anchor signing
 * keys (those are asymmetric and serve a different trust model). Signs
 * the exact raw bytes, canonical material = timestamp + "." + eventId +
 * "." + rawBody.
 */
@Injectable()
export class WebhookSigningService {
  sign(params: { secret: string; timestamp: string; eventId: string; rawBody: string }): string {
    const material = `${params.timestamp}.${params.eventId}.${params.rawBody}`;
    const digest = createHmac('sha256', params.secret).update(material).digest('hex');
    return `v1=${digest}`;
  }

  /** Constant-time comparison — never a plain string ===, which would leak timing information. */
  verify(params: { secret: string; timestamp: string; eventId: string; rawBody: string; signature: string }): boolean {
    const expected = this.sign(params);
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(params.signature);
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  }
}
