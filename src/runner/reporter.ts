import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ObservationReport } from "../types/score.js";
import type { AnalysisResult } from "../types/pattern.js";
import type { PromptPatch } from "../types/feedback.js";
import type { CycleResult } from "./eval-cycle.js";
import { log } from "../utils/logger.js";

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export async function writeReport(
  outputDir: string,
  cycle: number,
  taskId: string,
  observation: ObservationReport,
  analysis: AnalysisResult,
): Promise<void> {
  const dir = join(outputDir, `cycle-${cycle}`);
  ensureDir(dir);

  // Write JSON data
  const jsonPath = join(dir, `${taskId}.json`);
  writeFileSync(
    jsonPath,
    JSON.stringify({ observation, analysis }, null, 2),
  );

  // Write Markdown summary
  const mdPath = join(dir, `${taskId}.md`);
  const md = generateMarkdown(cycle, taskId, observation, analysis);
  writeFileSync(mdPath, md);

  log.info(`Report written: ${dir}/${taskId}.*`);
}

/**
 * Write the synthesis prompt and generated feedback for later review.
 * Creates a {taskId}.synthesis.md file in the cycle directory.
 */
export async function writeSynthesisLog(
  outputDir: string,
  cycle: number,
  taskId: string,
  patch: PromptPatch,
): Promise<void> {
  const dir = join(outputDir, `cycle-${cycle}`);
  ensureDir(dir);

  const lines: string[] = [];
  lines.push(`# Feedback Synthesis Log — ${taskId}`);
  lines.push(`\nGenerated: ${patch.generatedAt}`);
  lines.push(`Method: **${patch.method}**`);
  if (patch.synthesisModel) {
    lines.push(`Model: ${patch.synthesisModel}`);
  }
  lines.push(`Pass rate: ${(patch.basedOn.passRate * 100).toFixed(0)}% (${patch.basedOn.runs} runs)`);
  lines.push(`Pattern count: ${patch.patternCount}`);

  if (patch.synthesisPrompt) {
    lines.push(`\n## Synthesis Prompt\n`);
    lines.push("```");
    lines.push(patch.synthesisPrompt);
    lines.push("```");
  }

  lines.push(`\n## Generated Feedback\n`);
  lines.push("```");
  lines.push(patch.text);
  lines.push("```");

  const mdPath = join(dir, `${taskId}.synthesis.md`);
  writeFileSync(mdPath, lines.join("\n"));

  // Also write structured JSON for programmatic access
  const jsonPath = join(dir, `${taskId}.synthesis.json`);
  writeFileSync(jsonPath, JSON.stringify({
    taskId,
    cycle,
    method: patch.method,
    model: patch.synthesisModel || null,
    passRate: patch.basedOn.passRate,
    runs: patch.basedOn.runs,
    patternCount: patch.patternCount,
    generatedAt: patch.generatedAt,
    synthesisPrompt: patch.synthesisPrompt || null,
    generatedFeedback: patch.text,
  }, null, 2));

  log.info(`Synthesis log written: ${dir}/${taskId}.synthesis.*`);
}

function generateMarkdown(
  cycle: number,
  taskId: string,
  observation: ObservationReport,
  analysis: AnalysisResult,
): string {
  const lines: string[] = [];

  lines.push(`# Cycle ${cycle} — ${taskId}`);
  lines.push(`\nGenerated: ${new Date().toISOString()}\n`);

  // Summary
  lines.push(`## Summary`);
  lines.push(`- **Total runs**: ${analysis.totalRuns}`);
  lines.push(`- **Pass rate**: ${(analysis.passRate * 100).toFixed(0)}%`);
  lines.push(`- **Failure patterns**: ${analysis.failurePatterns.length}`);
  lines.push(`- **Success patterns**: ${analysis.successPatterns.length}`);
  lines.push(`- **Critical steps**: ${analysis.criticalSteps.length}`);

  // Per-run scores
  lines.push(`\n## Run Scores`);
  lines.push(`| Run | Passed | Overall | Completion | Efficiency | Accuracy | Steps |`);
  lines.push(`|-----|--------|---------|------------|------------|----------|-------|`);
  for (const run of observation.runs) {
    const s = run.score;
    lines.push(
      `| ${run.runIndex + 1} | ${s.passed ? "YES" : "NO"} | ${s.overall.toFixed(2)} | ${s.completion.score.toFixed(2)} | ${s.efficiency.score.toFixed(2)} | ${s.accuracy.score.toFixed(2)} | ${s.efficiency.actualSteps} |`,
    );
  }

  // Failure patterns
  if (analysis.failurePatterns.length > 0) {
    lines.push(`\n## Failure Patterns`);
    for (const p of analysis.failurePatterns) {
      lines.push(`- **${p.description}** (frequency: ${(p.frequency * 100).toFixed(0)}%, steps: ${p.atSteps.join(",")})`);
    }
  }

  // Success patterns
  if (analysis.successPatterns.length > 0) {
    lines.push(`\n## Success Patterns`);
    for (const p of analysis.successPatterns) {
      lines.push(`- **${p.description}** (consistency: ${(p.consistency * 100).toFixed(0)}%)`);
    }
  }

  // Critical steps
  if (analysis.criticalSteps.length > 0) {
    lines.push(`\n## Critical Steps`);
    for (const s of analysis.criticalSteps) {
      lines.push(`- Step ${s.stepIndex}: ${s.description}`);
    }
  }

  // Generalized reasons
  if (analysis.generalizedReasons.failures.length > 0) {
    lines.push(`\n## Generalized Failure Reasons`);
    for (const r of analysis.generalizedReasons.failures) {
      lines.push(`- ${r}`);
    }
  }

  if (analysis.generalizedReasons.successes.length > 0) {
    lines.push(`\n## Generalized Success Reasons`);
    for (const r of analysis.generalizedReasons.successes) {
      lines.push(`- ${r}`);
    }
  }

  return lines.join("\n");
}

export async function writeSummaryReport(
  outputDir: string,
  cycles: CycleResult[],
): Promise<void> {
  ensureDir(outputDir);

  const lines: string[] = [];
  lines.push(`# Evaluation Summary`);
  lines.push(`\nGenerated: ${new Date().toISOString()}`);
  lines.push(`\nTotal cycles: ${cycles.length}\n`);

  // Per-cycle summary
  lines.push(`## Cycle Progress`);
  lines.push(`| Cycle | Tasks | Avg Pass Rate | Avg Score |`);
  lines.push(`|-------|-------|---------------|-----------|`);

  for (const cycle of cycles) {
    const passRates = cycle.tasks.map((t) => t.analysis.passRate);
    const avgPassRate = passRates.reduce((a, b) => a + b, 0) / passRates.length;
    const scores = cycle.tasks.flatMap((t) =>
      t.observation.runs.map((r) => r.score.overall),
    );
    const avgScore =
      scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0;

    lines.push(
      `| ${cycle.cycle} | ${cycle.tasks.length} | ${(avgPassRate * 100).toFixed(0)}% | ${avgScore.toFixed(2)} |`,
    );
  }

  // Per-task progression
  lines.push(`\n## Task Progression`);
  const taskIds = [...new Set(cycles.flatMap((c) => c.tasks.map((t) => t.task.id)))];
  for (const taskId of taskIds) {
    lines.push(`\n### ${taskId}`);
    for (const cycle of cycles) {
      const taskResult = cycle.tasks.find((t) => t.task.id === taskId);
      if (taskResult) {
        const pr = (taskResult.analysis.passRate * 100).toFixed(0);
        const fb = taskResult.feedback.totalText
          ? `\n  Feedback:\n${taskResult.feedback.totalText}`
          : "";
        lines.push(`- Cycle ${cycle.cycle}: pass rate ${pr}%${fb}`);
      }
    }
  }

  const summaryPath = join(outputDir, "summary.md");
  writeFileSync(summaryPath, lines.join("\n"));

  // Also write JSON
  const jsonPath = join(outputDir, "summary.json");
  const jsonData = cycles.map((c) => ({
    cycle: c.cycle,
    tasks: c.tasks.map((t) => ({
      taskId: t.task.id,
      passRate: t.analysis.passRate,
      failurePatterns: t.analysis.failurePatterns.length,
      successPatterns: t.analysis.successPatterns.length,
      feedbackLength: t.feedback.totalText.length,
    })),
  }));
  writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));

  log.info(`Summary report written: ${summaryPath}`);
}
