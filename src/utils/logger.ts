export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString().slice(11, 23);
}

export function debug(msg: string, data?: Record<string, unknown>): void {
  if (!shouldLog("debug")) return;
  console.log(`[${formatTimestamp()}] DEBUG ${msg}`, data ? JSON.stringify(data) : "");
}

export function info(msg: string, data?: Record<string, unknown>): void {
  if (!shouldLog("info")) return;
  console.log(`[${formatTimestamp()}] INFO  ${msg}`, data ? JSON.stringify(data) : "");
}

export function warn(msg: string, data?: Record<string, unknown>): void {
  if (!shouldLog("warn")) return;
  console.warn(`[${formatTimestamp()}] WARN  ${msg}`, data ? JSON.stringify(data) : "");
}

export function error(msg: string, data?: Record<string, unknown>): void {
  if (!shouldLog("error")) return;
  console.error(`[${formatTimestamp()}] ERROR ${msg}`, data ? JSON.stringify(data) : "");
}

export const log = { debug, info, warn, error, setLogLevel };
