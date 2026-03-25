import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

/** Browser tool definitions for function-calling mode */
export const BROWSER_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "browser_open",
      description: "Navigate to a URL",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "The URL to navigate to" } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_snapshot",
      description:
        "Get the accessibility tree of the current page with @ref identifiers for interactive elements",
      parameters: {
        type: "object",
        properties: {
          interactive_only: {
            type: "boolean",
            description: "If true, only return interactive elements (recommended)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_click",
      description: "Click an element by its @ref identifier from a snapshot",
      parameters: {
        type: "object",
        properties: { ref: { type: "string", description: "Element @ref (e.g., @e2)" } },
        required: ["ref"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_fill",
      description: "Clear a text input field and fill it with new text",
      parameters: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Element @ref (e.g., @e3)" },
          value: { type: "string", description: "Text to fill into the field" },
        },
        required: ["ref", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_type",
      description: "Type text into an element (appends, does not clear first)",
      parameters: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Element @ref" },
          text: { type: "string", description: "Text to type" },
        },
        required: ["ref", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_press",
      description: "Press a keyboard key (e.g., Enter, Tab, Escape)",
      parameters: {
        type: "object",
        properties: { key: { type: "string", description: "Key name to press" } },
        required: ["key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_select",
      description: "Select an option from a dropdown",
      parameters: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Element @ref of the select element" },
          value: { type: "string", description: "Option value or label to select" },
        },
        required: ["ref", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_screenshot",
      description: "Take a screenshot of the current page for visual verification",
      parameters: {
        type: "object",
        properties: {
          full_page: {
            type: "boolean",
            description: "Capture the full page, not just the viewport",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_get",
      description: "Get text, value, or attribute from an element or the page",
      parameters: {
        type: "object",
        properties: {
          what: {
            type: "string",
            enum: ["text", "value", "html", "title", "url"],
            description: "What to retrieve",
          },
          ref: { type: "string", description: "Element @ref (optional for title/url)" },
        },
        required: ["what"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_wait",
      description: "Wait for a selector to appear or for a duration in milliseconds",
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "CSS selector to wait for, or milliseconds (e.g., '2000')",
          },
        },
        required: ["target"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_scroll",
      description: "Scroll the page",
      parameters: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            enum: ["up", "down"],
            description: "Scroll direction",
          },
          amount: { type: "number", description: "Pixels to scroll (default 500)" },
        },
        required: ["direction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "task_complete",
      description:
        "Signal that you have finished the task. Call this when the goal is accomplished.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Brief summary of what was accomplished",
          },
        },
        required: ["summary"],
      },
    },
  },
];

/** Tool names that represent significant state changes (trigger auto-snapshot) */
export const SIGNIFICANT_ACTIONS = new Set([
  "browser_open",
  "browser_click",
  "browser_fill",
  "browser_select",
  "browser_press",
]);

/** Map from function-calling tool names to ReAct action names */
export const TOOL_TO_REACT: Record<string, string> = {
  browser_open: "open",
  browser_snapshot: "snapshot",
  browser_click: "click",
  browser_fill: "fill",
  browser_type: "type",
  browser_press: "press",
  browser_select: "select",
  browser_screenshot: "screenshot",
  browser_get: "get",
  browser_wait: "wait",
  browser_scroll: "scroll",
  task_complete: "done",
};

/** Reverse map: ReAct action names to function-calling tool names */
export const REACT_TO_TOOL: Record<string, string> = Object.fromEntries(
  Object.entries(TOOL_TO_REACT).map(([k, v]) => [v, k]),
);
