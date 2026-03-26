import type { ModelProfile } from "../types/feedback.js";
import type { AnalysisResult } from "../types/pattern.js";
import type { ObservationReport } from "../types/score.js";
import { log } from "../utils/logger.js";

interface DomainObservation {
  domain: string;
  taskId: string;
  analysis: AnalysisResult;
  report: ObservationReport;
}

/**
 * Extract model-level weaknesses and strengths that appear across multiple domains.
 * Only patterns that recur on 2+ different sites are promoted to model-level —
 * single-site issues are site-specific, not model weaknesses.
 */
export function buildModelProfile(
  observations: DomainObservation[],
  existing?: ModelProfile,
): ModelProfile {
  const profile: ModelProfile = existing
    ? { ...existing, weaknesses: [...existing.weaknesses], strengths: [...existing.strengths], weaknessDomainCounts: [...existing.weaknessDomainCounts] }
    : {
        weaknesses: [],
        strengths: [],
        weaknessDomainCounts: [],
        observationCount: 0,
        updatedAt: new Date().toISOString(),
      };

  // Group observations by domain
  const byDomain = new Map<string, DomainObservation[]>();
  for (const obs of observations) {
    const list = byDomain.get(obs.domain) || [];
    list.push(obs);
    byDomain.set(obs.domain, list);
  }

  profile.observationCount = observations.reduce(
    (sum, obs) => sum + obs.report.runs.length, 0,
  );

  // Detect cross-domain weakness patterns
  const weaknessCandidates = new Map<string, Set<string>>(); // weakness → set of domains

  for (const [domain, domainObs] of byDomain) {
    const domainWeaknesses = extractDomainWeaknesses(domainObs);
    for (const weakness of domainWeaknesses) {
      const domains = weaknessCandidates.get(weakness) || new Set();
      domains.add(domain);
      weaknessCandidates.set(weakness, domains);
    }
  }

  // Promote to model-level only if appears on 2+ domains
  for (const [weakness, domains] of weaknessCandidates) {
    if (domains.size >= 2) {
      addWeakness(profile, weakness, domains.size);
    }
  }

  // Detect cross-domain strength patterns
  const strengthCandidates = new Map<string, Set<string>>();

  for (const [domain, domainObs] of byDomain) {
    const domainStrengths = extractDomainStrengths(domainObs);
    for (const strength of domainStrengths) {
      const domains = strengthCandidates.get(strength) || new Set();
      domains.add(domain);
      strengthCandidates.set(strength, domains);
    }
  }

  for (const [strength, domains] of strengthCandidates) {
    if (domains.size >= 2 && !profile.strengths.includes(strength)) {
      profile.strengths.push(strength);
    }
  }

  profile.updatedAt = new Date().toISOString();

  log.info(`Model profile: ${profile.weaknesses.length} weaknesses, ${profile.strengths.length} strengths across ${byDomain.size} domains`);

  return profile;
}

/**
 * Extract behavioral weaknesses observed on a single domain's tasks.
 * Returns abstract weakness descriptions (not site-specific).
 */
function extractDomainWeaknesses(observations: DomainObservation[]): string[] {
  const weaknesses: string[] = [];

  for (const obs of observations) {
    const runs = obs.report.runs;
    const totalRuns = runs.length;

    // Weakness: never calls task_complete
    const neverCompleted = runs.filter((r) => !r.trace.completed).length;
    if (neverCompleted >= 2 && neverCompleted / totalRuns >= 0.5) {
      weaknesses.push(
        "You frequently fail to call task_complete when the task is done. Once the goal is achieved, immediately call task_complete with a summary. Don't keep exploring.",
      );
    }

    // Weakness: gets stuck in action loops
    const hasLoops = runs.filter((r) => {
      const actions = r.trace.actions;
      for (let i = 2; i < actions.length; i++) {
        if (actions[i].action === actions[i - 1].action &&
            actions[i].action === actions[i - 2].action) {
          return true;
        }
      }
      return false;
    }).length;
    if (hasLoops >= 2) {
      weaknesses.push(
        "You get stuck repeating the same action multiple times. If an action doesn't change the page state, try a completely different approach — different element, different action type, or navigate elsewhere.",
      );
    }

    // Weakness: never uses interactive actions
    const noInteraction = runs.filter((r) => {
      const interactive = ["fill", "click", "type", "select", "press"];
      return !r.trace.actions.some((a) => interactive.includes(a.action)) &&
             r.trace.actions.length >= 3;
    }).length;
    if (noInteraction >= 2) {
      weaknesses.push(
        "You sometimes only observe (snapshot) without ever interacting with the page. After taking a snapshot, identify elements by @ref and use fill/click/type to interact with them.",
      );
    }

    // Weakness: low action diversity
    const lowDiversity = runs.filter((r) => {
      const unique = new Set(r.trace.actions.map((a) => a.action));
      return unique.size <= 2 && r.trace.actions.length >= 5;
    }).length;
    if (lowDiversity >= 2) {
      weaknesses.push(
        "You use too few action types. Effective web tasks require a mix: open → snapshot → fill/click → snapshot → verify → task_complete.",
      );
    }

    // Weakness: excessive scrolling without finding target
    const excessiveScroll = runs.filter((r) => {
      const scrollActions = r.trace.actions.filter((a) => a.action === "scroll");
      return scrollActions.length >= 5;
    }).length;
    if (excessiveScroll >= 2) {
      weaknesses.push(
        "You tend to scroll excessively looking for content. If you can't find what you need after 2-3 scrolls, try using the site's search function or navigation links instead.",
      );
    }
  }

  return [...new Set(weaknesses)];
}

/**
 * Extract behavioral strengths observed on a single domain's tasks.
 */
function extractDomainStrengths(observations: DomainObservation[]): string[] {
  const strengths: string[] = [];

  for (const obs of observations) {
    const passed = obs.report.runs.filter((r) => r.score.passed);
    if (passed.length === 0) continue;

    // Strength: consistently takes snapshot before interaction
    let snapshotFirst = 0;
    for (const run of passed) {
      const actions = run.trace.actions;
      if (actions.length >= 2 && actions[0].action === "open" &&
          (actions[1].action === "snapshot" || actions[0].snapshotAfter)) {
        snapshotFirst++;
      }
    }
    if (snapshotFirst === passed.length && passed.length >= 2) {
      strengths.push(
        "You correctly observe the page (snapshot) before interacting — keep doing this on every site.",
      );
    }

    // Strength: efficient task completion
    const avgSteps = passed.reduce((s, r) => s + r.trace.actions.length, 0) / passed.length;
    if (avgSteps <= 6 && passed.length >= 2) {
      strengths.push(
        "You complete tasks efficiently in few steps — maintain this directness.",
      );
    }
  }

  return [...new Set(strengths)];
}

function addWeakness(profile: ModelProfile, weakness: string, domainCount: number): void {
  // Check if similar weakness already exists
  const idx = profile.weaknesses.findIndex((w) =>
    w.toLowerCase().slice(0, 40) === weakness.toLowerCase().slice(0, 40),
  );
  if (idx >= 0) {
    // Update domain count if higher
    profile.weaknessDomainCounts[idx] = Math.max(
      profile.weaknessDomainCounts[idx],
      domainCount,
    );
  } else {
    profile.weaknesses.push(weakness);
    profile.weaknessDomainCounts.push(domainCount);
  }
}
