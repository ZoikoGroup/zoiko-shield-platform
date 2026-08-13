import { Injectable, Logger } from '@nestjs/common';
import { AiUnavailableException } from '../gateway/fallback/fallback.exceptions';
import { workloadAuthorizationHeaders } from '../../../../libs/security/src/workload-token';

const SHIELD_CORE_BASE_URL = process.env.SHIELD_CORE_BASE_URL || 'http://localhost:3001';

/**
 * shield-ai's only path to Case/Alert/Evidence/Detection/Identity/Asset
 * data — always this authenticated internal client, never a direct Prisma
 * read of shield-core-owned tables (spec §1).
 */
@Injectable()
export class ShieldCoreClient {
  private readonly logger = new Logger(ShieldCoreClient.name);

  private headers(): Record<string, string> {
    return workloadAuthorizationHeaders('shield-core');
  }

  async getCase(tenantId: string, caseId: string): Promise<any> {
    return this.get(`/internal/v1/cases/${caseId}?tenantId=${encodeURIComponent(tenantId)}`);
  }

  async getCaseTimeline(tenantId: string, caseId: string): Promise<any> {
    return this.get(`/internal/v1/cases/${caseId}/timeline?tenantId=${encodeURIComponent(tenantId)}`);
  }

  async getCaseEvidence(tenantId: string, caseId: string): Promise<any> {
    return this.get(`/internal/v1/cases/${caseId}/evidence?tenantId=${encodeURIComponent(tenantId)}`);
  }

  private async get(path: string): Promise<any> {
    let response: Response;
    try {
      response = await fetch(`${SHIELD_CORE_BASE_URL}${path}`, { headers: this.headers() });
    } catch (err) {
      this.logger.error(`shield-core unreachable: ${(err as Error).message}`);
      throw new AiUnavailableException('shield-core unreachable during retrieval');
    }
    if (!response.ok) {
      throw new AiUnavailableException(`shield-core returned ${response.status} for ${path}`);
    }
    return response.json();
  }
}
