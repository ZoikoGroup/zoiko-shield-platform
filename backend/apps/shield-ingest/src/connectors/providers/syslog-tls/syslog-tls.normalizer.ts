import { Injectable, Logger } from '@nestjs/common';
import crypto from 'crypto';
import {
  SyslogParsedMessage,
  SyslogNormalizedEvent,
} from './syslog-tls.types';

@Injectable()
export class SyslogTlsNormalizerService {
  private readonly logger = new Logger(SyslogTlsNormalizerService.name);

  // RFC 5424 regex: <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID [SD] MSG
  private static readonly RFC5424_REGEX =
    /^<(\d{1,3})>(\d)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(?:(\[.*?\]|-))\s*(.*)$/s;

  parseRfc5424(rawText: string): SyslogParsedMessage | null {
    const match = rawText.trim().match(SyslogTlsNormalizerService.RFC5424_REGEX);
    if (!match) {
      // Fallback for simple BSD / RFC 3164
      return {
        priority: 13, // User-level notice
        facility: 1,
        severity: 5,
        version: 1,
        timestamp: new Date().toISOString(),
        hostname: 'unknown-host',
        appName: 'syslog',
        procId: '-',
        msgId: '-',
        message: rawText,
        rawText,
      };
    }

    const priority = parseInt(match[1], 10);
    const facility = Math.floor(priority / 8);
    const severity = priority % 8;

    return {
      priority,
      facility,
      severity,
      version: parseInt(match[2], 10),
      timestamp: match[3] !== '-' ? match[3] : new Date().toISOString(),
      hostname: match[4] !== '-' ? match[4] : 'unknown',
      appName: match[5] !== '-' ? match[5] : 'syslog',
      procId: match[6],
      msgId: match[7],
      message: match[9],
      rawText,
    };
  }

  normalizeMessage(
    parsed: SyslogParsedMessage,
    tenantId: string,
    environmentId: string,
    region: string,
  ): SyslogNormalizedEvent {
    const rawPayloadHash = crypto
      .createHash('sha256')
      .update(parsed.rawText)
      .digest('hex');

    let actionType: SyslogNormalizedEvent['action_type'] = 'GENERIC_LOG';
    let targetUser: string | undefined;
    let sourceIp: string | undefined;

    const msg = parsed.message;

    // SSH authentication pattern parsing
    if (msg.includes('Accepted password for') || msg.includes('Accepted publickey for')) {
      actionType = 'AUTH_SUCCESS';
      const userMatch = msg.match(/for\s+(\S+)\s+from\s+(\S+)/);
      if (userMatch) {
        targetUser = userMatch[1];
        sourceIp = userMatch[2];
      }
    } else if (msg.includes('Failed password for') || msg.includes('authentication failure')) {
      actionType = 'AUTH_FAILURE';
      const userMatch = msg.match(/for\s+(?:invalid user\s+)?(\S+)\s+from\s+(\S+)/);
      if (userMatch) {
        targetUser = userMatch[1];
        sourceIp = userMatch[2];
      }
    } else if (msg.toLowerCase().includes('drop') || msg.toLowerCase().includes('denied')) {
      actionType = 'NETWORK_DROP';
      const ipMatch = msg.match(/SRC=(\S+)/);
      if (ipMatch) {
        sourceIp = ipMatch[1];
      }
    }

    return {
      tenant_id: tenantId,
      environment_id: environmentId,
      region,
      provider: 'syslog-tls',
      event_type: `syslog.${parsed.appName}.${actionType.toLowerCase()}`,
      source_event_id: `sys-${crypto.randomUUID()}`,
      event_timestamp: parsed.timestamp,
      processing_timestamp: new Date().toISOString(),

      host: {
        hostname: parsed.hostname,
        app_name: parsed.appName,
        process_id: parsed.procId,
        message_id: parsed.msgId,
      },

      syslog: {
        facility: parsed.facility,
        severity: parsed.severity,
        priority: parsed.priority,
      },

      message: parsed.message,
      action_type: actionType,
      target_user: targetUser,
      source_ip: sourceIp,
      raw_payload_hash: rawPayloadHash,
    };
  }
}
