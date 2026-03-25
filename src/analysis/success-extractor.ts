import type { ActionTrace } from "../types/trace.js";
import type { SuccessPattern } from "../types/pattern.js";

/**
 * Extract patterns that consistently appear in successful runs.
 * Finds common action sequences and strategies.
 */
export function extractSuccessPatterns(traces: ActionTrace[]): SuccessPattern[] {
  if (traces.length === 0) return [];

  const patterns: SuccessPattern[] = [];

  // Pattern 1: Common opening sequences (first 3 actions)
  const openingPattern = findCommonOpening(traces);
  if (openingPattern) patterns.push(openingPattern);

  // Pattern 2: Pre-action patterns (what the model does before key actions)
  const preActionPatterns = findPreActionPatterns(traces);
  patterns.push(...preActionPatterns);

  // Pattern 3: Action type distribution in successful runs
  const strategyPattern = findStrategyPattern(traces);
  if (strategyPattern) patterns.push(strategyPattern);

  return patterns;
}

function findCommonOpening(traces: ActionTrace[]): SuccessPattern | null {
  if (traces.length < 2) return null;

  // Find the longest common prefix of actions
  const sequences = traces.map((t) =>
    t.actions.slice(0, 5).map((a) => a.action),
  );

  let commonLen = 0;
  for (let i = 0; i < Math.min(...sequences.map((s) => s.length)); i++) {
    const actions = sequences.map((s) => s[i]);
    if (new Set(actions).size === 1) {
      commonLen = i + 1;
    } else {
      break;
    }
  }

  if (commonLen < 2) return null;

  const actionSequence = traces[0].actions.slice(0, commonLen).map((a) => ({
    action: a.action,
    args: a.args,
  }));

  return {
    description: `Successful runs consistently start with: ${actionSequence.map((a) => a.action).join(" → ")}`,
    consistency: 1.0,
    actionSequence,
  };
}

function findPreActionPatterns(traces: ActionTrace[]): SuccessPattern[] {
  const patterns: SuccessPattern[] = [];
  const totalTraces = traces.length;

  // Check: do successful runs snapshot before fill/click?
  let snapshotBeforeFill = 0;
  let snapshotBeforeClick = 0;
  let fillCount = 0;
  let clickCount = 0;

  for (const trace of traces) {
    for (let i = 0; i < trace.actions.length; i++) {
      const action = trace.actions[i];
      const prev = i > 0 ? trace.actions[i - 1] : null;

      if (action.action === "fill") {
        fillCount++;
        if (prev?.action === "snapshot") snapshotBeforeFill++;
      }
      if (action.action === "click") {
        clickCount++;
        if (prev?.action === "snapshot") snapshotBeforeClick++;
      }
    }
  }

  if (fillCount > 0) {
    const rate = snapshotBeforeFill / fillCount;
    if (rate > 0.6) {
      patterns.push({
        description: `Successful runs take a snapshot before filling forms (${(rate * 100).toFixed(0)}% of the time)`,
        consistency: rate,
        actionSequence: [
          { action: "snapshot", args: { interactive_only: true } },
          { action: "fill", args: {} },
        ],
      });
    }
  }

  if (clickCount > 0) {
    const rate = snapshotBeforeClick / clickCount;
    if (rate > 0.6) {
      patterns.push({
        description: `Successful runs take a snapshot before clicking (${(rate * 100).toFixed(0)}% of the time)`,
        consistency: rate,
        actionSequence: [
          { action: "snapshot", args: { interactive_only: true } },
          { action: "click", args: {} },
        ],
      });
    }
  }

  return patterns;
}

function findStrategyPattern(traces: ActionTrace[]): SuccessPattern | null {
  if (traces.length < 2) return null;

  // Calculate average action count and distribution
  const avgActions = traces.reduce((s, t) => s + t.actions.length, 0) / traces.length;
  const actionCounts = new Map<string, number>();

  for (const trace of traces) {
    for (const action of trace.actions) {
      actionCounts.set(action.action, (actionCounts.get(action.action) || 0) + 1);
    }
  }

  const topActions = [...actionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  return {
    description: `Successful runs average ${avgActions.toFixed(1)} actions, primarily using: ${topActions.join(", ")}`,
    consistency: 0.9,
    actionSequence: topActions.map((name) => ({ action: name, args: {} })),
  };
}
