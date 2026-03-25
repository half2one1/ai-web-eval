import type { ActionResult } from "./adapter.js";
import { execAgentBrowser } from "../utils/exec.js";
import { log } from "../utils/logger.js";

/**
 * Maps parsed actions to agent-browser CLI commands and executes them.
 */
export class ToolExecutor {
  async execute(
    action: string,
    args: Record<string, unknown>,
    sessionId: string,
  ): Promise<ActionResult> {
    const cliArgs = this.buildCliArgs(action, args);
    log.debug(`Executing: agent-browser ${action}`, { cliArgs });

    const result = await execAgentBrowser(action, cliArgs, sessionId);

    if (!result.success) {
      log.warn(`agent-browser ${action} failed`, { stderr: result.stderr });
      return {
        success: false,
        output: result.stdout || result.stderr,
        error: result.stderr || `Exit code: ${result.exitCode}`,
      };
    }

    return {
      success: true,
      output: result.stdout.trim(),
      error: null,
    };
  }

  private buildCliArgs(action: string, args: Record<string, unknown>): string[] {
    // Filter internal args
    const cleanArgs = { ...args };
    delete cleanArgs._toolCallId;

    switch (action) {
      case "open":
        return [String(cleanArgs.url || "")];

      case "snapshot":
        return cleanArgs.interactive_only ? ["-i"] : [];

      case "click":
      case "hover":
        return [String(cleanArgs.ref || "")];

      case "fill":
        return [String(cleanArgs.ref || ""), String(cleanArgs.value || "")];

      case "type":
        return [String(cleanArgs.ref || ""), String(cleanArgs.text || "")];

      case "select":
        return [String(cleanArgs.ref || ""), String(cleanArgs.value || "")];

      case "press":
        return [String(cleanArgs.key || "")];

      case "get": {
        const cliArgs = [String(cleanArgs.what || "text")];
        if (cleanArgs.ref) cliArgs.push(String(cleanArgs.ref));
        return cliArgs;
      }

      case "wait": {
        const target = String(cleanArgs.target || "");
        // If it looks like a number, use it as ms; otherwise as selector
        if (/^\d+$/.test(target)) return [target];
        return ["--load", target === "networkidle" ? "networkidle" : target];
      }

      case "scroll": {
        const dir = String(cleanArgs.direction || "down");
        const amount = String(cleanArgs.amount || "500");
        return [dir, amount];
      }

      case "screenshot": {
        return cleanArgs.full_page ? ["--full"] : [];
      }

      default:
        // Pass through raw args if present
        if (cleanArgs.raw) return [String(cleanArgs.raw)];
        return Object.values(cleanArgs).map(String);
    }
  }
}
