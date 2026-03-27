import OpenAI from "openai";
import type { AnalysisResult } from "../types/pattern.js";
import type { PromptPatch, LayeredFeedback } from "../types/feedback.js";
import type { ObservationReport } from "../types/score.js";
import type { TaskDefinition } from "../types/task.js";
import { synthesizeFeedback } from "./feedback-synthesizer.js";
import { log } from "../utils/logger.js";

export interface AISynthesisConfig {
  apiUrl: string;
  model: string;
  temperature?: number;
  /** Max tokens for synthesis response */
  maxTokens?: number;
}

const DEFAULT_CONFIG: AISynthesisConfig = {
  apiUrl: "http://localhost:1234/v1",
  model: "default",
  temperature: 0.3,
  maxTokens: 1024,
};

/**
 * Build the synthesis prompt that asks the LLM to interpret analysis results
 * and raw traces to produce actionable, context-aware feedback.
 */
function buildSynthesisPrompt(
  task: TaskDefinition,
  analysis: AnalysisResult,
  report: ObservationReport,
  existingFeedback?: LayeredFeedback,
): string {
  const sections: string[] = [];

  // --- Role and objective ---
  sections.push(`You are an evaluator analyzing a web browsing agent's performance on a task. Your job is to produce specific, actionable feedback that will help the agent succeed on its next attempt.

Write feedback as direct instructions to the agent. Be concrete — reference specific elements, actions, and page states from the traces. Avoid generic advice.`);

  // --- Task context ---
  sections.push(`## Task
- **Name**: ${task.name}
- **Goal**: ${task.goal}
- **URL**: ${task.url}
- **Category**: ${task.category}
- **Max steps**: ${task.maxSteps}`);

  // --- Performance summary ---
  sections.push(`## Performance Summary
- **Pass rate**: ${(analysis.passRate * 100).toFixed(0)}% (${Math.round(analysis.passRate * analysis.totalRuns)}/${analysis.totalRuns} runs passed)
- **Failure patterns detected**: ${analysis.failurePatterns.length}
- **Success patterns detected**: ${analysis.successPatterns.length}
- **Critical divergence steps**: ${analysis.criticalSteps.length}`);

  // --- Structured analysis ---
  if (analysis.failurePatterns.length > 0) {
    sections.push(`## Failure Patterns`);
    for (const p of analysis.failurePatterns) {
      const examples = p.examples.slice(0, 2).map((e) => {
        const argsStr = Object.entries(e.args)
          .filter(([k]) => k !== "_toolCallId")
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(", ");
        return `  - Run ${e.runIndex + 1}, step ${e.actionIndex}: ${e.action}(${argsStr})${e.error ? ` -> ERROR: ${e.error}` : ""}`;
      });
      sections.push(
        `**${p.description}** (frequency: ${(p.frequency * 100).toFixed(0)}%, at steps: ${p.atSteps.join(", ")})\n${examples.join("\n")}`,
      );
    }
  }

  if (analysis.successPatterns.length > 0) {
    sections.push(`## Success Patterns`);
    for (const p of analysis.successPatterns) {
      const seq = p.actionSequence.length > 0
        ? `Sequence: ${p.actionSequence.map((a) => a.action).join(" -> ")}`
        : "";
      sections.push(
        `**${p.description}** (consistency: ${(p.consistency * 100).toFixed(0)}%) ${seq}`,
      );
    }
  }

  if (analysis.criticalSteps.length > 0) {
    sections.push(`## Critical Divergence Points`);
    for (const s of analysis.criticalSteps) {
      sections.push(
        `Step ${s.stepIndex}: Success uses '${s.successAction}', failure uses '${s.failureAction}' — ${s.description}`,
      );
    }
  }

  // --- Raw trace excerpts (condensed) ---
  sections.push(`## Trace Excerpts`);
  const maxTraces = Math.min(report.runs.length, 4);
  for (let i = 0; i < maxTraces; i++) {
    const run = report.runs[i];
    const status = run.score.passed ? "PASSED" : "FAILED";
    const score = run.score.overall.toFixed(2);

    // Condense trace: show action sequence with key details
    const actionSummary = run.trace.actions.map((a) => {
      const args = Object.entries(a.args)
        .filter(([k]) => k !== "_toolCallId")
        .map(([k, v]) => `${k}=${typeof v === "string" && v.length > 50 ? JSON.stringify(v.slice(0, 50) + "...") : JSON.stringify(v)}`)
        .join(", ");
      const status = a.result.success ? "ok" : `FAIL: ${a.result.error?.slice(0, 60) || "unknown"}`;
      return `  ${a.index + 1}. ${a.action}(${args}) -> ${status}`;
    });

    // Include thoughts if present
    const thoughts = run.trace.thoughts.filter(Boolean).slice(0, 3);
    const thoughtStr = thoughts.length > 0
      ? `\n  Thoughts: ${thoughts.map((t) => `"${t.slice(0, 80)}"`).join("; ")}`
      : "";

    const completionStr = run.trace.completed
      ? `\n  Completion: "${run.trace.completionSummary?.slice(0, 100) || "no summary"}"`
      : "\n  Did NOT call task_complete";

    // Score breakdown
    const scoreDetail = `completion=${run.score.completion.score.toFixed(2)}, efficiency=${run.score.efficiency.score.toFixed(2)}, accuracy=${run.score.accuracy.score.toFixed(2)}`;

    sections.push(
      `### Run ${i + 1} [${status}] (score: ${score}, ${scoreDetail})${thoughtStr}${completionStr}\n${actionSummary.join("\n")}`,
    );
  }

  // --- Existing feedback context ---
  if (existingFeedback) {
    const existingParts: string[] = [];
    if (existingFeedback.model && existingFeedback.model.weaknesses.length > 0) {
      existingParts.push(`Model weaknesses: ${existingFeedback.model.weaknesses.join("; ")}`);
    }
    if (existingFeedback.site) {
      if (existingFeedback.site.pitfalls.length > 0) {
        existingParts.push(`Site pitfalls: ${existingFeedback.site.pitfalls.join("; ")}`);
      }
      if (existingFeedback.site.strategies.length > 0) {
        existingParts.push(`Site strategies: ${existingFeedback.site.strategies.join("; ")}`);
      }
    }
    if (existingFeedback.task.totalText) {
      existingParts.push(`Previous task feedback: ${existingFeedback.task.totalText.slice(0, 300)}`);
    }
    if (existingParts.length > 0) {
      sections.push(`## Existing Feedback (from prior cycles)\n${existingParts.join("\n")}`);
    }
  }

  // --- Output instructions ---
  sections.push(`## Instructions
Based on the analysis and traces above, write feedback for the agent. Follow these rules:

1. **Be specific**: Reference concrete actions, element refs, page states, and error messages from the traces
2. **Be actionable**: Each piece of feedback should tell the agent exactly what to DO differently
3. **Prioritize**: Address the most impactful issues first (highest frequency failures, critical divergence points)
4. **Be concise**: Keep total feedback under 800 characters. The agent has limited prompt space
5. **Don't repeat**: If existing feedback already covers an issue, skip it or refine it — don't duplicate
6. **Use imperative tone**: Write as direct instructions ("Take a snapshot before...", "Do NOT repeat...")

Output ONLY the feedback text. No headers, no markdown formatting, no explanation. Just the raw instructions the agent will receive.`);

  return sections.join("\n\n");
}

/**
 * AI-powered feedback synthesizer.
 * Calls an LLM to interpret analysis results + raw traces and generate
 * nuanced, context-aware feedback. Falls back to static synthesis on failure.
 */
export async function synthesizeFeedbackWithAI(
  task: TaskDefinition,
  analysis: AnalysisResult,
  report: ObservationReport,
  config: Partial<AISynthesisConfig> = {},
  existingFeedback?: LayeredFeedback,
): Promise<PromptPatch> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Build the synthesis prompt
  const synthesisPrompt = buildSynthesisPrompt(
    task,
    analysis,
    report,
    existingFeedback,
  );

  log.info(`AI synthesis: sending ${synthesisPrompt.length} char prompt to ${cfg.model}`);

  try {
    const client = new OpenAI({
      baseURL: cfg.apiUrl,
      apiKey: "lm-studio",
      timeout: 120_000,
    });

    const response = await client.chat.completions.create({
      model: cfg.model,
      messages: [
        { role: "user", content: synthesisPrompt },
      ],
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      stream: false,
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content || content.length < 20) {
      log.warn("AI synthesis returned empty/short response, falling back to static");
      const fallback = synthesizeFeedback(analysis, report);
      fallback.synthesisPrompt = synthesisPrompt;
      return fallback;
    }

    // Trim to budget (task-level max is 800 chars)
    const text = content.length > 800 ? content.slice(0, 797) + "..." : content;

    log.info(`AI synthesis succeeded: ${text.length} chars`);

    return {
      text,
      basedOn: { runs: analysis.totalRuns, passRate: analysis.passRate },
      patternCount: analysis.failurePatterns.length + analysis.successPatterns.length,
      generatedAt: new Date().toISOString(),
      method: "ai",
      synthesisPrompt,
      synthesisModel: cfg.model,
    };
  } catch (err) {
    log.error("AI synthesis failed, falling back to static", {
      error: String(err),
    });

    // Fallback: use the static template-based synthesizer
    const fallback = synthesizeFeedback(analysis, report);
    // Still record the prompt so we can debug what was attempted
    fallback.synthesisPrompt = synthesisPrompt;
    return fallback;
  }
}
