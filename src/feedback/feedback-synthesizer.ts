import type { AnalysisResult, FailurePattern, SuccessPattern, CriticalStep } from "../types/pattern.js";
import type { PromptPatch } from "../types/feedback.js";
import type { ObservationReport } from "../types/score.js";

/**
 * Transform analysis results into specific, actionable prompt guidance
 * that teaches the model what went wrong and exactly how to fix it.
 */
export function synthesizeFeedback(
  analysis: AnalysisResult,
  report?: ObservationReport,
): PromptPatch {
  const sections: string[] = [];

  // 1. Generate specific failure corrections with concrete examples
  for (const pattern of analysis.failurePatterns) {
    if (pattern.frequency < 0.3) continue;
    sections.push(generateActionableCorrection(pattern));
  }

  // 2. Generate reinforcement from success patterns with concrete sequences
  for (const pattern of analysis.successPatterns) {
    if (pattern.consistency < 0.7) continue;
    sections.push(generateConcreteReinforcement(pattern));
  }

  // 3. Generate step-specific guidance from critical divergence points
  for (const step of analysis.criticalSteps) {
    sections.push(generateStepGuidance(step));
  }

  // 4. Analyze trace-level behavior for deeper insights
  if (report) {
    const traceInsights = analyzeTraces(report, analysis);
    for (const insight of traceInsights) {
      const alreadyCovered = sections.some((s) =>
        s.toLowerCase().includes(insight.slice(0, 40).toLowerCase()),
      );
      if (!alreadyCovered) {
        sections.push(insight);
      }
    }
  }

  // 5. Add generalized reasons only if they add new information
  for (const reason of analysis.generalizedReasons.failures) {
    // Skip the generic "model may not be capable" message
    if (reason.includes("may not be capable enough")) continue;
    const alreadyCovered = sections.some((s) =>
      s.toLowerCase().includes(reason.slice(0, 30).toLowerCase()),
    );
    if (!alreadyCovered) {
      sections.push(`IMPORTANT: ${reason}`);
    }
  }

  const text = sections.length > 0
    ? sections.join("\n\n")
    : "No significant patterns detected. Continue with current approach.";

  return {
    text,
    basedOn: { runs: analysis.totalRuns, passRate: analysis.passRate },
    patternCount: analysis.failurePatterns.length + analysis.successPatterns.length,
    generatedAt: new Date().toISOString(),
  };
}

function generateActionableCorrection(pattern: FailurePattern): string {
  const freq = `${(pattern.frequency * 100).toFixed(0)}%`;
  const lines: string[] = [];

  // Extract concrete examples to make the correction specific
  const exampleActions = pattern.examples
    .slice(0, 3)
    .map((e) => {
      const argsStr = Object.entries(e.args)
        .filter(([k]) => k !== "_toolCallId")
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(", ");
      return `${e.action}(${argsStr})${e.error ? ` → ERROR: ${e.error}` : ""}`;
    });

  // Detect specific failure types and generate targeted fixes
  if (pattern.description.includes("loop") || pattern.description.includes("repeating")) {
    const loopedAction = pattern.examples[0]?.action || "unknown";
    lines.push(`STOP REPEATING: You got stuck calling '${loopedAction}' multiple times (${freq} of runs).`);
    lines.push(`FIX: After calling '${loopedAction}' once, read the result carefully. If it didn't work, try a DIFFERENT action or target. For example:`);
    lines.push(`  - If '${loopedAction}' on one element failed, try a different element @ref`);
    lines.push(`  - If you're stuck navigating, take a snapshot to discover new interactive elements`);
    lines.push(`  - If a form isn't submitting, try 'press' with Enter key instead of clicking`);
  } else if (pattern.description.includes("never used any interactive")) {
    lines.push(`MUST INTERACT: You never used fill/click/type in ${freq} of runs — you only observed without acting.`);
    lines.push(`FIX: After taking a snapshot, identify elements by their @ref and:`);
    lines.push(`  - Use 'fill' with @ref and value to type in input fields`);
    lines.push(`  - Use 'click' with @ref to click buttons/links`);
    lines.push(`  - Use 'press' with key name for keyboard actions (Enter, Tab)`);
  } else if (pattern.description.includes("never signaled task completion")) {
    lines.push(`MUST COMPLETE: You never called task_complete/done (${freq} of runs) — you ran out of steps.`);
    lines.push(`FIX: Once you've accomplished the goal, immediately call task_complete with a summary of what you did and what you found. Don't keep exploring after achieving the objective.`);
  } else if (pattern.description.includes("fails at")) {
    const failedAction = pattern.examples[0]?.action || "unknown";
    const errorMsg = pattern.examples[0]?.error || "";
    lines.push(`FIX '${failedAction}': This action fails in ${freq} of runs around step ${pattern.atSteps[0] || "?"}.`);
    if (errorMsg) lines.push(`  Common error: ${errorMsg}`);
    lines.push(`  Before calling '${failedAction}', take a snapshot to verify the target element exists and is interactive.`);
    if (failedAction === "click" || failedAction === "fill") {
      lines.push(`  Make sure you're using the correct @ref from the most recent snapshot — refs change after page navigation.`);
    }
  } else if (pattern.description.includes("redundantly repeats")) {
    const repeatedAction = pattern.examples[0]?.action || "unknown";
    lines.push(`AVOID REDUNDANCY: You repeat '${repeatedAction}' without effect (${freq} of runs).`);
    lines.push(`FIX: If '${repeatedAction}' didn't change the page state, doing it again won't help. Move to the next step of your plan.`);
  } else if (pattern.description.includes("low action diversity") || pattern.description.includes("few distinct")) {
    lines.push(`USE MORE ACTIONS: You're using too few action types (${freq} of runs).`);
    lines.push(`FIX: A successful web task typically requires: open → snapshot → fill/click → snapshot → verify → task_complete. Use the full range of available tools.`);
  } else {
    // Generic but still include examples
    lines.push(`ISSUE (${freq} of runs): ${pattern.description}`);
    if (exampleActions.length > 0) {
      lines.push(`  Examples: ${exampleActions.join("; ")}`);
    }
  }

  return lines.join("\n");
}

function generateConcreteReinforcement(pattern: SuccessPattern): string {
  const lines: string[] = [];

  if (pattern.actionSequence.length > 0) {
    const sequence = pattern.actionSequence
      .map((a) => a.action)
      .join(" → ");
    lines.push(`PROVEN STRATEGY: ${pattern.description}`);
    lines.push(`  Follow this sequence: ${sequence}`);
  } else {
    lines.push(`KEEP DOING: ${pattern.description}`);
  }

  return lines.join("\n");
}

function generateStepGuidance(step: CriticalStep): string {
  return [
    `CRITICAL STEP ${step.stepIndex}: This is where runs succeed or fail.`,
    `  DO: Use '${step.successAction}' at this point.`,
    `  DON'T: Using '${step.failureAction}' here leads to failure.`,
    `  ${step.description}`,
  ].join("\n");
}

/**
 * Analyze raw traces for deeper behavioral insights that pattern clustering misses.
 */
function analyzeTraces(report: ObservationReport, analysis: AnalysisResult): string[] {
  const insights: string[] = [];
  const runs = report.runs;
  if (runs.length === 0) return insights;

  // Insight: Model completes task but doesn't call task_complete
  const completedButNotPassed = runs.filter(
    (r) => r.trace.completed && !r.score.passed,
  );
  if (completedButNotPassed.length > 0 && completedButNotPassed.length < runs.length) {
    const summaries = completedButNotPassed
      .map((r) => r.trace.completionSummary)
      .filter(Boolean)
      .slice(0, 2);
    if (summaries.length > 0) {
      insights.push(
        `VERIFICATION GAP: ${completedButNotPassed.length}/${runs.length} runs called task_complete but didn't pass verification. ` +
        `Your completion summaries suggest the task was done, but the final page state didn't match expectations. ` +
        `Before calling task_complete, verify the page shows the expected result by taking a final snapshot.`,
      );
    }
  }

  // Insight: Model gets close (high score) but doesn't quite pass
  const highScoreFailures = runs.filter(
    (r) => !r.score.passed && r.score.overall >= 0.7,
  );
  if (highScoreFailures.length === runs.length && analysis.passRate === 0) {
    const avgScore = runs.reduce((s, r) => s + r.score.overall, 0) / runs.length;
    const reasons: string[] = [];

    // What specifically is failing?
    const completionFails = runs.filter((r) => r.score.completion.score < 1.0);
    if (completionFails.length > 0) {
      const details = completionFails[0].score.completion.details;
      const failDetails = details.filter((d) => d.includes("missing") || d.includes("mismatch") || d.includes("failed"));
      if (failDetails.length > 0) {
        reasons.push(`Completion issue: ${failDetails[0]}`);
      }
    }

    const notCompleted = runs.filter((r) => !r.trace.completed);
    if (notCompleted.length > 0) {
      reasons.push(`${notCompleted.length}/${runs.length} runs didn't call task_complete — call it as soon as you achieve the goal`);
    }

    if (reasons.length > 0) {
      insights.push(
        `ALMOST THERE (avg score: ${avgScore.toFixed(2)}): You're close to passing but consistently miss:\n` +
        reasons.map((r) => `  - ${r}`).join("\n"),
      );
    }
  }

  // Insight: Common action sequences across all runs (what the model naturally does)
  const actionSequences = runs.map((r) =>
    r.trace.actions.map((a) => a.action).join(" → "),
  );
  const uniqueSequences = new Set(actionSequences);
  if (uniqueSequences.size === 1 && runs.length >= 3 && analysis.passRate === 0) {
    insights.push(
      `STUCK IN PATTERN: All ${runs.length} runs follow the exact same action sequence: ${actionSequences[0].slice(0, 100)}. ` +
      `Try a fundamentally different approach — different element targets, different action order, or explore the page more before acting.`,
    );
  }

  // Insight: Specific element interaction failures
  const elementFailures = new Map<string, number>();
  for (const run of runs) {
    for (const action of run.trace.actions) {
      if (!action.result.success && action.args.ref) {
        const key = `${action.action}(${action.args.ref})`;
        elementFailures.set(key, (elementFailures.get(key) || 0) + 1);
      }
    }
  }
  for (const [action, count] of elementFailures) {
    if (count >= 2) {
      insights.push(
        `BROKEN TARGET: '${action}' failed in ${count}/${runs.length} runs. This element may not exist or not be interactive. Take a fresh snapshot and find the correct @ref.`,
      );
    }
  }

  // Insight: Model thoughts reveal confusion
  const allThoughts = runs.flatMap((r) => r.trace.thoughts).filter(Boolean);
  if (allThoughts.length > 0) {
    const confusionPhrases = ["not sure", "can't find", "don't see", "unable to", "confused", "where is", "lost"];
    const confusedThoughts = allThoughts.filter((t) =>
      confusionPhrases.some((p) => t.toLowerCase().includes(p)),
    );
    if (confusedThoughts.length >= 2) {
      insights.push(
        `CONFUSION DETECTED: Model expressed uncertainty in ${confusedThoughts.length} instances. ` +
        `Example: "${confusedThoughts[0].slice(0, 100)}". ` +
        `When unsure, take a snapshot to see current page state, then identify specific interactive elements by their @ref labels.`,
      );
    }
  }

  return insights;
}
