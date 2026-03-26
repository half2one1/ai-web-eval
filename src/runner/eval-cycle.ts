import type { TaskDefinition } from "../types/task.js";
import type { HarnessConfig } from "../harness/agent-harness.js";
import type {
  AccumulatedFeedback,
  SiteProfile,
  ModelProfile,
  LayeredFeedback,
} from "../types/feedback.js";
import type { AnalysisResult } from "../types/pattern.js";
import type { ObservationReport } from "../types/score.js";
import { observe, type ObservationConfig } from "./observation-runner.js";
import { analyzePatterns } from "../analysis/pattern-analyzer.js";
import { synthesizeFeedback } from "../feedback/feedback-synthesizer.js";
import {
  injectFeedback,
  createEmptyFeedback,
  buildLayeredFeedbackText,
} from "../feedback/prompt-injector.js";
import {
  extractDomain,
  buildSiteProfile,
} from "../feedback/site-profile-extractor.js";
import { buildModelProfile } from "../feedback/model-profile-extractor.js";
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

  // Per-task accumulated feedback
  const taskFeedbackMap = new Map<string, AccumulatedFeedback>();

  // Site profiles: domain → SiteProfile
  const siteProfileMap = new Map<string, SiteProfile>();

  // Model profile (cross-domain)
  let modelProfile: ModelProfile | null = null;

  for (let cycle = 1; cycle <= config.maxCycles; cycle++) {
    log.info(`\n========== CYCLE ${cycle}/${config.maxCycles} ==========`);

    const cycleResult: CycleResult = { cycle, tasks: [] };

    // Collect all observations this cycle for cross-task analysis
    const cycleObservations: Array<{
      task: TaskDefinition;
      domain: string;
      observation: ObservationReport;
      analysis: AnalysisResult;
    }> = [];

    for (const task of tasks) {
      log.info(`\n--- Task: ${task.name} (${task.id}) ---`);

      const domain = extractDomain(task.url);
      const currentTaskFeedback = taskFeedbackMap.get(task.id) || createEmptyFeedback();

      // Build layered feedback for this task
      const layered: LayeredFeedback = {
        model: modelProfile,
        site: siteProfileMap.get(domain) || null,
        task: currentTaskFeedback,
      };

      const feedbackText = buildLayeredFeedbackText(layered);

      if (feedbackText) {
        log.info("Injecting layered feedback:");
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

      // TASK-LEVEL IMPROVEMENT
      let updatedTaskFeedback = currentTaskFeedback;
      if (analysis.passRate < 1.0) {
        const patch = synthesizeFeedback(analysis, observation);
        updatedTaskFeedback = injectFeedback(currentTaskFeedback, patch);
        taskFeedbackMap.set(task.id, updatedTaskFeedback);
        log.info(`Generated task feedback patch (${patch.patternCount} patterns)`);
      }

      cycleObservations.push({ task, domain, observation, analysis });

      cycleResult.tasks.push({
        task,
        observation,
        analysis,
        feedback: updatedTaskFeedback,
      });

      // Write per-task report
      await writeReport(config.outputDir, cycle, task.id, observation, analysis);
    }

    // CROSS-TASK ANALYSIS: Update site profiles and model profile
    // Group observations by domain
    const byDomain = new Map<string, typeof cycleObservations>();
    for (const obs of cycleObservations) {
      const list = byDomain.get(obs.domain) || [];
      list.push(obs);
      byDomain.set(obs.domain, list);
    }

    // Update site profiles
    for (const [domain, domainObs] of byDomain) {
      const existingProfile = siteProfileMap.get(domain);
      const siteObs = domainObs.map((o) => ({
        taskId: o.task.id,
        domain,
        report: o.observation,
        analysis: o.analysis,
      }));
      const profile = buildSiteProfile(domain, siteObs, existingProfile);
      siteProfileMap.set(domain, profile);
      log.info(`Updated site profile: ${domain} (${profile.structure.length} structure, ${profile.pitfalls.length} pitfalls, ${profile.strategies.length} strategies)`);
    }

    // Update model profile (cross-domain)
    const allDomainObs = cycleObservations.map((o) => ({
      domain: o.domain,
      taskId: o.task.id,
      analysis: o.analysis,
      report: o.observation,
    }));
    modelProfile = buildModelProfile(allDomainObs, modelProfile || undefined);
    if (modelProfile.weaknesses.length > 0) {
      log.info(`Model profile: ${modelProfile.weaknesses.length} cross-domain weaknesses detected`);
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
