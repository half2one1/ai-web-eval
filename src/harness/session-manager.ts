import { execCommand } from "../utils/exec.js";
import { log } from "../utils/logger.js";

let sessionCounter = 0;

export function generateSessionId(prefix: string): string {
  sessionCounter++;
  const ts = Date.now().toString(36);
  return `${prefix}-${ts}-${sessionCounter}`;
}

export async function createSession(sessionId: string): Promise<boolean> {
  // agent-browser sessions are created implicitly on first use.
  // We just open about:blank in the session to initialize it.
  const result = await execCommand(
    "agent-browser",
    ["--session", sessionId, "open", "about:blank"],
    15_000,
  );

  if (result.success) {
    log.info(`Session created: ${sessionId}`);
  } else {
    log.error(`Failed to create session: ${sessionId}`, { stderr: result.stderr });
  }

  return result.success;
}

export async function destroySession(sessionId: string): Promise<void> {
  const result = await execCommand(
    "agent-browser",
    ["--session", sessionId, "close"],
    10_000,
  );

  if (result.success) {
    log.debug(`Session closed: ${sessionId}`);
  } else {
    log.warn(`Failed to close session: ${sessionId}`, { stderr: result.stderr });
  }
}
