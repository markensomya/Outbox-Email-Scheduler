type LogLevel = "info" | "warn" | "error" | "debug";

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (meta) {
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
      prefix,
      message,
      JSON.stringify(meta),
    );
  } else {
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](prefix, message);
  }
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== "production") log("debug", msg, meta);
  },
};
