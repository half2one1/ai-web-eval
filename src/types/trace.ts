export type AnnotationType =
  | "mistake"
  | "redundant"
  | "recovery"
  | "optimal"
  | "suboptimal";

export interface ActionAnnotation {
  type: AnnotationType;
  message: string;
}

export interface TracedAction {
  index: number;
  timestamp: string;
  thought: string | null;
  action: string;
  args: Record<string, unknown>;
  rawOutput: string;
  result: {
    success: boolean;
    output: string;
    error: string | null;
  };
  durationMs: number;
  snapshotAfter?: string;
  annotation?: ActionAnnotation;
}

export interface ActionTrace {
  taskId: string;
  sessionId: string;
  startedAt: string;
  completedAt: string | null;
  completed: boolean;
  completionSummary: string | null;
  actions: TracedAction[];
  thoughts: string[];
  modelMessages: Array<{ role: string; content: string; timestamp: string }>;
}

export function createActionTrace(
  taskId: string,
  sessionId: string,
): ActionTrace {
  return {
    taskId,
    sessionId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    completed: false,
    completionSummary: null,
    actions: [],
    thoughts: [],
    modelMessages: [],
  };
}
