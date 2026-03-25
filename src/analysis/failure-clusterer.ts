import type { ActionTrace } from "../types/trace.js";
import type { FailurePattern } from "../types/pattern.js";

/**
 * Cluster similar failures across multiple traces of the same task.
 * Groups failures by:
 * 1. Step position (early, mid, late)
 * 2. Action type
 * 3. Error similarity
 */
export function clusterFailures(traces: ActionTrace[]): FailurePattern[] {
  if (traces.length === 0) return [];

  const clusters = new Map<string, FailureCluster>();

  for (let traceIdx = 0; traceIdx < traces.length; traceIdx++) {
    const trace = traces[traceIdx];

    for (const action of trace.actions) {
      if (!action.annotation) continue;
      if (action.annotation.type !== "mistake" && action.annotation.type !== "suboptimal") continue;

      const key = buildClusterKey(action.action, action.annotation.type, action.index);
      let cluster = clusters.get(key);
      if (!cluster) {
        cluster = {
          actionType: action.action,
          annotationType: action.annotation.type,
          steps: [],
          examples: [],
          traceIndices: new Set(),
        };
        clusters.set(key, cluster);
      }

      cluster.steps.push(action.index);
      cluster.traceIndices.add(traceIdx);
      cluster.examples.push({
        runIndex: traceIdx,
        actionIndex: action.index,
        action: action.action,
        args: action.args,
        error: action.result.error,
      });
    }
  }

  // Convert clusters to FailurePatterns
  const totalTraces = traces.length;
  const patterns: FailurePattern[] = [];

  for (const cluster of clusters.values()) {
    const frequency = cluster.traceIndices.size / totalTraces;
    // Only include patterns that recur across multiple runs (or in all runs if few)
    if (frequency < 0.3 && totalTraces > 2) continue;

    patterns.push({
      description: describeCluster(cluster),
      frequency,
      atSteps: [...new Set(cluster.steps)].sort((a, b) => a - b),
      examples: cluster.examples,
    });
  }

  return patterns.sort((a, b) => b.frequency - a.frequency);
}

interface FailureCluster {
  actionType: string;
  annotationType: string;
  steps: number[];
  examples: FailurePattern["examples"];
  traceIndices: Set<number>;
}

function buildClusterKey(action: string, type: string, step: number): string {
  // Group steps into bins: early (0-3), mid (4-9), late (10+)
  const phase = step < 4 ? "early" : step < 10 ? "mid" : "late";
  return `${type}:${action}:${phase}`;
}

function describeCluster(cluster: FailureCluster): string {
  const { actionType, annotationType, examples } = cluster;
  const avgStep = Math.round(
    cluster.steps.reduce((a, b) => a + b, 0) / cluster.steps.length,
  );

  if (annotationType === "mistake") {
    const errors = examples
      .map((e) => e.error)
      .filter(Boolean)
      .slice(0, 3);
    const errorSummary = errors.length > 0 ? `: ${errors[0]}` : "";
    return `Model frequently fails at '${actionType}' around step ${avgStep}${errorSummary}`;
  }

  if (annotationType === "suboptimal") {
    return `Model uses suboptimal '${actionType}' action around step ${avgStep}`;
  }

  return `Recurring ${annotationType} '${actionType}' at step ${avgStep}`;
}
