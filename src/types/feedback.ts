export interface PromptPatch {
  text: string;
  basedOn: {
    runs: number;
    passRate: number;
  };
  patternCount: number;
  generatedAt: string;
  /** How this feedback was generated: "static" (template) or "ai" (LLM synthesis) */
  method: "static" | "ai";
  /** The full prompt sent to the LLM for synthesis (only for method="ai") */
  synthesisPrompt?: string;
  /** The model used for synthesis (only for method="ai") */
  synthesisModel?: string;
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

// --- Three-layer generalization ---

/** Site-level knowledge extracted from traces across tasks on the same domain */
export interface SiteProfile {
  domain: string;
  /** Structural observations: iframes, dynamic loading, popups, etc. */
  structure: string[];
  /** Proven navigation/interaction patterns abstracted from successful traces */
  navigationPatterns: string[];
  /** Known pitfalls: errors, broken elements, timing issues */
  pitfalls: string[];
  /** Working strategies: what consistently succeeds on this site */
  strategies: string[];
  /** How many task×run observations informed this profile */
  observationCount: number;
  /** Tasks that contributed to this profile */
  taskIds: string[];
  updatedAt: string;
}

/** Model-level weaknesses/strengths observed across multiple sites */
export interface ModelProfile {
  /** Weaknesses that appear across 2+ different domains */
  weaknesses: string[];
  /** Strengths that appear across 2+ different domains */
  strengths: string[];
  /** Domain count that informed each weakness (parallel array) */
  weaknessDomainCounts: number[];
  /** Total observations across all domains */
  observationCount: number;
  updatedAt: string;
}

/** Combined three-layer feedback for prompt injection */
export interface LayeredFeedback {
  model: ModelProfile | null;
  site: SiteProfile | null;
  task: AccumulatedFeedback;
}
