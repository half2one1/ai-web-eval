import type { AnalysisResult } from "../types/pattern.js";
import type { PromptPatch } from "../types/feedback.js";

/**
 * Transform analysis results into a natural language prompt patch
 * that can be injected into the system prompt to improve the agent.
 */
export function synthesizeFeedback(analysis: AnalysisResult): PromptPatch {
  const sections: string[] = [];

  // Generate avoidance guidance from high-frequency failure patterns
  for (const pattern of analysis.failurePatterns) {
    if (pattern.frequency < 0.5) continue;
    sections.push(generateAvoidance(pattern));
  }

  // Generate reinforcement from consistent success patterns
  for (const pattern of analysis.successPatterns) {
    if (pattern.consistency < 0.7) continue;
    sections.push(generateReinforcement(pattern));
  }

  // Generate step-specific guidance from critical steps
  for (const step of analysis.criticalSteps) {
    sections.push(generateStepGuidance(step));
  }

  // Add efficiency note if many runs had redundant actions
  const avgPassRate = analysis.passRate;
  if (avgPassRate < 1 && sections.length === 0) {
    sections.push(
      `NOTE: Only ${(avgPassRate * 100).toFixed(0)}% of runs succeeded. Focus on completing the core task before optimizing.`,
    );
  }

  const text = sections.length > 0
    ? sections.join("\n")
    : "No significant patterns detected. Continue with current approach.";

  return {
    text,
    basedOn: { runs: analysis.totalRuns, passRate: analysis.passRate },
    patternCount: analysis.failurePatterns.length + analysis.successPatterns.length,
    generatedAt: new Date().toISOString(),
  };
}

function generateAvoidance(pattern: import("../types/pattern.js").FailurePattern): string {
  const stepsInfo =
    pattern.atSteps.length > 0
      ? ` (typically around step ${pattern.atSteps[0]})`
      : "";
  return `AVOID${stepsInfo}: ${pattern.description} [occurred in ${(pattern.frequency * 100).toFixed(0)}% of runs]`;
}

function generateReinforcement(pattern: import("../types/pattern.js").SuccessPattern): string {
  return `ALWAYS: ${pattern.description}`;
}

function generateStepGuidance(step: import("../types/pattern.js").CriticalStep): string {
  return `AT STEP ${step.stepIndex}: ${step.description}. Prefer '${step.successAction}' over '${step.failureAction}'.`;
}
