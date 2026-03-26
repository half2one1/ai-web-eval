import type { ActionTrace, TracedAction, ActionAnnotation } from "../types/trace.js";

/**
 * Annotate each action in a trace with labels:
 * - mistake: action failed, or part of a detected loop (strategic failure)
 * - redundant: repeated action with no meaningful state change
 * - recovery: corrective action after a mistake
 * - optimal: action that directly progresses toward the goal
 * - suboptimal: action that works but is inefficient
 */
export function annotateTrace(trace: ActionTrace): ActionAnnotation[] {
  const annotations: ActionAnnotation[] = [];
  const actions = trace.actions;

  // Pre-compute loop spans: find runs of identical consecutive actions
  const loopSpans = detectLoops(actions);

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const prev = i > 0 ? actions[i - 1] : null;
    const next = i < actions.length - 1 ? actions[i + 1] : null;

    // Check if this action is inside a detected loop
    const inLoop = loopSpans.some(
      (span) => i >= span.start && i <= span.end,
    );

    const annotation = classifyAction(action, prev, next, i, inLoop);
    annotations.push(annotation);
    action.annotation = annotation;
  }

  // Post-pass: detect strategic failures at the trace level
  addStrategicAnnotations(trace, annotations);

  return annotations;
}

interface LoopSpan {
  start: number;
  end: number;
  action: string;
  count: number;
}

/**
 * Detect consecutive runs of the same action (ignoring _toolCallId).
 * A "loop" is 3+ consecutive identical actions.
 */
function detectLoops(actions: TracedAction[]): LoopSpan[] {
  const spans: LoopSpan[] = [];
  let runStart = 0;

  for (let i = 1; i <= actions.length; i++) {
    const curr = i < actions.length ? actions[i] : null;
    const prev = actions[i - 1];

    if (curr && isSameAction(curr, prev)) continue;

    // End of a run
    const runLen = i - runStart;
    if (runLen >= 3) {
      spans.push({
        start: runStart,
        end: i - 1,
        action: actions[runStart].action,
        count: runLen,
      });
    }
    runStart = i;
  }

  return spans;
}

function classifyAction(
  action: TracedAction,
  prev: TracedAction | null,
  next: TracedAction | null,
  _index: number,
  inLoop: boolean,
): ActionAnnotation {
  // Failed actions are mistakes
  if (!action.result.success) {
    return {
      type: "mistake",
      message: `Action '${action.action}' failed: ${action.result.error || "unknown error"}`,
    };
  }

  // Loop: repeated action 3+ times in a row is a strategic mistake
  if (inLoop && prev && isSameAction(action, prev)) {
    return {
      type: "mistake",
      message: `Stuck in loop: repeated '${action.action}' without progressing toward the goal`,
    };
  }

  // Redundant: same action + args as the previous action (not in a 3+ loop)
  if (prev && isSameAction(action, prev)) {
    return {
      type: "redundant",
      message: `Repeated '${action.action}' with same arguments`,
    };
  }

  // Redundant: consecutive snapshots without any action in between
  if (
    action.action === "snapshot" &&
    prev?.action === "snapshot" &&
    prev.result.success
  ) {
    return {
      type: "redundant",
      message: "Consecutive snapshot without any action in between",
    };
  }

  // Recovery: a "fill" that corrects a previous fill on the same element
  if (action.action === "fill" && prev?.action === "fill") {
    const prevRef = prev.args.ref;
    const currRef = action.args.ref;
    if (prevRef && currRef && prevRef === currRef) {
      return {
        type: "recovery",
        message: `Re-filled '${currRef}' — correcting previous value`,
      };
    }
  }

  // Recovery: navigating back after a click (wrong navigation)
  if (
    action.action === "open" &&
    prev?.action === "click" &&
    next?.action === "snapshot"
  ) {
    return {
      type: "recovery",
      message: "Navigated back after click — possible wrong navigation recovery",
    };
  }

  // Suboptimal: taking a screenshot when a snapshot would suffice for interaction
  if (action.action === "screenshot" && next?.action === "click") {
    return {
      type: "suboptimal",
      message: "Screenshot before interaction — snapshot would be more useful",
    };
  }

  // Default: optimal
  return {
    type: "optimal",
    message: `Action '${action.action}' executed successfully`,
  };
}

/**
 * Detect trace-level strategic failures that individual action classification misses.
 * These become additional annotations on the first action of the trace.
 */
function addStrategicAnnotations(
  trace: ActionTrace,
  annotations: ActionAnnotation[],
): void {
  if (trace.actions.length === 0) return;

  const actionTypes = new Set(trace.actions.map((a) => a.action));
  const totalActions = trace.actions.length;

  // Strategic failure: model never used fill, click, or type (no interaction)
  const interactiveActions = ["fill", "click", "type", "select", "press"];
  const usedAnyInteractive = interactiveActions.some((a) => actionTypes.has(a));

  if (!usedAnyInteractive && totalActions >= 3) {
    // Find the first "optimal" annotation and upgrade it to "suboptimal"
    for (let i = 0; i < annotations.length; i++) {
      if (annotations[i].type === "optimal") {
        annotations[i] = {
          type: "suboptimal",
          message: `Model never used any interactive action (fill, click, type) across ${totalActions} steps — failed to engage with the page`,
        };
        if (trace.actions[i]) trace.actions[i].annotation = annotations[i];
        break;
      }
    }
  }

  // Strategic failure: action diversity is very low
  if (actionTypes.size <= 2 && totalActions >= 5) {
    const dominant = [...actionTypes].join(", ");
    for (let i = 0; i < annotations.length; i++) {
      if (annotations[i].type === "optimal") {
        annotations[i] = {
          type: "suboptimal",
          message: `Very low action diversity: only used [${dominant}] across ${totalActions} steps`,
        };
        if (trace.actions[i]) trace.actions[i].annotation = annotations[i];
        break;
      }
    }
  }
}

function isSameAction(a: TracedAction, b: TracedAction): boolean {
  if (a.action !== b.action) return false;
  const aArgs = { ...a.args };
  const bArgs = { ...b.args };
  delete aArgs._toolCallId;
  delete bArgs._toolCallId;
  return JSON.stringify(aArgs) === JSON.stringify(bArgs);
}
