import { Injectable } from '@nestjs/common';

export type HealthState = 'HEALTHY' | 'PARTIAL' | 'STALE' | 'DEGRADED' | 'UNKNOWN' | 'UNAVAILABLE';

// Ordered worst-to-best is NOT what we want — we want "weakest wins", so rank best-to-worst
// and always take the LOWEST rank among inputs. UNAVAILABLE is the absolute floor.
const HEALTH_RANK: Record<HealthState, number> = {
  HEALTHY: 5,
  PARTIAL: 4,
  STALE: 3,
  DEGRADED: 2,
  UNKNOWN: 1,
  UNAVAILABLE: 0,
};

/**
 * outputHealth <= weakest material input health — never let a composite
 * report claim to be healthier than its worst input (spec §5). A DEGRADED
 * connector + PARTIAL evidence + UNKNOWN assessment can never produce a
 * HEALTHY report.
 */
@Injectable()
export class ReportHealthPropagationService {
  combine(inputs: HealthState[]): HealthState {
    if (inputs.length === 0) return 'UNKNOWN';
    return inputs.reduce((worst, current) => (HEALTH_RANK[current] < HEALTH_RANK[worst] ? current : worst));
  }
}
