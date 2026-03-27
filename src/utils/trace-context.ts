import type { TracedAction } from "../types/trace.js";

/**
 * Parse a snapshot's accessibility tree and build a map of ref → element description.
 * Snapshot format: `- role "label" [ref=eN]` or `- role [ref=eN]` (no label)
 */
function parseSnapshotRefs(snapshot: string): Map<string, string> {
  const refMap = new Map<string, string>();
  // Match: - role "optional label" [ref=eN]
  const refPattern = /- (\w+)\s+(?:"([^"]*)")?\s*\[ref=(e\d+)\]/g;

  for (const m of snapshot.matchAll(refPattern)) {
    const [, role, label, ref] = m;
    const desc = label ? `the "${label}" ${role}` : `a ${role}`;
    refMap.set(ref, desc);
  }

  return refMap;
}

/**
 * Find the most recent snapshot text at or before a given action index.
 */
function findPrecedingSnapshot(
  actions: TracedAction[],
  beforeIndex: number,
): string | null {
  for (let i = beforeIndex; i >= 0; i--) {
    if (actions[i].action === "snapshot") {
      return actions[i].result.output || actions[i].rawOutput || "";
    }
    if (actions[i].snapshotAfter) {
      return actions[i].snapshotAfter!;
    }
  }
  return null;
}

/**
 * Resolve an @eN ref to a human-readable element description
 * by looking up the most recent snapshot in the trace.
 *
 * Returns e.g. `the "Search" button` or falls back to the raw ref.
 */
export function resolveRef(
  ref: string,
  actions: TracedAction[],
  actionIndex: number,
): string {
  const normalizedRef = ref.replace(/^@/, "");
  if (!normalizedRef.match(/^e\d+$/)) return ref;

  const snapshot = findPrecedingSnapshot(actions, actionIndex);
  if (!snapshot) return ref;

  const refMap = parseSnapshotRefs(snapshot);
  return refMap.get(normalizedRef) || ref;
}

/**
 * Resolve all @eN refs inside an arbitrary string by looking up the snapshot
 * context from a trace. Replaces occurrences like `@e5` or `ref=@e5` with
 * the resolved element description.
 */
export function resolveRefsInText(
  text: string,
  actions: TracedAction[],
  actionIndex: number,
): string {
  return text.replace(/@(e\d+)/g, (_match, ref: string) => {
    const resolved = resolveRef(ref, actions, actionIndex);
    return resolved === ref ? `@${ref}` : resolved;
  });
}

/**
 * Describe an action in human-readable terms, resolving element refs.
 */
function describeActionVerb(
  action: TracedAction,
  allActions: TracedAction[],
): string {
  const idx = action.index;

  switch (action.action) {
    case "open":
      return "opening the page";
    case "snapshot":
      return "observing the page";
    case "fill": {
      const target = action.args.ref
        ? resolveRef(String(action.args.ref), allActions, idx)
        : "an input";
      return `filling ${target}`;
    }
    case "click": {
      const target = action.args.ref
        ? resolveRef(String(action.args.ref), allActions, idx)
        : "an element";
      return `clicking ${target}`;
    }
    case "press":
      return `pressing ${action.args.key || "a key"}`;
    case "select": {
      const target = action.args.ref
        ? resolveRef(String(action.args.ref), allActions, idx)
        : "a dropdown";
      return `selecting from ${target}`;
    }
    case "scroll":
      return `scrolling ${action.args.direction || "down"}`;
    case "type":
      return "typing text";
    case "wait":
      return "waiting for page load";
    case "task_complete":
    case "done":
      return "completing the task";
    default:
      return `performing '${action.action}'`;
  }
}

/**
 * Describe a step by its surrounding context instead of a bare index.
 *
 * Returns e.g. `after filling the "Search" combobox` or
 * `at the start, when observing the page`.
 */
export function describeStepContext(
  stepIndex: number,
  actions: TracedAction[],
): string {
  const action = actions[stepIndex];
  if (!action) return `at step ${stepIndex}`;

  const currentDesc = describeActionVerb(action, actions);

  // Find the preceding meaningful action
  if (stepIndex === 0) {
    return `at the start, when ${currentDesc}`;
  }

  const prevAction = actions[stepIndex - 1];
  const prevDesc = describeActionVerb(prevAction, actions);
  return `after ${prevDesc}, when ${currentDesc}`;
}

/**
 * Produce a short description of an action with resolved refs.
 * Used for inline references in feedback text.
 *
 * Returns e.g. `click(the "Search" button)` or `fill(the "검색어" combobox, "Turing Award")`
 */
export function describeActionBrief(
  action: TracedAction,
  allActions: TracedAction[],
): string {
  const idx = action.index;
  const parts: string[] = [];

  if (action.args.ref) {
    parts.push(resolveRef(String(action.args.ref), allActions, idx));
  }
  if (action.args.value != null) {
    const val = String(action.args.value);
    parts.push(`"${val.length > 30 ? val.slice(0, 27) + "..." : val}"`);
  }
  if (action.args.key) {
    parts.push(String(action.args.key));
  }

  const inner = parts.length > 0 ? parts.join(", ") : "";
  return `${action.action}(${inner})`;
}
