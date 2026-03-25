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

  // Cluster failures across failed runs
  const failurePatterns = clusterFailures(failedRuns.map((r) => r.trace));

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

  // Compare action at each step index
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

    // Find dominant action in each group
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
