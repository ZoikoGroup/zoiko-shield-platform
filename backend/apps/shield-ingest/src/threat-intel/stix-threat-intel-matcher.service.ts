import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface StixObject {
  type: string;
  id: string;
  name?: string;
  pattern?: string;
  pattern_type?: string;
  valid_from?: string;
  labels?: string[];
  confidence?: number;
  external_references?: Array<{
    source_name: string;
    external_id?: string;
    url?: string;
  }>;
}

export interface StixBundle {
  type: 'bundle';
  id: string;
  objects: StixObject[];
}

export interface IndexedIoc {
  iocType: 'IP' | 'DOMAIN' | 'HASH_SHA256';
  iocValue: string;
  stixIndicatorId: string;
  threatActor?: string;
  malwareFamily?: string;
  confidence: number;
  mitreTechniques: string[];
}

export interface ThreatIntelMatchResult {
  isMatched: boolean;
  matchedIocs: IndexedIoc[];
  maxConfidence: number;
  threatActors: string[];
  malwareFamilies: string[];
  mitreTechniques: string[];
  enrichmentDigest: string;
}

/**
 * STIX 2.1 / TAXII Threat Intelligence Ingestion & Live IOC Matcher
 * Specification: ZS-T0-BE-ARCH-001 §6 & ZS-SOC-FEED-001
 */
@Injectable()
export class StixThreatIntelMatcherService {
  private readonly logger = new Logger(StixThreatIntelMatcherService.name);

  // In-Memory High-Speed Radix/Hash IOC Indexes
  private readonly ipIocMap = new Map<string, IndexedIoc>();
  private readonly domainIocMap = new Map<string, IndexedIoc>();
  private readonly hashIocMap = new Map<string, IndexedIoc>();

  /**
   * Ingests and indexes a STIX 2.1 Threat Intel Bundle.
   */
  ingestStixBundle(bundle: StixBundle): {
    indexedCount: number;
    bundleId: string;
  } {
    let count = 0;
    this.logger.log(
      `Ingesting STIX 2.1 Threat Bundle [${bundle.id}] with ${bundle.objects.length} objects...`,
    );

    // 1. Identify Threat Actors and Malware in the bundle
    const threatActors = bundle.objects
      .filter((o) => o.type === 'threat-actor')
      .map((o) => o.name || o.id);
    const malwareFamilies = bundle.objects
      .filter((o) => o.type === 'malware')
      .map((o) => o.name || o.id);

    const defaultActor = threatActors[0] || 'Unknown Threat Actor';
    const defaultMalware = malwareFamilies[0] || 'Unclassified Threat';

    // 2. Parse STIX Indicators
    for (const obj of bundle.objects) {
      if (obj.type === 'indicator' && obj.pattern) {
        const mitreTechniques = (obj.external_references || [])
          .filter((ref) => ref.source_name.toLowerCase().includes('mitre'))
          .map((ref) => ref.external_id || ref.source_name);

        const confidence = obj.confidence ?? 90;

        // Parse IP Indicator
        const ipMatch = obj.pattern.match(/ipv4-addr:value\s*=\s*'([^']+)'/i);
        if (ipMatch) {
          const ip = ipMatch[1];
          const ioc: IndexedIoc = {
            iocType: 'IP',
            iocValue: ip,
            stixIndicatorId: obj.id,
            threatActor: defaultActor,
            malwareFamily: defaultMalware,
            confidence,
            mitreTechniques,
          };
          this.ipIocMap.set(ip.toLowerCase(), ioc);
          count++;
        }

        // Parse Domain Indicator
        const domainMatch = obj.pattern.match(
          /domain-name:value\s*=\s*'([^']+)'/i,
        );
        if (domainMatch) {
          const domain = domainMatch[1];
          const ioc: IndexedIoc = {
            iocType: 'DOMAIN',
            iocValue: domain,
            stixIndicatorId: obj.id,
            threatActor: defaultActor,
            malwareFamily: defaultMalware,
            confidence,
            mitreTechniques,
          };
          this.domainIocMap.set(domain.toLowerCase(), ioc);
          count++;
        }

        // Parse SHA-256 Hash Indicator
        const hashMatch = obj.pattern.match(
          /file:hashes\.'SHA-256'\s*=\s*'([^']+)'/i,
        );
        if (hashMatch) {
          const hash = hashMatch[1];
          const ioc: IndexedIoc = {
            iocType: 'HASH_SHA256',
            iocValue: hash,
            stixIndicatorId: obj.id,
            threatActor: defaultActor,
            malwareFamily: defaultMalware,
            confidence,
            mitreTechniques,
          };
          this.hashIocMap.set(hash.toLowerCase(), ioc);
          count++;
        }
      }
    }

    this.logger.log(
      `✔ Indexed ${count} threat intelligence IOCs from bundle ${bundle.id}`,
    );
    return { indexedCount: count, bundleId: bundle.id };
  }

  /**
   * Matches live telemetry observables against indexed STIX threat intelligence.
   */
  matchTelemetryObservables(observables: {
    ipAddresses?: string[];
    domains?: string[];
    fileHashes?: string[];
  }): ThreatIntelMatchResult {
    const matchedIocs: IndexedIoc[] = [];

    // Match IPs
    for (const ip of observables.ipAddresses || []) {
      const match = this.ipIocMap.get(ip.toLowerCase());
      if (match) matchedIocs.push(match);
    }

    // Match Domains
    for (const domain of observables.domains || []) {
      const match = this.domainIocMap.get(domain.toLowerCase());
      if (match) matchedIocs.push(match);
    }

    // Match Hashes
    for (const hash of observables.fileHashes || []) {
      const match = this.hashIocMap.get(hash.toLowerCase());
      if (match) matchedIocs.push(match);
    }

    const isMatched = matchedIocs.length > 0;
    const maxConfidence = isMatched
      ? Math.max(...matchedIocs.map((i) => i.confidence))
      : 0;
    const threatActors = Array.from(
      new Set(
        matchedIocs.map((i) => i.threatActor).filter(Boolean) as string[],
      ),
    );
    const malwareFamilies = Array.from(
      new Set(
        matchedIocs.map((i) => i.malwareFamily).filter(Boolean) as string[],
      ),
    );
    const mitreTechniques = Array.from(
      new Set(matchedIocs.flatMap((i) => i.mitreTechniques)),
    );

    const enrichmentDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ isMatched, matchedIocs, maxConfidence }))
      .digest('hex');

    return {
      isMatched,
      matchedIocs,
      maxConfidence,
      threatActors,
      malwareFamilies,
      mitreTechniques,
      enrichmentDigest,
    };
  }
}
