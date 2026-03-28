import type { ActionTrace } from "../types/trace.js";
import type { FailurePattern } from "../types/pattern.js";
import { describeStepContext, resolveRef } from "../utils/trace-context.js";

/**
 * Cluster similar failures across multiple traces of the same task.
 * Analyzes both individual action annotations AND trace-level strategic patterns.
 */
export function clusterFailures(traces: ActionTrace[]): FailurePattern[] {
  if (traces.length === 0) return [];

  const patterns: FailurePattern[] = [];

  // 1. Cluster individual action failures
  patterns.push(...clusterActionFailures(traces));

  // 2. Detect trace-level strategic patterns
  patterns.push(...detectStrategicPatterns(traces));

  return patterns.sort((a, b) => b.frequency - a.frequency);
}

/**
 * Cluster individual action annotations (mistake, redundant, suboptimal)
 * across runs.
 */
function clusterActionFailures(traces: ActionTrace[]): FailurePattern[] {
  const clusters = new Map<string, FailureCluster>();
  const totalTraces = traces.length;

  for (let traceIdx = 0; traceIdx < traces.length; traceIdx++) {
    const trace = traces[traceIdx];

    for (const action of trace.actions) {
      if (!action.annotation) continue;
      const t = action.annotation.type;
      // Include mistake, redundant, AND suboptimal
      if (t !== "mistake" && t !== "suboptimal" && t !== "redundant") continue;

      const key = buildClusterKey(action.action, t, action.index);
      let cluster = clusters.get(key);
      if (!cluster) {
        cluster = {
          actionType: action.action,
          annotationType: t,
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

  const patterns: FailurePattern[] = [];
  for (const cluster of clusters.values()) {
    const frequency = cluster.traceIndices.size / totalTraces;
    if (frequency < 0.3 && totalTraces > 2) continue;

    patterns.push({
      description: describeCluster(cluster, traces),
      frequency,
      atSteps: [...new Set(cluster.steps)].sort((a, b) => a - b),
      examples: cluster.examples,
    });
  }

  return patterns;
}

/**
 * Detect higher-level strategic failure patterns across traces:
 * - Action loops (same action repeated N times)
 * - No interactive actions used
 * - Never progressed past the first page
 * - Task goal keywords never appeared in any action args
 */
function detectStrategicPatterns(traces: ActionTrace[]): FailurePattern[] {
  const patterns: FailurePattern[] = [];
  const totalTraces = traces.length;

  // Pattern: action loops (model stuck repeating same action)
  let loopTraceCount = 0;
  const loopExamples: FailurePattern["examples"] = [];

  for (let i = 0; i < traces.length; i++) {
    const trace = traces[i];
    const loopActions = trace.actions.filter(
      (a) =>
        a.annotation?.type === "mistake" &&
        a.annotation.message.includes("Stuck in loop"),
    );
    if (loopActions.length > 0) {
      loopTraceCount++;
      loopExamples.push({
        runIndex: i,
        actionIndex: loopActions[0].index,
        action: loopActions[0].action,
        args: loopActions[0].args,
        error: `Repeated ${loopActions.length + 1}+ times`,
      });
    }
  }

  if (loopTraceCount > 0) {
    const dominantAction = loopExamples[0]?.action || "unknown";
    patterns.push({
      description: `Model gets stuck in a loop repeating '${dominantAction}' without making progress toward the task goal`,
      frequency: loopTraceCount / totalTraces,
      atSteps: loopExamples.map((e) => e.actionIndex),
      examples: loopExamples,
    });
  }

  // Pattern: no interactive actions (fill, click, type, select)
  let noInteractionCount = 0;
  for (let i = 0; i < traces.length; i++) {
    const trace = traces[i];
    const interactive = ["fill", "click", "type", "select", "press"];
    const hasInteraction = trace.actions.some((a) => interactive.includes(a.action));
    if (!hasInteraction && trace.actions.length >= 3) {
      noInteractionCount++;
    }
  }

  if (noInteractionCount > 0) {
    patterns.push({
      description: `Model never used any interactive action (fill, click, type) — failed to engage with page elements`,
      frequency: noInteractionCount / totalTraces,
      atSteps: [0],
      examples: [],
    });
  }

  // Pattern: low action diversity
  let lowDiversityCount = 0;
  for (const trace of traces) {
    const uniqueActions = new Set(trace.actions.map((a) => a.action));
    if (uniqueActions.size <= 2 && trace.actions.length >= 5) {
      lowDiversityCount++;
    }
  }

  if (lowDiversityCount > 0) {
    patterns.push({
      description: `Model uses very few distinct action types (<=2) across many steps — lacks strategic variety`,
      frequency: lowDiversityCount / totalTraces,
      atSteps: [0],
      examples: [],
    });
  }

  // Pattern: task not completed
  let notCompletedCount = 0;
  for (const trace of traces) {
    if (!trace.completed) notCompletedCount++;
  }

  if (notCompletedCount > 0 && notCompletedCount === totalTraces) {
    patterns.push({
      description: `Model never signaled task completion (never called task_complete/done) — ran out of steps every time`,
      frequency: 1.0,
      atSteps: [],
      examples: [],
    });
  }

  return patterns;
}

interface FailureCluster {
  actionType: string;
  annotationType: string;
  steps: number[];
  examples: FailurePattern["examples"];
  traceIndices: Set<number>;
}

function buildClusterKey(action: string, type: string, step: number): string {
  const phase = step < 4 ? "early" : step < 10 ? "mid" : "late";
  return `${type}:${action}:${phase}`;
}

function describeCluster(cluster: FailureCluster, traces: ActionTrace[]): string {
  const { actionType, annotationType, examples } = cluster;

  // Build a contextual description from the most representative example
  const contextDesc = buildContextDesc(examples, traces);

  if (annotationType === "mistake") {
    const errors = examples
      .map((e) => e.error)
      .filter(Boolean)
      .slice(0, 3);
    const errorSummary = errors.length > 0 ? `: ${errors[0]}` : "";
    return `Model frequently fails at '${actionType}' ${contextDesc}${errorSummary}`;
  }

  if (annotationType === "redundant") {
    return `Model redundantly repeats '${actionType}' ${contextDesc} without state change`;
  }

  if (annotationType === "suboptimal") {
    return `Model uses suboptimal '${actionType}' action ${contextDesc}`;
  }

  return `Recurring ${annotationType} '${actionType}' ${contextDesc}`;
}

/**
 * Build a contextual description for a cluster by resolving the first
 * example's step context from the original trace.
 */
function buildContextDesc(
  examples: FailurePattern["examples"],
  traces: ActionTrace[],
): string {
  if (examples.length === 0) return "";

  const ex = examples[0];
  const trace = traces[ex.runIndex];
  if (!trace) return "";

  const actions = trace.actions;
  const actionIdx = ex.actionIndex;
  if (actionIdx < 0 || actionIdx >= actions.length) return "";

  // Resolve element ref if present
  const ref = ex.args.ref ? String(ex.args.ref) : null;
  const target = ref ? resolveRef(ref, actions, actionIdx) : null;

  // Build context from preceding action
  const stepCtx = describeStepContext(actionIdx, actions);

  // If we resolved a target, mention it; otherwise just use step context
  if (target && target !== ref) {
    return `on ${target} (${stepCtx})`;
  }
  return `(${stepCtx})`;
}
