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
import { REACT_TO_TOOL } from "./browser-tools.js";

const THOUGHT_RE = /THOUGHT:\s*(.+?)(?=\nACTION:|$)/s;
const ACTION_RE = /ACTION:\s*(\S+)(.*)?$/m;

/** Parse a ReAct-style action line into name + args */
function parseActionLine(
  actionName: string,
  argsStr: string,
): ParsedAction | null {
  const name = actionName.trim().toLowerCase();
  const raw = argsStr.trim();

  // Normalize to canonical action name
  const canonical = Object.keys(REACT_TO_TOOL).includes(name) ? name : name;

  // Parse args based on action type
  const args: Record<string, unknown> = {};

  if (name === "done") {
    args.summary = raw.replace(/^["']|["']$/g, "");
    return { name: canonical, args };
  }

  if (name === "open") {
    args.url = raw.replace(/^["']|["']$/g, "");
    return { name: canonical, args };
  }

  if (name === "snapshot") {
    args.interactive_only = raw.includes("--interactive") || raw.includes("-i");
    return { name: canonical, args };
  }

  if (name === "click" || name === "hover") {
    args.ref = raw.split(/\s+/)[0];
    return { name: canonical, args };
  }

  if (name === "fill" || name === "type") {
    // fill @e3 "some text"
    const match = raw.match(/^(\S+)\s+["'](.+?)["']$/s) || raw.match(/^(\S+)\s+(.+)$/s);
    if (match) {
      args.ref = match[1];
      args[name === "fill" ? "value" : "text"] = match[2];
    }
    return { name: canonical, args };
  }

  if (name === "select") {
    const match = raw.match(/^(\S+)\s+["'](.+?)["']$/s) || raw.match(/^(\S+)\s+(.+)$/s);
    if (match) {
      args.ref = match[1];
      args.value = match[2];
    }
    return { name: canonical, args };
  }

  if (name === "press") {
    args.key = raw;
    return { name: canonical, args };
  }

  if (name === "get") {
    const parts = raw.split(/\s+/);
    args.what = parts[0];
    if (parts[1]) args.ref = parts[1];
    return { name: canonical, args };
  }

  if (name === "wait") {
    args.target = raw;
    return { name: canonical, args };
  }

  if (name === "scroll") {
    const parts = raw.split(/\s+/);
    args.direction = parts[0] || "down";
    args.amount = parts[1] ? parseInt(parts[1], 10) : 500;
    return { name: canonical, args };
  }

  if (name === "screenshot") {
    args.full_page = raw.includes("--full");
    return { name: canonical, args };
  }

  // Unknown action — pass through
  args.raw = raw;
  return { name: canonical, args };
}

export class ReactAdapter implements AgentAdapter {
  readonly mode = "react" as const;

  getRequestParams(): Partial<ChatCompletionCreateParamsNonStreaming> {
    return {}; // No tools parameter in ReAct mode
  }

  parseResponse(response: ChatCompletion): ParsedResponse | null {
    const text = response.choices[0]?.message?.content;
    if (!text) return null;

    const thoughtMatch = text.match(THOUGHT_RE);
    const thought = thoughtMatch ? thoughtMatch[1].trim() : null;

    const actionMatch = text.match(ACTION_RE);
    if (!actionMatch) {
      // No action found — return thought only if present
      if (thought) return { thought, actions: [], done: false, summary: null };
      return null;
    }

    const actionName = actionMatch[1];
    const argsStr = actionMatch[2] || "";

    if (actionName.toLowerCase() === "done") {
      return {
        thought,
        actions: [],
        done: true,
        summary: argsStr.trim().replace(/^["']|["']$/g, "") || "Task completed",
      };
    }

    const parsed = parseActionLine(actionName, argsStr);
    if (!parsed) return null;

    return { thought, actions: [parsed], done: false, summary: null };
  }

  toAssistantMessages(response: ChatCompletion): ChatCompletionMessageParam[] {
    const content = response.choices[0]?.message?.content;
    if (!content) return [];
    return [{ role: "assistant", content }];
  }

  toResultMessages(
    action: ParsedAction,
    result: ActionResult,
  ): ChatCompletionMessageParam[] {
    const status = result.success ? "OK" : "ERROR";
    const body = result.success ? result.output : `${result.error || "Unknown error"}`;
    return [
      {
        role: "user",
        content: `[${status}] ${action.name}: ${body}`,
      },
    ];
  }

  toContextMessages(snapshot: ActionResult): ChatCompletionMessageParam[] {
    if (!snapshot.success) return [];
    return [
      {
        role: "user",
        content: `[Page snapshot]:\n${snapshot.output}`,
      },
    ];
  }

  correctionMessage(): ChatCompletionMessageParam {
    return {
      role: "user",
      content: `Please respond using the THOUGHT/ACTION format:

THOUGHT: <your reasoning>
ACTION: <command> <arguments>

Available actions: open, snapshot, click, fill, type, press, select, screenshot, get, wait, scroll, done
Example: ACTION: click @e3
Example: ACTION: fill @e3 "search text"
Example: ACTION: done "Task finished successfully"`,
    };
  }
}
