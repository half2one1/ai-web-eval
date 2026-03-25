import type { PromptPatch, AccumulatedFeedback } from "../types/feedback.js";

const MAX_FEEDBACK_LENGTH = 2000;

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
  const newPatches = [...feedback.patches, patch];

  // Build combined text, newest patches take priority
  let totalText = "";
  for (let i = newPatches.length - 1; i >= 0; i--) {
    const candidate = newPatches[i].text;
    if (totalText.length + candidate.length + 2 <= MAX_FEEDBACK_LENGTH) {
      totalText = candidate + (totalText ? "\n" + totalText : "");
    } else {
      // Trim older patches if we exceed the limit
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
