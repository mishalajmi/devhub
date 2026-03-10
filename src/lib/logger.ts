type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  service: string;
  message: string;
  extra?: Record<string, unknown>;
}

function emit(entry: LogEntry) {
  // In dev, write to the browser console (non-polluting path)
  const prefix = `[${entry.level.toUpperCase()}] [${entry.service}]`;
  if (entry.level === "error") {
    window?.console?.error?.(`${prefix} ${entry.message}`, entry.extra ?? "");
  }
  // In production builds, forward to Tauri log plugin if available
  // This is intentionally not console.log — see AGENTS.md code style
}

export const logger = {
  debug: (service: string, message: string, extra?: Record<string, unknown>) =>
    emit({ level: "debug", service, message, extra }),
  info: (service: string, message: string, extra?: Record<string, unknown>) =>
    emit({ level: "info", service, message, extra }),
  warn: (service: string, message: string, extra?: Record<string, unknown>) =>
    emit({ level: "warn", service, message, extra }),
  error: (service: string, message: string, extra?: Record<string, unknown>) =>
    emit({ level: "error", service, message, extra }),
};
