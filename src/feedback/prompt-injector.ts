import type {
  PromptPatch,
  AccumulatedFeedback,
  LayeredFeedback,
  ModelProfile,
  SiteProfile,
} from "../types/feedback.js";

const MAX_FEEDBACK_LENGTH = 16000;
const MAX_MODEL_LENGTH = 4000;
const MAX_SITE_LENGTH = 4000;
const MAX_TASK_LENGTH = 8000;

/**
 * Validate that a feedback patch contains actual instructions, not garbage.
 * Rejects patches that look like echoed trace data or raw model thoughts.
 */
function isValidPatch(patch: PromptPatch): boolean {
  const text = patch.text;
  if (!text || text.length < 10) return false;

  // Reject if it contains <think> tags (leaked model reasoning)
  if (/<think>/.test(text)) return false;

  // Reject if it looks like raw trace data
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const traceLineCount = lines.filter((line) =>
    /^\s*\d+\.\s+(open|click|fill|snapshot|scroll|type|press|select|get|wait|screenshot|done)\(/.test(line) ||
    /Did NOT call task_complete/.test(line) ||
    /### Run \d+ \[(PASSED|FAILED)\]/.test(line),
  ).length;

  if (lines.length > 0 && traceLineCount / lines.length > 0.3) return false;

  return true;
}

export function createEmptyFeedback(): AccumulatedFeedback {
  return { patches: [], totalText: "" };
}

/**
 * Add a new prompt patch to accumulated feedback.
 * Manages total length to prevent prompt bloat.
 */
export function injectFeedback(
  current: AccumulatedFeedback | undefined,
  patch: PromptPatch,
): AccumulatedFeedback {
  const feedback = current || createEmptyFeedback();

  // Quality gate: reject patches that contain garbage (echoed traces, think tags)
  if (!isValidPatch(patch)) {
    return feedback;
  }

  const newPatches = [...feedback.patches, patch];

  // Build combined text, newest patches take priority
  let totalText = "";
  for (let i = newPatches.length - 1; i >= 0; i--) {
    const candidate = newPatches[i].text;
    if (totalText.length + candidate.length + 2 <= MAX_FEEDBACK_LENGTH) {
      totalText = candidate + (totalText ? "\n" + totalText : "");
    } else {
      break;
    }
  }

  return { patches: newPatches, totalText };
}

/**
 * Get the feedback text to inject into the system prompt.
 * Returns undefined if there's no feedback.
 */
export function getFeedbackText(
  feedback: AccumulatedFeedback | undefined,
): string | undefined {
  if (!feedback || !feedback.totalText) return undefined;
  return feedback.totalText;
}

/**
 * Build layered feedback text from three-layer profiles.
 * Priority: model-level → site-level → task-level
 * Each layer has a budget to prevent prompt bloat.
 */
export function buildLayeredFeedbackText(
  layered: LayeredFeedback,
): string | undefined {
  const sections: string[] = [];

  // Layer 1: Model-level (universal weaknesses)
  if (layered.model && layered.model.weaknesses.length > 0) {
    const modelText = formatModelFeedback(layered.model);
    if (modelText) sections.push(modelText);
  }

  // Layer 2: Site-level (domain-specific knowledge)
  if (layered.site && hasSiteContent(layered.site)) {
    const siteText = formatSiteFeedback(layered.site);
    if (siteText) sections.push(siteText);
  }

  // Layer 3: Task-level (specific corrections)
  const taskText = getFeedbackText(layered.task);
  if (taskText) {
    const trimmed = trimToLength(taskText, MAX_TASK_LENGTH);
    sections.push(`[Task-specific corrections]\n${trimmed}`);
  }

  if (sections.length === 0) return undefined;
  return sections.join("\n\n");
}

function formatModelFeedback(profile: ModelProfile): string | null {
  if (profile.weaknesses.length === 0) return null;

  const lines: string[] = ["[General behavioral rules — apply to ALL tasks]"];

  for (let i = 0; i < profile.weaknesses.length; i++) {
    const weakness = profile.weaknesses[i];
    const domains = profile.weaknessDomainCounts[i] || 0;
    lines.push(`• ${weakness} (observed across ${domains} sites)`);
  }

  if (profile.strengths.length > 0) {
    lines.push("");
    for (const strength of profile.strengths) {
      lines.push(`✓ ${strength}`);
    }
  }

  return trimToLength(lines.join("\n"), MAX_MODEL_LENGTH);
}

function formatSiteFeedback(profile: SiteProfile): string | null {
  const lines: string[] = [
    `[Site knowledge for ${profile.domain} — learned from ${profile.observationCount} runs across ${profile.taskIds.length} task(s)]`,
  ];

  if (profile.structure.length > 0) {
    lines.push("Structure:");
    for (const note of profile.structure) {
      lines.push(`  • ${note}`);
    }
  }

  if (profile.pitfalls.length > 0) {
    lines.push("Known pitfalls:");
    for (const pitfall of profile.pitfalls) {
      lines.push(`  ⚠ ${pitfall}`);
    }
  }

  if (profile.strategies.length > 0) {
    lines.push("Proven strategies:");
    for (const strategy of profile.strategies) {
      lines.push(`  → ${strategy}`);
    }
  }

  if (profile.navigationPatterns.length > 0) {
    lines.push("Navigation patterns:");
    for (const pattern of profile.navigationPatterns) {
      lines.push(`  → ${pattern}`);
    }
  }

  const text = lines.join("\n");
  return text.length > 50 ? trimToLength(text, MAX_SITE_LENGTH) : null;
}

function hasSiteContent(profile: SiteProfile): boolean {
  return (
    profile.structure.length > 0 ||
    profile.pitfalls.length > 0 ||
    profile.strategies.length > 0 ||
    profile.navigationPatterns.length > 0
  );
}

function trimToLength(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}
