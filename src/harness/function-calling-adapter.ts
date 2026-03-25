import type {
  ChatCompletionMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletion,
} from "openai/resources/chat/completions.js";
import type {
  AgentAdapter,
  ParsedResponse,
  ParsedAction,
  ActionResult,
} from "./adapter.js";
import { BROWSER_TOOLS, TOOL_TO_REACT } from "./browser-tools.js";

export class FunctionCallingAdapter implements AgentAdapter {
  readonly mode = "function-calling" as const;

  getRequestParams(): Partial<ChatCompletionCreateParamsNonStreaming> {
    return { tools: BROWSER_TOOLS };
  }

  parseResponse(response: ChatCompletion): ParsedResponse | null {
    const choice = response.choices[0];
    if (!choice) return null;

    const message = choice.message;
    const thought = message.content || null;
    const toolCalls = message.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      // Text-only response — might be thinking or done
      if (thought) {
        return { thought, actions: [], done: false, summary: null };
      }
      return null;
    }

    const actions: ParsedAction[] = [];
    let done = false;
    let summary: string | null = null;

    for (const tc of toolCalls) {
      const name = tc.function.name;
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }

      if (name === "task_complete") {
        done = true;
        summary = (args.summary as string) || "Task completed";
      } else {
        // Normalize to canonical action name
        const canonicalName = TOOL_TO_REACT[name] || name;
        actions.push({ name: canonicalName, args: { ...args, _toolCallId: tc.id } });
      }
    }

    return { thought, actions, done, summary };
  }

  toAssistantMessages(response: ChatCompletion): ChatCompletionMessageParam[] {
    const message = response.choices[0]?.message;
    if (!message) return [];

    // Preserve the full message including tool_calls for conversation history
    if (message.tool_calls && message.tool_calls.length > 0) {
      return [{
        role: "assistant" as const,
        content: message.content,
        tool_calls: message.tool_calls,
      }];
    }

    return [{ role: "assistant" as const, content: message.content }];
  }

  toResultMessages(
    action: ParsedAction,
    result: ActionResult,
  ): ChatCompletionMessageParam[] {
    const toolCallId = action.args._toolCallId as string | undefined;
    if (toolCallId) {
      return [
        {
          role: "tool" as const,
          tool_call_id: toolCallId,
          content: result.success
            ? result.output
            : `Error: ${result.error || "Unknown error"}`,
        },
      ];
    }
    // Fallback: use user message
    return [
      {
        role: "user",
        content: `[Result of ${action.name}]: ${result.success ? result.output : `Error: ${result.error}`}`,
      },
    ];
  }

  toContextMessages(snapshot: ActionResult): ChatCompletionMessageParam[] {
    if (!snapshot.success) return [];
    return [
      {
        role: "user",
        content: `[Page snapshot after action]:\n${snapshot.output}`,
      },
    ];
  }

  correctionMessage(): ChatCompletionMessageParam {
    return {
      role: "user",
      content:
        "Please use the provided tools to interact with the browser. Call a tool function to perform your next action, or call task_complete if you are done.",
    };
  }
}
