import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { ConnectorContext } from '../../core/connector-context';
import type {
  M365SecurityAlertV2,
  NormalizedEmailThreatRecord,
} from './m365-email.types';

/**
 * Normalizes Microsoft Graph `/security/alerts_v2` payloads into pseudonymized Phase 0 email
 * threat records. Never stores raw email bodies, subjects, or OAuth tokens (ZS-UX-EMTI-001 §20 / T17).
 */
@Injectable()
export class M365EmailNormalizerService {
  normalizeAlert(
    raw: unknown,
    context: ConnectorContext,
  ): NormalizedEmailThreatRecord | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const alert = raw as Partial<M365SecurityAlertV2>;
    if (
      typeof alert.id !== 'string' ||
      alert.id.trim().length === 0 ||
      typeof alert.title !== 'string'
    ) {
      return null;
    }

    const severityUpper = String(alert.severity || 'MEDIUM').toUpperCase();
    const severity: NormalizedEmailThreatRecord['severity'] =
      severityUpper === 'HIGH'
        ? 'HIGH'
        : severityUpper === 'CRITICAL'
          ? 'CRITICAL'
          : severityUpper === 'LOW' || severityUpper === 'INFORMATIONAL'
            ? 'LOW'
            : 'MEDIUM';

    const evidenceItems = Array.isArray(alert.evidence) ? alert.evidence : [];
    const attachmentHashes: Array<{ sha256: string; fileName?: string }> = [];
    const indicatorHashes: Array<{ type: string; value: string }> = [];
    let verdict = 'SUSPICIOUS';

    for (const ev of evidenceItems) {
      if (ev.verdict) {
        verdict = String(ev.verdict).toUpperCase();
      }
      if (ev.fileDetails?.sha256) {
        attachmentHashes.push({
          sha256: ev.fileDetails.sha256,
          fileName: ev.fileDetails.fileName,
        });
      }
      if (ev.internetMessageId) {
        indicatorHashes.push({
          type: 'message_id_sha256',
          value: this.pseudonymize(context.tenantId, ev.internetMessageId),
        });
      }
      if (ev.url) {
        indicatorHashes.push({
          type: 'url_sha256',
          value: this.pseudonymize(context.tenantId, ev.url),
        });
      }
    }

    const primarySubjectRaw =
      evidenceItems[0]?.recipientEmailAddress ||
      evidenceItems[0]?.internetMessageId ||
      alert.id;
    const observedIso = alert.createdDateTime || new Date().toISOString();
    const observedMs = Date.parse(observedIso);

    return {
      sourceEventRef: alert.id,
      provider: 'MICROSOFT_365',
      providerVerdict: verdict,
      threatClass: this.classifyThreat(alert.category, alert.title),
      severity,
      observedAt: Number.isFinite(observedMs)
        ? new Date(observedMs)
        : new Date(),
      subjectRef: `m365:${this.pseudonymize(context.tenantId, primarySubjectRaw).slice(0, 20)}`,
      indicatorHashes,
      attachmentHashes,
      deepLinkUrl: alert.alertWebUrl,
      sourceConfidence: alert.detectionSource ? 'HIGH' : 'MEDIUM',
      policyId: alert.serviceSource || 'microsoft-defender-office365',
      policyVersion: 'graph-v1-alerts_v2',
    };
  }

  private classifyThreat(category?: string, title?: string): string {
    const text = `${category || ''} ${title || ''}`.toLowerCase();
    if (
      text.includes('bec') ||
      text.includes('impersonat') ||
      text.includes('business email')
    ) {
      return 'BEC_IMPERSONATION';
    }
    if (text.includes('phish')) return 'CREDENTIAL_PHISHING';
    if (text.includes('malware') || text.includes('ransom'))
      return 'MALWARE_ATTACHMENT';
    if (
      text.includes('oauth') ||
      text.includes('forwarding') ||
      text.includes('account')
    ) {
      return 'ATO_ACCOUNT_TAKEOVER';
    }
    return 'EMAIL_THREAT_ALERT';
  }

  private pseudonymize(tenantId: string, rawValue: string): string {
    return createHash('sha256')
      .update(`${tenantId}:${rawValue}`, 'utf8')
      .digest('hex');
  }
}
