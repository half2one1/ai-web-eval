import type { ActionAnnotation } from "./trace.js";

export interface CompletionScore {
  score: number;
  assertionsPassed: number;
  assertionsTotal: number;
  details: string[];
}

export interface EfficiencyScore {
  score: number;
  actualSteps: number;
  optimalSteps: number;
  redundantActions: number;
  recoveryActions: number;
}

export interface AccuracyScore {
  score: number;
  correctActions: number;
  totalActions: number;
  mistakeCount: number;
}

export interface RunScore {
  taskId: string;
  sessionId: string;
  runIndex: number;
  passed: boolean;
  overall: number;
  completion: CompletionScore;
  efficiency: EfficiencyScore;
  accuracy: AccuracyScore;
  mistakes: ActionAnnotation[];
}

export interface ObservationReport {
  taskId: string;
  timestamp: string;
  runs: RunResult[];
}

export interface RunResult {
  runIndex: number;
  sessionId: string;
  trace: import("./trace.js").ActionTrace;
  score: RunScore;
}
