import type { SiteProfile } from "../types/feedback.js";
import type { ObservationReport } from "../types/score.js";
import type { TracedAction, ActionTrace } from "../types/trace.js";
import type { AnalysisResult } from "../types/pattern.js";
import { log } from "../utils/logger.js";

/**
 * Extract domain from a URL.
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove "www." prefix for grouping
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface TaskObservation {
  taskId: string;
  domain: string;
  report: ObservationReport;
  analysis: AnalysisResult;
}

/**
 * Build or update a SiteProfile from multiple task observations on the same domain.
 * Extracts generalizable site knowledge by abstracting away task-specific details.
 */
export function buildSiteProfile(
  domain: string,
  observations: TaskObservation[],
  existing?: SiteProfile,
): SiteProfile {
  const profile: SiteProfile = existing
    ? { ...existing, structure: [...existing.structure], navigationPatterns: [...existing.navigationPatterns], pitfalls: [...existing.pitfalls], strategies: [...existing.strategies], taskIds: [...existing.taskIds] }
    : {
        domain,
        structure: [],
        navigationPatterns: [],
        pitfalls: [],
        strategies: [],
        observationCount: 0,
        taskIds: [],
        updatedAt: new Date().toISOString(),
      };

  for (const obs of observations) {
    if (!profile.taskIds.includes(obs.taskId)) {
      profile.taskIds.push(obs.taskId);
    }
    profile.observationCount += obs.report.runs.length;

    // Extract from all traces in this observation
    const allTraces = obs.report.runs.map((r) => r.trace);
    const passedTraces = obs.report.runs.filter((r) => r.score.passed).map((r) => r.trace);
    const failedTraces = obs.report.runs.filter((r) => !r.score.passed).map((r) => r.trace);

    // 1. Extract structural observations
    extractStructure(profile, allTraces);

    // 2. Extract pitfalls from errors
    extractPitfalls(profile, failedTraces, allTraces);

    // 3. Extract working strategies from successful runs
    extractStrategies(profile, passedTraces);

    // 4. Extract navigation patterns
    extractNavigationPatterns(profile, passedTraces, allTraces);
  }

  // Deduplicate all arrays
  profile.structure = dedup(profile.structure);
  profile.navigationPatterns = dedup(profile.navigationPatterns);
  profile.pitfalls = dedup(profile.pitfalls);
  profile.strategies = dedup(profile.strategies);
  profile.updatedAt = new Date().toISOString();

  log.info(`Site profile for ${domain}: ${profile.structure.length} structure, ${profile.pitfalls.length} pitfalls, ${profile.strategies.length} strategies, ${profile.navigationPatterns.length} nav patterns`);

  return profile;
}

/**
 * Detect structural features of the site from trace data.
 */
function extractStructure(profile: SiteProfile, traces: ActionTrace[]): void {
  for (const trace of traces) {
    for (const action of trace.actions) {
      const output = action.result.output || "";
      const snapshot = action.snapshotAfter || "";
      const combined = output + snapshot;

      // Detect iframes
      if (combined.includes("iframe") || combined.includes("frame")) {
        addIfNovel(profile.structure, `Site uses iframes — content may load inside frames. After navigation, check if target content is in an iframe.`);
      }

      // Detect dynamic loading / SPA behavior
      if (action.result.error?.includes("Execution context was destroyed") ||
          action.result.error?.includes("navigation")) {
        addIfNovel(profile.structure, `Site has dynamic page transitions that destroy the execution context. After clicking links, wait for the new page to load and take a fresh snapshot before acting.`);
      }

      // Detect popups / modals / overlays
      if (combined.includes("modal") || combined.includes("popup") || combined.includes("overlay") || combined.includes("dialog")) {
        addIfNovel(profile.structure, `Site shows modals/popups. If a dialog appears, dismiss it or interact with it before trying to access elements behind it.`);
      }

      // Detect cookie/consent banners
      if (combined.includes("cookie") || combined.includes("consent") || combined.includes("동의")) {
        addIfNovel(profile.structure, `Site may show a cookie consent or agreement banner. Accept or dismiss it first to unblock the main content.`);
      }

      // Detect tab/accordion patterns
      if (combined.includes("tab-") || combined.includes("tabpanel") || combined.includes("accordion")) {
        addIfNovel(profile.structure, `Site uses tabs or accordion components. Content may be hidden — click the correct tab/section header to reveal it.`);
      }
    }
  }
}

/**
 * Extract common error patterns as site-specific pitfalls.
 */
function extractPitfalls(profile: SiteProfile, failedTraces: ActionTrace[], allTraces: ActionTrace[]): void {
  const errorCounts = new Map<string, number>();
  const totalTraces = allTraces.length;

  for (const trace of allTraces) {
    const seenErrors = new Set<string>();
    for (const action of trace.actions) {
      if (!action.result.success && action.result.error) {
        const abstracted = abstractError(action);
        if (abstracted && !seenErrors.has(abstracted)) {
          seenErrors.add(abstracted);
          errorCounts.set(abstracted, (errorCounts.get(abstracted) || 0) + 1);
        }
      }
    }
  }

  // Only promote errors that appear in multiple runs
  for (const [error, count] of errorCounts) {
    if (count >= 2 || count / totalTraces >= 0.3) {
      addIfNovel(profile.pitfalls, error);
    }
  }

  // Detect: model always runs out of steps on this site
  const ranOutOfSteps = allTraces.filter((t) => !t.completed).length;
  if (ranOutOfSteps >= 2 && ranOutOfSteps / totalTraces >= 0.5) {
    addIfNovel(profile.pitfalls, `This site often causes the agent to run out of steps. Be efficient: don't explore unnecessarily, and call task_complete as soon as the goal is achieved.`);
  }
}

/**
 * Abstract an error into a site-level description (remove element-specific refs).
 */
function abstractError(action: TracedAction): string | null {
  const error = action.result.error || "";
  const actionName = action.action;

  if (error.includes("Execution context was destroyed")) {
    return `'${actionName}' can fail with "execution context destroyed" — this site reloads/navigates aggressively. Take a fresh snapshot after any navigation.`;
  }

  if (error.includes("not found") || error.includes("no element")) {
    return `'${actionName}' targets can disappear on this site — elements change after page updates. Always take a snapshot immediately before interacting.`;
  }

  if (error.includes("not interactable") || error.includes("not clickable")) {
    return `Some elements on this site appear in the snapshot but aren't interactable — they may be obscured by overlays or not yet loaded. Try scrolling to the element or waiting.`;
  }

  if (error.includes("timeout") || error.includes("timed out")) {
    return `This site has slow-loading content. Use 'wait' after navigation before trying to interact with elements.`;
  }

  // Generic but still useful if frequent
  if (error.length > 10) {
    return `'${actionName}' commonly fails on this site: ${error.slice(0, 80)}`;
  }

  return null;
}

/**
 * Extract working strategies from successful traces.
 * Abstracts action sequences into reusable site-level patterns.
 */
function extractStrategies(profile: SiteProfile, passedTraces: ActionTrace[]): void {
  if (passedTraces.length === 0) return;

  // Strategy: what action types do successful runs use?
  const actionTypeSets = passedTraces.map((t) =>
    [...new Set(t.actions.map((a) => a.action))],
  );
  const commonActions = actionTypeSets.reduce((common, set) =>
    common.filter((a) => set.includes(a)),
    actionTypeSets[0] || [],
  );

  if (commonActions.length >= 3) {
    addIfNovel(profile.strategies,
      `Successful interactions on this site use these action types: ${commonActions.join(", ")}. Make sure to use them.`,
    );
  }

  // Strategy: snapshot-before-interaction pattern
  let snapshotBeforeInteract = 0;
  let totalInteractions = 0;
  for (const trace of passedTraces) {
    for (let i = 0; i < trace.actions.length; i++) {
      const action = trace.actions[i];
      if (["fill", "click", "select"].includes(action.action)) {
        totalInteractions++;
        const prev = i > 0 ? trace.actions[i - 1] : null;
        if (prev?.action === "snapshot") {
          snapshotBeforeInteract++;
        }
      }
    }
  }

  if (totalInteractions > 0 && snapshotBeforeInteract / totalInteractions >= 0.7) {
    addIfNovel(profile.strategies,
      `On this site, always take a snapshot immediately before fill/click/select — elements and their @refs change frequently.`,
    );
  }

  // Strategy: average steps needed
  const avgSteps = passedTraces.reduce((s, t) => s + t.actions.length, 0) / passedTraces.length;
  if (avgSteps <= 8) {
    addIfNovel(profile.strategies,
      `Tasks on this site can be completed in ~${Math.round(avgSteps)} steps. Be efficient and don't over-explore.`,
    );
  }
}

/**
 * Extract navigation patterns: how users get from page A to page B on this site.
 * Abstracts away specific search terms and element refs.
 */
function extractNavigationPatterns(
  profile: SiteProfile,
  passedTraces: ActionTrace[],
  allTraces: ActionTrace[],
): void {
  if (passedTraces.length === 0 && allTraces.length === 0) return;

  const traces = passedTraces.length > 0 ? passedTraces : allTraces;

  // Build abstract action sequences from traces
  for (const trace of traces) {
    const abstractSeq = abstractActionSequence(trace);
    if (abstractSeq) {
      addIfNovel(profile.navigationPatterns, abstractSeq);
    }
  }

  // Detect search flow pattern
  const searchFlows = traces.filter((t) => hasSearchFlow(t));
  if (searchFlows.length > 0) {
    const flow = describeSearchFlow(searchFlows[0]);
    if (flow) {
      addIfNovel(profile.navigationPatterns, flow);
    }
  }
}

/**
 * Abstract a trace into a high-level description of what was done,
 * stripping task-specific values but keeping the interaction pattern.
 */
function abstractActionSequence(trace: ActionTrace): string | null {
  if (trace.actions.length < 3) return null;

  const steps: string[] = [];

  for (const action of trace.actions) {
    const desc = abstractAction(action);
    if (desc && !steps.includes(desc)) {
      steps.push(desc);
    }
  }

  if (steps.length < 2) return null;

  return `Interaction flow: ${steps.join(" → ")}`;
}

/**
 * Describe a single action abstractly (no specific refs or values).
 */
function abstractAction(action: TracedAction): string | null {
  const snapshot = action.snapshotAfter || "";

  switch (action.action) {
    case "open":
      return "navigate to page";
    case "snapshot":
      return "observe page elements";
    case "fill": {
      const context = inferElementContext(action, snapshot);
      return context ? `fill ${context}` : "fill input field";
    }
    case "click": {
      const context = inferElementContext(action, snapshot);
      return context ? `click ${context}` : "click element";
    }
    case "type":
      return "type text";
    case "press":
      return `press ${action.args.key || "key"}`;
    case "select":
      return "select option";
    case "scroll":
      return `scroll ${action.args.direction || "down"}`;
    case "wait":
      return "wait for page load";
    case "get":
      return "read page content";
    case "screenshot":
      return "take screenshot";
    default:
      return null;
  }
}

/**
 * Infer what kind of element an action targets based on context.
 * Uses the snapshot text, action args, and surrounding context.
 */
function inferElementContext(action: TracedAction, snapshot: string): string | null {
  const ref = String(action.args.ref || "");
  const value = String(action.args.value || "");

  // Search-related keywords in various languages
  const searchKeywords = ["search", "검색", "query", "keyword", "찾기", "input"];

  // Check if the snapshot near this ref mentions search-related text
  if (ref && snapshot) {
    // Find lines in snapshot containing this ref
    const lines = snapshot.split("\n");
    for (const line of lines) {
      if (line.includes(ref) || line.includes(`@${ref}`)) {
        const lowerLine = line.toLowerCase();
        if (searchKeywords.some((k) => lowerLine.includes(k))) {
          return "search input";
        }
        if (lowerLine.includes("submit") || lowerLine.includes("검색") || lowerLine.includes("search")) {
          return "search/submit button";
        }
        if (lowerLine.includes("login") || lowerLine.includes("로그인")) {
          return "login field";
        }
        if (lowerLine.includes("password") || lowerLine.includes("비밀번호")) {
          return "password field";
        }
      }
    }
  }

  // Infer from action type + value
  if (action.action === "fill" && value.length > 0) {
    return "text input";
  }

  if (action.action === "click") {
    // Check if followed by navigation (next action is open or snapshot shows new page)
    return null; // Can't determine without more context
  }

  return null;
}

/**
 * Detect if a trace contains a search flow (fill → click/press → results).
 */
function hasSearchFlow(trace: ActionTrace): boolean {
  for (let i = 0; i < trace.actions.length - 1; i++) {
    const curr = trace.actions[i];
    const next = trace.actions[i + 1];
    if (curr.action === "fill" && (next.action === "click" || next.action === "press")) {
      return true;
    }
  }
  return false;
}

/**
 * Describe the search flow pattern on this site.
 */
function describeSearchFlow(trace: ActionTrace): string | null {
  const steps: string[] = [];

  for (let i = 0; i < trace.actions.length; i++) {
    const action = trace.actions[i];
    const next = i < trace.actions.length - 1 ? trace.actions[i + 1] : null;

    if (action.action === "open") {
      steps.push("open the site");
    } else if (action.action === "snapshot" && steps.length <= 2) {
      steps.push("take snapshot to find the search input");
    } else if (action.action === "fill") {
      steps.push("fill the search input with your query");
      if (next?.action === "click") {
        steps.push("click the search button");
        i++; // skip the click
      } else if (next?.action === "press") {
        steps.push("press Enter to submit");
        i++;
      }
    } else if (action.action === "snapshot" && steps.length > 2) {
      steps.push("take snapshot to see search results");
      break; // Stop after seeing results
    }
  }

  if (steps.length >= 3) {
    return `Search pattern on this site: ${steps.join(" → ")}`;
  }
  return null;
}

// --- Helpers ---

function addIfNovel(arr: string[], item: string): void {
  const lowerItem = item.toLowerCase();
  // Don't add if a very similar entry already exists
  const isDuplicate = arr.some((existing) => {
    const lowerExisting = existing.toLowerCase();
    return lowerExisting.includes(lowerItem.slice(0, 40)) ||
           lowerItem.includes(lowerExisting.slice(0, 40));
  });
  if (!isDuplicate) {
    arr.push(item);
  }
}

function dedup(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const key = item.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
