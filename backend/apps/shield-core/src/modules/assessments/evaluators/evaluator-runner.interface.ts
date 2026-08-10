export interface EvaluatorInput {
  evidenceRecords: Array<{
    id: string;
    content_hash: string;
    source_object_id: string;
    period_start: Date | null;
    period_end: Date | null;
    content: Record<string, unknown>;
  }>;
  configuration: Record<string, unknown>;
}

export interface EvaluatorOutput {
  result: 'PASS' | 'FAIL' | 'PARTIAL' | 'UNKNOWN';
  rationale: string;
  limitations: string[];
  confidence?: number;
}

/** Generic contract every automated evaluator implements — new evaluators plug in without touching the runner (spec §14). */
export interface EvaluatorRunner {
  readonly key: string;
  run(input: EvaluatorInput): Promise<EvaluatorOutput>;
}
