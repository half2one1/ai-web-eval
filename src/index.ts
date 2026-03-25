#!/usr/bin/env node

import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { loadTask, loadTaskDir } from "./tasks/task-loader.js";
import { observe } from "./runner/observation-runner.js";
import { analyzePatterns } from "./analysis/pattern-analyzer.js";
import { synthesizeFeedback } from "./feedback/feedback-synthesizer.js";
import { runEvalCycle } from "./runner/eval-cycle.js";
import { writeReport } from "./runner/reporter.js";
import { log, setLogLevel } from "./utils/logger.js";

function printUsage(): void {
  console.log(`
ai-web-eval — AI Web Agent Evaluator

Usage:
  ai-web-eval observe <task-file>              Run observation phase for a single task
  ai-web-eval observe --task-dir <dir>         Observe all tasks in directory
  ai-web-eval cycle --task-dir <dir>           Full observe → improve loop
  ai-web-eval cycle <task-file>                Full cycle for a single task

Options:
  --model <name>            LM Studio model name (default: "default")
  --api-url <url>           LM Studio API endpoint (default: http://localhost:1234/v1)
  --runs <n>                Override observation runs per task (min 3)
  --max-cycles <n>          Max improvement cycles (default: 3)
  --target-pass-rate <f>    Stop when pass rate >= this (default: 0.9)
  --headed                  Show browser window (not implemented yet)
  --verbose                 Debug logging
  --output-dir <dir>        Results directory (default: ./results)
  --help                    Show this help
`);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      model: { type: "string", default: "default" },
      "api-url": { type: "string", default: "http://localhost:1234/v1" },
      runs: { type: "string" },
      "max-cycles": { type: "string", default: "3" },
      "target-pass-rate": { type: "string", default: "0.9" },
      headed: { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
      "output-dir": { type: "string", default: "./results" },
      "task-dir": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help || positionals.length === 0) {
    printUsage();
    process.exit(0);
  }

  if (values.verbose) {
    setLogLevel("debug");
  }

  const command = positionals[0];
  const taskFileArg = positionals[1];

  const harnessConfig = {
    apiUrl: values["api-url"]!,
    model: values.model!,
    temperature: 0.2,
  };

  const outputDir = resolve(values["output-dir"]!);
  const overrideRuns = values.runs ? parseInt(values.runs, 10) : undefined;

  // Load tasks
  let tasks;
  if (values["task-dir"]) {
    tasks = loadTaskDir(resolve(values["task-dir"]));
  } else if (taskFileArg) {
    tasks = [loadTask(resolve(taskFileArg))];
  } else {
    console.error("Error: Provide a task file or --task-dir");
    process.exit(1);
  }

  log.info(`Loaded ${tasks.length} task(s)`);

  if (command === "observe") {
    // Single observation phase — no feedback loop
    for (const task of tasks) {
      log.info(`\nObserving: ${task.name} (${task.id})`);
      const report = await observe(task, undefined, {
        harness: harnessConfig,
        overrideRuns,
      });
      const analysis = analyzePatterns(report);
      await writeReport(outputDir, 0, task.id, report, analysis);

      // Print summary
      const passRate = (analysis.passRate * 100).toFixed(0);
      console.log(`\n=== ${task.name} ===`);
      console.log(`Pass rate: ${passRate}% (${report.runs.filter((r) => r.score.passed).length}/${report.runs.length})`);
      console.log(`Failure patterns: ${analysis.failurePatterns.length}`);
      console.log(`Success patterns: ${analysis.successPatterns.length}`);

      if (analysis.failurePatterns.length > 0) {
        console.log("\nTop failure patterns:");
        for (const p of analysis.failurePatterns.slice(0, 3)) {
          console.log(`  - ${p.description} (${(p.frequency * 100).toFixed(0)}%)`);
        }
      }

      // Also show what feedback would be generated
      const feedback = synthesizeFeedback(analysis);
      if (feedback.patternCount > 0) {
        console.log("\nGenerated feedback:");
        console.log(feedback.text);
      }
    }
  } else if (command === "cycle") {
    const maxCycles = parseInt(values["max-cycles"]!, 10);
    const targetPassRate = parseFloat(values["target-pass-rate"]!);

    log.info(
      `Starting eval cycle: ${tasks.length} tasks, max ${maxCycles} cycles, target ${(targetPassRate * 100).toFixed(0)}%`,
    );

    const results = await runEvalCycle(tasks, {
      maxCycles,
      targetPassRate,
      harness: harnessConfig,
      overrideRuns,
      outputDir,
    });

    // Print final summary
    console.log("\n=== EVALUATION COMPLETE ===");
    console.log(`Cycles completed: ${results.length}`);
    for (const cycle of results) {
      console.log(`\nCycle ${cycle.cycle}:`);
      for (const t of cycle.tasks) {
        const pr = (t.analysis.passRate * 100).toFixed(0);
        console.log(`  ${t.task.name}: ${pr}% pass rate`);
      }
    }
  } else {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
