import { readFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { parse as parseYaml } from "yaml";
import type { TaskDefinition } from "../types/task.js";

const DEFAULTS: Partial<TaskDefinition> = {
  maxSteps: 20,
  timeoutMs: 120_000,
  observationRuns: 3,
  mode: "auto",
};

export function loadTask(filePath: string): TaskDefinition {
  const raw = readFileSync(filePath, "utf-8");
  const data = filePath.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);

  const task: TaskDefinition = { ...DEFAULTS, ...data };

  // Validate required fields
  if (!task.id) throw new Error(`Task missing 'id': ${filePath}`);
  if (!task.name) throw new Error(`Task missing 'name': ${filePath}`);
  if (!task.url) throw new Error(`Task missing 'url': ${filePath}`);
  if (!task.goal) throw new Error(`Task missing 'goal': ${filePath}`);
  if (!task.category) throw new Error(`Task missing 'category': ${filePath}`);
  if (!task.expectedOutcome)
    throw new Error(`Task missing 'expectedOutcome': ${filePath}`);

  return task;
}

export function loadTaskDir(dirPath: string): TaskDefinition[] {
  const files = readdirSync(dirPath).filter(
    (f) => extname(f) === ".yaml" || extname(f) === ".yml" || extname(f) === ".json",
  );

  return files.map((f) => loadTask(join(dirPath, f)));
}
