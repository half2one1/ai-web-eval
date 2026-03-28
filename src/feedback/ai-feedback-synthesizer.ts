import OpenAI from "openai";
import type { AnalysisResult } from "../types/pattern.js";
import type { PromptPatch, LayeredFeedback } from "../types/feedback.js";
import type { ObservationReport } from "../types/score.js";
import type { TaskDefinition } from "../types/task.js";
import { synthesizeFeedback } from "./feedback-synthesizer.js";
import { log } from "../utils/logger.js";
import { resolveRef, describeStepContext, describeActionBrief } from "../utils/trace-context.js";

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
  maxTokens: 4096,
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
        // Resolve element refs to human-readable descriptions
        const traceActions = report.runs[e.runIndex]?.trace.actions;
        let actionDesc: string;
        if (traceActions && e.actionIndex < traceActions.length) {
          actionDesc = describeActionBrief(traceActions[e.actionIndex], traceActions);
          const ctx = describeStepContext(e.actionIndex, traceActions);
          return `  - Run ${e.runIndex + 1}, ${ctx}: ${actionDesc}${e.error ? ` -> ERROR: ${e.error}` : ""}`;
        }
        const argsStr = Object.entries(e.args)
          .filter(([k]) => k !== "_toolCallId")
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(", ");
        return `  - Run ${e.runIndex + 1}, step ${e.actionIndex}: ${e.action}(${argsStr})${e.error ? ` -> ERROR: ${e.error}` : ""}`;
      });
      sections.push(
        `**${p.description}** (frequency: ${(p.frequency * 100).toFixed(0)}%)\n${examples.join("\n")}`,
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
      // s.description already contains contextual language from pattern-analyzer
      sections.push(
        `${s.description} — success uses '${s.successAction}', failure uses '${s.failureAction}'`,
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

    // Condense trace: show action sequence with resolved element descriptions
    const traceActions = run.trace.actions;
    const actionSummary = traceActions.map((a) => {
      const brief = describeActionBrief(a, traceActions);
      const status = a.result.success ? "ok" : `FAIL: ${a.result.error || "unknown"}`;
      return `  ${a.index + 1}. ${brief} -> ${status}`;
    });

    // Include thoughts if present
    const thoughts = run.trace.thoughts.filter(Boolean).slice(0, 3);
    const thoughtStr = thoughts.length > 0
      ? `\n  Thoughts: ${thoughts.map((t) => `"${t}"`).join("; ")}`
      : "";

    const completionStr = run.trace.completed
      ? `\n  Completion: "${run.trace.completionSummary || "no summary"}"`
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
      existingParts.push(`Previous task feedback: ${existingFeedback.task.totalText}`);
    }
    if (existingParts.length > 0) {
      sections.push(`## Existing Feedback (from prior cycles)\n${existingParts.join("\n")}`);
    }
  }

  // --- Output instructions ---
  sections.push(`## Instructions
Based on the analysis and traces above, write feedback for the agent. Follow these rules:

1. **Be specific**: Reference concrete actions, element descriptions, page states, and error messages from the traces. Use element names (e.g. 'the "Search" button') not abstract refs.
2. **Be actionable**: Each piece of feedback should tell the agent exactly what to DO differently
3. **Prioritize**: Address the most impactful issues first (highest frequency failures, critical divergence points)
4. **Be thorough**: Provide complete, detailed feedback. Cover all identified issues with full explanations and instructions
5. **Don't repeat**: If existing feedback already covers an issue, skip it or refine it — don't duplicate
6. **Use imperative tone**: Write as direct instructions ("Take a snapshot before...", "Do NOT repeat...")

Output ONLY the feedback text. No headers, no markdown formatting, no explanation. Just the raw instructions the agent will receive.`);

  return sections.join("\n\n");
}

/**
 * Validate and sanitize AI-generated feedback.
 * Detects when the LLM echoes back trace data or think tags instead of
 * producing actual feedback, and strips/rejects such responses.
 */
function sanitizeFeedback(raw: string): string | null {
  let text = raw;

  // Strip any <think>...</think> blocks (model reasoning leaked into output)
  text = text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();

  // Strip orphaned </think> tags
  text = text.replace(/<\/?think>\s*/g, "").trim();

  // Detect if the response is mostly raw trace data (echoed input)
  const tracePatterns = [
    /^\s*\d+\.\s+(open|click|fill|snapshot|scroll|type|press|select|get|wait|screenshot|done)\(.*?\)\s*->\s*(ok|FAIL)/m,
    /Did NOT call task_complete/,
    /### Run \d+ \[(PASSED|FAILED)\]/,
    /completion=\d+\.\d+, efficiency=\d+\.\d+, accuracy=\d+\.\d+/,
  ];

  const traceLineCount = text.split("\n").filter((line) =>
    tracePatterns.some((p) => p.test(line)),
  ).length;
  const totalLines = text.split("\n").filter((l) => l.trim().length > 0).length;

  // If more than 30% of non-empty lines look like trace data, it's echoed input
  if (totalLines > 0 && traceLineCount / totalLines > 0.3) {
    log.warn(
      `AI synthesis response appears to be echoed trace data (${traceLineCount}/${totalLines} trace-like lines), rejecting`,
    );
    return null;
  }

  // If the response is too short after cleanup, reject
  if (text.length < 20) {
    return null;
  }

  return text;
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
        {
          role: "system",
          content:
            "You are a web agent evaluator. Given analysis of a browsing agent's failed attempts, write concise, actionable feedback as direct instructions. Output ONLY the feedback text — no trace data, no markdown headers, no thinking, no explanation. Never echo back the input traces or action sequences.",
        },
        { role: "user", content: synthesisPrompt },
      ],
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      stream: false,
    });

    const rawContent = response.choices[0]?.message?.content?.trim();

    if (!rawContent || rawContent.length < 20) {
      log.warn("AI synthesis returned empty/short response, falling back to static");
      const fallback = synthesizeFeedback(analysis, report);
      fallback.synthesisPrompt = synthesisPrompt;
      return fallback;
    }

    // Validate and sanitize the response
    const text = sanitizeFeedback(rawContent);

    if (!text) {
      log.warn("AI synthesis response failed validation (echoed traces or garbage), falling back to static");
      const fallback = synthesizeFeedback(analysis, report);
      fallback.synthesisPrompt = synthesisPrompt;
      return fallback;
    }

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
