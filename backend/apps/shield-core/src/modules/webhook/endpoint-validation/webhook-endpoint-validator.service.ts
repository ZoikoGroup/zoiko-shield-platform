import { Injectable, BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

const BLOCKED_HOSTNAMES = new Set(['localhost']);

function isPrivateOrLoopbackIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 127) return true; // loopback
    if (parts[0] === 10) return true; // private
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // private
    if (parts[0] === 192 && parts[1] === 168) return true; // private
    if (parts[0] === 169 && parts[1] === 254) return true; // link-local
    if (parts[0] === 0) return true;
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true; // loopback
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    return false;
  }
  return false;
}

/**
 * SSRF-safe destination validation (spec §43): HTTPS-only, rejects
 * localhost/loopback/link-local/private-network targets, resolves the
 * hostname and validates the RESOLVED IP (not just the literal string) so
 * a DNS-rebinding attempt against an allowed-looking hostname still fails.
 * Automatic redirect following must stay disabled wherever this endpoint
 * is later fetched — validating the registration URL is not sufficient by
 * itself if the delivery client follows redirects blindly.
 */
@Injectable()
export class WebhookEndpointValidatorService {
  async validate(endpointUrl: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(endpointUrl);
    } catch {
      throw new BadRequestException('Invalid endpoint URL');
    }

    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('Webhook endpoints must be HTTPS');
    }
    if (BLOCKED_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
      throw new BadRequestException('Webhook endpoint cannot target localhost');
    }
    if (parsed.port && !['443', ''].includes(parsed.port)) {
      throw new BadRequestException(`Unsupported port '${parsed.port}' for webhook endpoint`);
    }

    if (isIP(parsed.hostname)) {
      if (isPrivateOrLoopbackIp(parsed.hostname)) {
        throw new BadRequestException('Webhook endpoint cannot target a private/loopback/link-local address');
      }
      return;
    }

    let resolved: string[];
    try {
      const records = await lookup(parsed.hostname, { all: true });
      resolved = records.map((r) => r.address);
    } catch {
      throw new BadRequestException('Webhook endpoint hostname could not be resolved');
    }
    if (resolved.length === 0 || resolved.some((ip) => isPrivateOrLoopbackIp(ip))) {
      throw new BadRequestException('Webhook endpoint resolves to a private/loopback/link-local address');
    }
  }
}
