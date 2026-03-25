import type { ActionTrace, TracedAction, ActionAnnotation } from "../types/trace.js";

/**
 * Annotate each action in a trace with labels:
 * - mistake: action failed or was immediately corrected
 * - redundant: repeated action with no meaningful state change
 * - recovery: corrective action after a mistake
 * - optimal: action that directly progresses toward the goal
 * - suboptimal: action that works but is inefficient
 */
export function annotateTrace(trace: ActionTrace): ActionAnnotation[] {
  const annotations: ActionAnnotation[] = [];
  const actions = trace.actions;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const prev = i > 0 ? actions[i - 1] : null;
    const next = i < actions.length - 1 ? actions[i + 1] : null;

    const annotation = classifyAction(action, prev, next, i);
    annotations.push(annotation);
    action.annotation = annotation;
  }

  return annotations;
}

function classifyAction(
  action: TracedAction,
  prev: TracedAction | null,
  next: TracedAction | null,
  _index: number,
): ActionAnnotation {
  // Failed actions are mistakes
  if (!action.result.success) {
    return {
      type: "mistake",
      message: `Action '${action.action}' failed: ${action.result.error || "unknown error"}`,
    };
  }

  // Redundant: same action + args as the previous action
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
    // Heuristic: if the model clicks then immediately navigates to a different URL, it's recovery
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

function isSameAction(a: TracedAction, b: TracedAction): boolean {
  if (a.action !== b.action) return false;
  // Compare args (ignoring _toolCallId)
  const aArgs = { ...a.args };
  const bArgs = { ...b.args };
  delete aArgs._toolCallId;
  delete bArgs._toolCallId;
  return JSON.stringify(aArgs) === JSON.stringify(bArgs);
}
