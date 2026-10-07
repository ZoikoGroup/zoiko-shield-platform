/**
 * Shared blast-radius tier weights for every dry-run sandbox in this app.
 * An asset tier's contribution to a playbook's simulated blast radius has to
 * mean the same thing everywhere a sandbox computes it - PlaybookSandboxEngineService
 * and WasmPlaybookSandboxService previously kept independent copies of these
 * numbers (0.4 vs 0.35 for TIER_0_CRITICAL) that could silently drift apart
 * when a safety-relevant threshold change was reviewed and applied to only
 * one of them.
 */
export const BLAST_RADIUS_TIER_WEIGHT = {
  TIER_0_CRITICAL: 0.4,
  TIER_1_STANDARD: 0.15,
} as const;

/** Weight for any tier not listed in BLAST_RADIUS_TIER_WEIGHT (e.g. TIER_2_DEV). */
export const BLAST_RADIUS_DEFAULT_TIER_WEIGHT = 0.05;
