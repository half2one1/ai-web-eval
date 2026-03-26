import type { ObservationReport } from "../types/score.js";
import type { AnalysisResult } from "../types/pattern.js";
import { clusterFailures } from "./failure-clusterer.js";
import { extractSuccessPatterns } from "./success-extractor.js";
import { log } from "../utils/logger.js";

export function analyzePatterns(report: ObservationReport): AnalysisResult {
  const { taskId, runs } = report;
  const totalRuns = runs.length;
  const passedRuns = runs.filter((r) => r.score.passed);
  const failedRuns = runs.filter((r) => !r.score.passed);
  const passRate = totalRuns > 0 ? passedRuns.length / totalRuns : 0;

  log.info(`Analyzing patterns: ${totalRuns} runs, ${passedRuns.length} passed (${(passRate * 100).toFixed(0)}%)`);

  // Cluster failures across ALL runs (failed runs are the primary input,
  // but strategic patterns are detected across all runs)
  const tracesForFailure = failedRuns.length > 0
    ? failedRuns.map((r) => r.trace)
    : runs.map((r) => r.trace); // If all failed, use all runs
  const failurePatterns = clusterFailures(tracesForFailure);

  // Extract success patterns from passing runs
  const successPatterns = extractSuccessPatterns(passedRuns.map((r) => r.trace));

  // Identify critical steps: where do successful and failed runs diverge?
  const criticalSteps = findCriticalSteps(report);

  // Generalize reasons
  const generalizedReasons = {
    failures: failurePatterns
      .filter((p) => p.frequency >= 0.5)
      .map((p) => p.description),
    successes: successPatterns
      .filter((p) => p.consistency >= 0.8)
      .map((p) => p.description),
  };

  // Add specific score-based insights when all runs fail
  if (passRate === 0 && generalizedReasons.failures.length === 0) {
    // Analyze WHY runs failed instead of generic message
    const completedButFailed = runs.filter((r) => r.trace.completed && !r.score.passed);
    const neverCompleted = runs.filter((r) => !r.trace.completed);
    const avgScore = runs.reduce((s, r) => s + r.score.overall, 0) / totalRuns;

    if (completedButFailed.length > 0) {
      const details = completedButFailed[0].score.completion.details
        .filter((d: string) => d.includes("missing") || d.includes("mismatch") || d.includes("failed"))
        .join("; ");
      generalizedReasons.failures.push(
        `Model called task_complete in ${completedButFailed.length}/${totalRuns} runs but verification failed: ${details || "page state didn't match expected outcome"}`,
      );
    } else if (neverCompleted.length === totalRuns) {
      if (avgScore >= 0.7) {
        generalizedReasons.failures.push(
          `Model performed well (avg score ${avgScore.toFixed(2)}) but never called task_complete — it ran out of steps every time. Call task_complete as soon as the goal is achieved.`,
        );
      } else {
        generalizedReasons.failures.push(
          `All ${totalRuns} runs failed: model didn't complete the task or reach the expected outcome. Avg score: ${avgScore.toFixed(2)}.`,
        );
      }
    }
  }

  log.info(`Patterns found: ${failurePatterns.length} failure, ${successPatterns.length} success, ${criticalSteps.length} critical steps`);

  return {
    taskId,
    totalRuns,
    passRate,
    failurePatterns,
    successPatterns,
    criticalSteps,
    generalizedReasons,
  };
}

function findCriticalSteps(report: ObservationReport) {
  const passed = report.runs.filter((r) => r.score.passed);
  const failed = report.runs.filter((r) => !r.score.passed);

  if (passed.length === 0 || failed.length === 0) return [];

  const criticalSteps: AnalysisResult["criticalSteps"] = [];

  const maxSteps = Math.max(
    ...report.runs.map((r) => r.trace.actions.length),
  );

  for (let step = 0; step < maxSteps; step++) {
    const passActions = passed
      .map((r) => r.trace.actions[step]?.action)
      .filter(Boolean);
    const failActions = failed
      .map((r) => r.trace.actions[step]?.action)
      .filter(Boolean);

    if (passActions.length === 0 || failActions.length === 0) continue;

    const passMode = mode(passActions);
    const failMode = mode(failActions);

    if (passMode && failMode && passMode !== failMode) {
      criticalSteps.push({
        stepIndex: step,
        successAction: passMode,
        failureAction: failMode,
        description: `At step ${step}: successful runs use '${passMode}', failed runs use '${failMode}'`,
      });
    }
  }

  return criticalSteps;
}

function mode(arr: string[]): string | null {
  if (arr.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of arr) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let max = 0;
  let result: string | null = null;
  for (const [k, c] of counts) {
    if (c > max) {
      max = c;
      result = k;
    }
  }
  return result;
}
