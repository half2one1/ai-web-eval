export interface FailurePattern {
  /** Human-readable description of the failure */
  description: string;
  /** How often this failure occurs across runs (0-1) */
  frequency: number;
  /** Step indices where this failure typically occurs */
  atSteps: number[];
  /** Example action sequences that exhibit this failure */
  examples: Array<{
    runIndex: number;
    actionIndex: number;
    action: string;
    args: Record<string, unknown>;
    error: string | null;
  }>;
}

export interface SuccessPattern {
  /** Human-readable description of the success pattern */
  description: string;
  /** How consistently this pattern appears in successful runs (0-1) */
  consistency: number;
  /** The action sequence that characterizes this pattern */
  actionSequence: Array<{ action: string; args: Record<string, unknown> }>;
}

export interface CriticalStep {
  /** Step index where success/failure diverges */
  stepIndex: number;
  /** What successful runs do at this step */
  successAction: string;
  /** What failing runs do at this step */
  failureAction: string;
  /** Description of the divergence */
  description: string;
}

export interface AnalysisResult {
  taskId: string;
  totalRuns: number;
  passRate: number;
  failurePatterns: FailurePattern[];
  successPatterns: SuccessPattern[];
  criticalSteps: CriticalStep[];
  generalizedReasons: {
    failures: string[];
    successes: string[];
  };
}
