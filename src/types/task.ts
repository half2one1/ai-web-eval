export type AgentMode = "function-calling" | "react" | "auto";

export type TaskCategory = "form-fill" | "info-lookup" | "navigation" | "interaction";

export interface DOMAssertion {
  selector: string;
  check: "exists" | "visible" | "value" | "text" | "checked";
  expected?: string;
  contains?: string;
}

export interface ExpectedOutcome {
  /** For form fills: CSS selector → expected value */
  formValues?: Record<string, string>;
  /** For info lookup: text that should appear on the page */
  expectedContent?: string[];
  /** For navigation: regex or string the final URL should match */
  expectedUrl?: string;
  /** DOM state assertions */
  assertions?: DOMAssertion[];
  /** Optimal number of steps (for efficiency scoring) */
  optimalSteps?: number;
}

export interface SetupStep {
  command: string;
  args: string[];
}

export interface TaskDefinition {
  id: string;
  name: string;
  description?: string;
  category: TaskCategory;

  url: string;
  goal: string;

  expectedOutcome: ExpectedOutcome;

  maxSteps: number;
  timeoutMs: number;
  observationRuns: number;
  mode: AgentMode;
  model?: string;

  setup?: SetupStep[];
}
