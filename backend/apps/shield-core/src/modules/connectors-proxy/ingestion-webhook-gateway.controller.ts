import {
  Controller,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ExternallyAuthenticatedEndpoint } from '../../security/endpoint-access.decorator';
import { ShieldIngestClient } from '../../internal-client/shield-ingest.client';

/**
 * The only headers an external sender may pass on to ingest: the signature
 * schemes ingest verifies and what they need (timestamp, nonce, GitHub's
 * delivery id). Everything else is dropped. In particular a sender cannot
 * smuggle `Authorization`, cookies, or `x-tenant-id` through to a service
 * that trusts them from shield-core.
 */
const FORWARDED_HEADERS = [
  'content-type',
  'x-webhook-signature',
  'x-signature',
  'x-signature-sha256',
  'x-hub-signature-256',
  'x-timestamp',
  'x-webhook-timestamp',
  'x-request-timestamp',
  'x-webhook-nonce',
  'x-github-delivery',
  'x-github-event',
] as const;

const CONNECTOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pickWebhookHeaders(
  incoming: Request['headers'],
  clientIp?: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = incoming[name];
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single === 'string' && single.length > 0) out[name] = single;
  }
  // Set here from the connection (honouring TRUST_PROXY), never copied from
  // the sender, so ingest sees the real client rather than a forged address.
  if (clientIp) out['x-forwarded-for'] = clientIp;
  return out;
}

/**
 * Public address for inbound webhooks.
 *
 * External tools (GitHub, Okta, scripts) cannot hold a ZoikoShield session and
 * must not reach shield-ingest directly, so they post here and shield-core
 * relays the delivery. The HMAC signature is the authentication, and it is
 * checked by shield-ingest, the service that holds the secrets: this route
 * trusts nothing it is sent and verifies nothing itself.
 *
 *   POST /api/v1/ingestion/webhooks/:connectorId
 */
@ExternallyAuthenticatedEndpoint()
@Controller('api/v1/ingestion/webhooks')
export class IngestionWebhookGatewayController {
  private readonly logger = new Logger(IngestionWebhookGatewayController.name);

  constructor(private readonly shieldIngestClient: ShieldIngestClient) {}

  // Senders share addresses (every GitHub delivery comes from a small range),
  // so the default per-IP budget would starve legitimate traffic.
  @Throttle({
    default: {
      ttl: 60_000,
      limit: Number(process.env.WEBHOOK_GATEWAY_RATE_LIMIT_PER_MINUTE) || 1200,
    },
  })
  @Post(':connectorId')
  async receive(
    @Param('connectorId') connectorId: string,
    @Req() req: RawBodyRequest<Request>,
    @Res({ passthrough: true }) res: Response,
  ) {
    // A connector id is a UUID. Anything else is rejected before it can reach
    // a URL, so a crafted id cannot address any other ingest route.
    if (!CONNECTOR_ID.test(connectorId)) {
      res.status(HttpStatus.NOT_FOUND);
      return { statusCode: 404, message: 'Unknown webhook endpoint' };
    }
    if (!req.rawBody || req.rawBody.length === 0) {
      res.status(HttpStatus.BAD_REQUEST);
      return { statusCode: 400, message: 'A JSON request body is required' };
    }

    const result = await this.shieldIngestClient.forwardWebhook(
      connectorId,
      req.rawBody,
      pickWebhookHeaders(req.headers, req.ip),
    );
    this.logger.log(
      `Webhook for connector ${connectorId} relayed to ingest: ${result.status}`,
    );
    res.status(result.status);
    return result.body;
  }
}
