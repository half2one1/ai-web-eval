import type { AnalysisResult } from "../types/pattern.js";
import type { PromptPatch } from "../types/feedback.js";

/**
 * Transform analysis results into a natural language prompt patch
 * that can be injected into the system prompt to improve the agent.
 */
export function synthesizeFeedback(analysis: AnalysisResult): PromptPatch {
  const sections: string[] = [];

  // Generate avoidance guidance from failure patterns (any frequency >= 0.3)
  for (const pattern of analysis.failurePatterns) {
    if (pattern.frequency < 0.3) continue;
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

  // Generate from generalized reasons (catch-all insights)
  for (const reason of analysis.generalizedReasons.failures) {
    // Avoid duplicating patterns already covered above
    const alreadyCovered = sections.some((s) =>
      s.toLowerCase().includes(reason.slice(0, 30).toLowerCase()),
    );
    if (!alreadyCovered) {
      sections.push(`CRITICAL: ${reason}`);
    }
  }

  // Add concrete procedural guidance when the model fails to interact
  if (analysis.passRate === 0 && sections.length > 0) {
    sections.push(
      `PROCEDURE: After opening a URL, you MUST take a snapshot to see interactive elements, then use fill/click/type to interact with them. Do NOT repeat the same action. Follow this sequence: open URL → snapshot → identify the target element @ref → fill or click that element → verify result with snapshot.`,
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
      ? ` (around step ${pattern.atSteps[0]})`
      : "";
  return `AVOID${stepsInfo}: ${pattern.description} [${(pattern.frequency * 100).toFixed(0)}% of runs]`;
}

function generateReinforcement(pattern: import("../types/pattern.js").SuccessPattern): string {
  return `ALWAYS: ${pattern.description}`;
}

function generateStepGuidance(step: import("../types/pattern.js").CriticalStep): string {
  return `AT STEP ${step.stepIndex}: ${step.description}. Prefer '${step.successAction}' over '${step.failureAction}'.`;
}
