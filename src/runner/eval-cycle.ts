import type { TaskDefinition } from "../types/task.js";
import type { HarnessConfig } from "../harness/agent-harness.js";
import type { AccumulatedFeedback } from "../types/feedback.js";
import type { AnalysisResult } from "../types/pattern.js";
import type { ObservationReport } from "../types/score.js";
import { observe, type ObservationConfig } from "./observation-runner.js";
import { analyzePatterns } from "../analysis/pattern-analyzer.js";
import { synthesizeFeedback } from "../feedback/feedback-synthesizer.js";
import {
  injectFeedback,
  getFeedbackText,
  createEmptyFeedback,
} from "../feedback/prompt-injector.js";
import { writeReport, writeSummaryReport } from "./reporter.js";
import { log } from "../utils/logger.js";

export interface CycleConfig {
  maxCycles: number;
  targetPassRate: number;
  harness: Partial<HarnessConfig>;
  overrideRuns?: number;
  outputDir: string;
}

export interface CycleResult {
  cycle: number;
  tasks: Array<{
    task: TaskDefinition;
    observation: ObservationReport;
    analysis: AnalysisResult;
    feedback: AccumulatedFeedback;
  }>;
}

export async function runEvalCycle(
  tasks: TaskDefinition[],
  config: CycleConfig,
): Promise<CycleResult[]> {
  const allCycles: CycleResult[] = [];
  const feedbackMap = new Map<string, AccumulatedFeedback>();

  for (let cycle = 1; cycle <= config.maxCycles; cycle++) {
    log.info(`\n========== CYCLE ${cycle}/${config.maxCycles} ==========`);

    const cycleResult: CycleResult = { cycle, tasks: [] };

    for (const task of tasks) {
      log.info(`\n--- Task: ${task.name} (${task.id}) ---`);

      // Get current feedback for this task
      const currentFeedback = feedbackMap.get(task.id) || createEmptyFeedback();
      const feedbackText = getFeedbackText(currentFeedback);

      if (feedbackText) {
        log.info("Injecting feedback from previous cycle:");
        log.debug(feedbackText);
      }

      // OBSERVATION PHASE
      const obsConfig: ObservationConfig = {
        harness: config.harness,
        overrideRuns: config.overrideRuns,
      };
      const observation = await observe(task, feedbackText, obsConfig);

      // ANALYSIS PHASE
      const analysis = analyzePatterns(observation);
      log.info(
        `Analysis: passRate=${(analysis.passRate * 100).toFixed(0)}%, ` +
          `failures=${analysis.failurePatterns.length}, ` +
          `successes=${analysis.successPatterns.length}`,
      );

      // IMPROVEMENT PHASE
      let updatedFeedback = currentFeedback;
      if (analysis.passRate < 1.0) {
        const patch = synthesizeFeedback(analysis);
        updatedFeedback = injectFeedback(currentFeedback, patch);
        feedbackMap.set(task.id, updatedFeedback);
        log.info(`Generated feedback patch (${patch.patternCount} patterns)`);
      }

      cycleResult.tasks.push({
        task,
        observation,
        analysis,
        feedback: updatedFeedback,
      });

      // Write per-task report
      await writeReport(config.outputDir, cycle, task.id, observation, analysis);
    }

    allCycles.push(cycleResult);

    // Check early stop
    const allConverged = cycleResult.tasks.every(
      (t) => t.analysis.passRate >= config.targetPassRate,
    );
    if (allConverged) {
      log.info(`\nAll tasks converged at pass rate >= ${config.targetPassRate}. Stopping.`);
      break;
    }
  }

  // Write summary report
  await writeSummaryReport(config.outputDir, allCycles);
  return allCycles;
}
