import type { TaskDefinition, AgentMode } from "../types/task.js";

const BASE_INSTRUCTIONS = `You are a web browsing agent. Your job is to accomplish the given task by interacting with a real web browser.

You can see the page through accessibility tree snapshots that show interactive elements with @ref identifiers (e.g., @e1, @e2). Use these refs to click, fill, and interact with elements.

Strategy:
1. Always start by taking a snapshot to see the current page state
2. Identify the elements you need to interact with
3. Perform actions one at a time
4. After significant actions (clicks, form fills), take another snapshot to verify the result
5. When the task is complete, signal completion

Be efficient — avoid unnecessary actions. If something fails, try an alternative approach rather than repeating the same action.`;

const REACT_INSTRUCTIONS = `

Respond using this exact format for every turn:

THOUGHT: <your reasoning about what to do next>
ACTION: <command> <arguments>

Available actions:
- open <url> — Navigate to a URL
- snapshot --interactive — Get interactive elements with @refs (ALWAYS use this to see the page)
- click <@ref> — Click an element
- fill <@ref> "text" — Clear and fill a text input
- type <@ref> "text" — Append text to an input
- press <key> — Press a key (Enter, Tab, Escape, etc.)
- select <@ref> "option" — Select a dropdown option
- get <text|value|title|url> [<@ref>] — Get information from the page
- wait <selector|ms> — Wait for an element or duration
- scroll <up|down> [amount] — Scroll the page
- screenshot — Take a visual screenshot
- done "summary" — Signal task completion

Examples:
THOUGHT: I need to see what's on the page first.
ACTION: snapshot --interactive

THOUGHT: I see a search box at @e3. I'll type my query.
ACTION: fill @e3 "search terms"

THOUGHT: I found the answer. Task is done.
ACTION: done "The answer is 42"`;

const FC_INSTRUCTIONS = `

Use the provided tool functions to interact with the browser. Call one tool at a time, observe the result, then decide your next action. When the task is complete, call the task_complete tool.`;

export function buildSystemPrompt(
  task: TaskDefinition,
  mode: AgentMode,
  feedback?: string,
): string {
  const parts: string[] = [BASE_INSTRUCTIONS];

  // Mode-specific instructions
  if (mode === "react") {
    parts.push(REACT_INSTRUCTIONS);
  } else {
    parts.push(FC_INSTRUCTIONS);
  }

  // Feedback injection (supports both legacy single-string and new layered format)
  if (feedback) {
    parts.push(`\n\n--- GUIDANCE FROM PREVIOUS EVALUATIONS ---\n${feedback}\n--- END GUIDANCE ---`);
  }

  return parts.join("");
}

export function buildTaskPrompt(task: TaskDefinition): string {
  return `TASK: ${task.goal}

Starting URL: ${task.url}
Maximum steps allowed: ${task.maxSteps}

Begin by navigating to the starting URL and taking a snapshot to see the page.`;
}
