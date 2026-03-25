import type { TaskDefinition } from "../types/task.js";
import type { ObservationReport, RunResult } from "../types/score.js";
import type { HarnessConfig } from "../harness/agent-harness.js";
import { runAgent } from "../harness/agent-harness.js";
import {
  generateSessionId,
  createSession,
  destroySession,
} from "../harness/session-manager.js";
import { verify } from "../verifier/verifier.js";
import { annotateTrace } from "../verifier/trace-annotator.js";
import { computeScore } from "../scoring/scorer.js";
import { log } from "../utils/logger.js";

export interface ObservationConfig {
  harness: Partial<HarnessConfig>;
  overrideRuns?: number;
  takeScreenshots?: boolean;
}

export async function observe(
  task: TaskDefinition,
  feedback: string | undefined,
  config: ObservationConfig,
): Promise<ObservationReport> {
  const runs: RunResult[] = [];
  const totalRuns = config.overrideRuns || task.observationRuns || 3;

  log.info(`Starting observation: task=${task.id}, runs=${totalRuns}`);

  for (let i = 0; i < totalRuns; i++) {
    log.info(`--- Run ${i + 1}/${totalRuns} ---`);

    const sessionId = generateSessionId(`obs-${task.id}`);
    const sessionCreated = await createSession(sessionId);
    if (!sessionCreated) {
      log.error(`Failed to create session for run ${i + 1}, skipping`);
      continue;
    }

    try {
      // Run the agent
      const trace = await runAgent(task, sessionId, feedback, config.harness);

      // Verify final state
      const verification = await verify(task, sessionId);

      // Annotate trace
      const annotations = annotateTrace(trace);

      // Score
      const score = computeScore(
        task.id,
        sessionId,
        i,
        trace,
        verification,
        annotations,
        task.expectedOutcome.optimalSteps,
      );

      runs.push({ runIndex: i, sessionId, trace, score });

      log.info(`Run ${i + 1} result: passed=${score.passed}, overall=${score.overall.toFixed(2)}`);
    } catch (err) {
      log.error(`Run ${i + 1} failed with error`, { error: String(err) });
    } finally {
      await destroySession(sessionId);
    }
  }

  return {
    taskId: task.id,
    timestamp: new Date().toISOString(),
    runs,
  };
}
