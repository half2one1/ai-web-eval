export interface PromptPatch {
  text: string;
  basedOn: {
    runs: number;
    passRate: number;
  };
  patternCount: number;
  generatedAt: string;
}

export interface ImprovementRecord {
  cycle: number;
  taskId: string;
  beforePassRate: number;
  afterPassRate: number | null;
  patch: PromptPatch;
}

export interface AccumulatedFeedback {
  patches: PromptPatch[];
  totalText: string;
}
