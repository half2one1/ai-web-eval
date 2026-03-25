import { execFile } from "node:child_process";

export interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export async function execCommand(
  command: string,
  args: string[],
  timeoutMs = 30_000,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const proc = execFile(
      command,
      args,
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          success: !error,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode: proc.exitCode,
        });
      },
    );
  });
}

export async function execAgentBrowser(
  action: string,
  args: string[],
  sessionId: string,
  timeoutMs = 30_000,
): Promise<ExecResult> {
  const fullArgs = ["--session", sessionId, action, ...args];
  return execCommand("agent-browser", fullArgs, timeoutMs);
}
