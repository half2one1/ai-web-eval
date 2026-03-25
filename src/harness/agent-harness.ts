import OpenAI from "openai";
import type { ChatCompletion, ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import type { AgentMode, TaskDefinition } from "../types/task.js";
import type { ActionTrace } from "../types/trace.js";
import { createActionTrace } from "../types/trace.js";
import type { AgentAdapter } from "./adapter.js";
import { FunctionCallingAdapter } from "./function-calling-adapter.js";
import { ReactAdapter } from "./react-adapter.js";
import { ToolExecutor } from "./tool-executor.js";
import { SIGNIFICANT_ACTIONS, REACT_TO_TOOL } from "./browser-tools.js";
import { buildSystemPrompt, buildTaskPrompt } from "./prompt-builder.js";
import { log } from "../utils/logger.js";

export interface HarnessConfig {
  apiUrl: string;
  model: string;
  temperature: number;
}

const DEFAULT_CONFIG: HarnessConfig = {
  apiUrl: "http://localhost:1234/v1",
  model: "default",
  temperature: 0.2,
};

function createAdapter(mode: AgentMode): AgentAdapter {
  if (mode === "function-calling") return new FunctionCallingAdapter();
  if (mode === "react") return new ReactAdapter();
  // "auto" starts with function-calling, may fall back
  return new FunctionCallingAdapter();
}

function isSignificantAction(actionName: string): boolean {
  const toolName = REACT_TO_TOOL[actionName] || actionName;
  return SIGNIFICANT_ACTIONS.has(toolName);
}

export async function runAgent(
  task: TaskDefinition,
  sessionId: string,
  feedback: string | undefined,
  config: Partial<HarnessConfig> = {},
): Promise<ActionTrace> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const client = new OpenAI({ baseURL: cfg.apiUrl, apiKey: "lm-studio" });

  const resolvedMode: AgentMode = task.mode || "auto";
  let adapter = createAdapter(resolvedMode);
  let autoDetecting = resolvedMode === "auto";

  const systemPrompt = buildSystemPrompt(
    task,
    adapter.mode,
    feedback,
  );
  const taskPrompt = buildTaskPrompt(task);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: taskPrompt },
  ];

  const trace = createActionTrace(task.id, sessionId);
  trace.modelMessages.push(
    { role: "system", content: systemPrompt, timestamp: new Date().toISOString() },
    { role: "user", content: taskPrompt, timestamp: new Date().toISOString() },
  );

  const executor = new ToolExecutor();
  let steps = 0;
  let retries = 0;
  const maxRetries = 2;
  const startTime = Date.now();

  log.info(`Agent started: task=${task.id}, mode=${adapter.mode}, session=${sessionId}`);

  while (steps < task.maxSteps && Date.now() - startTime < task.timeoutMs) {
    // Call the model
    let response: ChatCompletion;
    try {
      response = await client.chat.completions.create({
        model: cfg.model,
        messages,
        temperature: cfg.temperature,
        stream: false,
        ...adapter.getRequestParams(),
      }) as ChatCompletion;
    } catch (err) {
      log.error("API call failed", { error: String(err) });
      break;
    }

    // Record raw model output
    const rawContent = response.choices[0]?.message?.content || "";
    trace.modelMessages.push({
      role: "assistant",
      content: rawContent,
      timestamp: new Date().toISOString(),
    });

    // Parse response through adapter
    const parsed = adapter.parseResponse(response);

    // Auto-detect: if we started with function-calling but got no tool_calls, switch to ReAct
    if (autoDetecting && parsed && parsed.actions.length === 0 && !parsed.done && rawContent) {
      log.info("Auto-detect: switching to ReAct mode");
      adapter = new ReactAdapter();
      autoDetecting = false;
      // Re-parse with ReAct adapter
      const reparsed = adapter.parseResponse(response);
      if (reparsed) {
        messages.push(...adapter.toAssistantMessages(response));
        if (reparsed.thought) trace.thoughts.push(reparsed.thought);
        if (reparsed.done) {
          trace.completed = true;
          trace.completionSummary = reparsed.summary;
          break;
        }
        // Process actions from re-parse
        for (const action of reparsed.actions) {
          steps++;
          const actionStart = Date.now();
          const result = await executor.execute(action.name, action.args, sessionId);
          const durationMs = Date.now() - actionStart;

          trace.actions.push({
            index: trace.actions.length,
            timestamp: new Date().toISOString(),
            thought: reparsed.thought,
            action: action.name,
            args: action.args,
            rawOutput: rawContent,
            result: { success: result.success, output: result.output, error: result.error },
            durationMs,
          });

          messages.push(...adapter.toResultMessages(action, result));
          trace.modelMessages.push({
            role: "user",
            content: result.success ? result.output : `Error: ${result.error}`,
            timestamp: new Date().toISOString(),
          });
        }

        if (reparsed.actions.some((a) => isSignificantAction(a.name))) {
          const snapshot = await executor.execute("snapshot", { interactive_only: true }, sessionId);
          if (snapshot.success) {
            messages.push(...adapter.toContextMessages(snapshot));
            trace.actions[trace.actions.length - 1].snapshotAfter = snapshot.output;
          }
        }
        continue;
      }
    }

    if (!parsed) {
      retries++;
      if (retries > maxRetries) {
        log.warn("Max retries exceeded for unparseable output");
        break;
      }
      messages.push(adapter.correctionMessage());
      continue;
    }

    retries = 0;
    autoDetecting = false;
    messages.push(...adapter.toAssistantMessages(response));

    if (parsed.thought) {
      trace.thoughts.push(parsed.thought);
    }

    if (parsed.done) {
      trace.completed = true;
      trace.completionSummary = parsed.summary;
      log.info(`Agent completed: ${parsed.summary}`);
      break;
    }

    if (parsed.actions.length === 0) {
      // Model produced thought but no action — send correction
      messages.push(adapter.correctionMessage());
      continue;
    }

    // Execute actions
    for (const action of parsed.actions) {
      steps++;
      const actionStart = Date.now();
      const result = await executor.execute(action.name, action.args, sessionId);
      const durationMs = Date.now() - actionStart;

      trace.actions.push({
        index: trace.actions.length,
        timestamp: new Date().toISOString(),
        thought: parsed.thought,
        action: action.name,
        args: action.args,
        rawOutput: rawContent,
        result: { success: result.success, output: result.output, error: result.error },
        durationMs,
      });

      messages.push(...adapter.toResultMessages(action, result));
      trace.modelMessages.push({
        role: "user",
        content: result.success ? result.output : `Error: ${result.error}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Auto-snapshot after significant actions
    if (parsed.actions.some((a) => isSignificantAction(a.name))) {
      const snapshot = await executor.execute("snapshot", { interactive_only: true }, sessionId);
      if (snapshot.success) {
        messages.push(...adapter.toContextMessages(snapshot));
        if (trace.actions.length > 0) {
          trace.actions[trace.actions.length - 1].snapshotAfter = snapshot.output;
        }
      }
    }
  }

  trace.completedAt = new Date().toISOString();
  if (!trace.completed && steps >= task.maxSteps) {
    log.warn(`Agent ran out of steps: ${steps}/${task.maxSteps}`);
  }

  log.info(`Agent finished: ${trace.actions.length} actions, completed=${trace.completed}`);
  return trace;
}
