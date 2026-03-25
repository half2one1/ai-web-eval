import type {
  ChatCompletionMessageParam,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions.js";

/** A parsed action from the model's response */
export interface ParsedAction {
  name: string;
  args: Record<string, unknown>;
}

/** Unified result from parsing any model response */
export interface ParsedResponse {
  thought: string | null;
  actions: ParsedAction[];
  done: boolean;
  summary: string | null;
}

/** Result of executing a browser action */
export interface ActionResult {
  success: boolean;
  output: string;
  error: string | null;
}

/**
 * Adapter interface that unifies function-calling and ReAct modes.
 * Each adapter translates between the model's communication style
 * and the harness's internal representation.
 */
export interface AgentAdapter {
  readonly mode: "function-calling" | "react";

  /** Extra params to merge into the chat completion request (e.g., tools[]) */
  getRequestParams(): Partial<ChatCompletionCreateParamsNonStreaming>;

  /** Parse a chat completion response into a unified format */
  parseResponse(response: unknown): ParsedResponse | null;

  /** Convert the raw API response into messages for the conversation history */
  toAssistantMessages(response: unknown): ChatCompletionMessageParam[];

  /** Convert an action result into messages to feed back to the model */
  toResultMessages(
    action: ParsedAction,
    result: ActionResult,
    toolCallId?: string,
  ): ChatCompletionMessageParam[];

  /** Convert a snapshot into context messages for the model */
  toContextMessages(snapshot: ActionResult): ChatCompletionMessageParam[];

  /** Produce a correction message when the model's output is unparseable */
  correctionMessage(): ChatCompletionMessageParam;
}
