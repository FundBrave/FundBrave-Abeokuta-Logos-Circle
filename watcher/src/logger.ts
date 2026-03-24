/**
 * Structured logger. Outputs JSON when LOG_FORMAT=json, plain text otherwise.
 * W-L2: Enables log aggregator integration (Datadog, CloudWatch, etc.)
 */

const JSON_LOGS = process.env.LOG_FORMAT === "json";

type Meta = Record<string, unknown>;

function emit(level: "INFO" | "WARN" | "ERROR", msg: string, meta?: Meta): void {
  if (JSON_LOGS) {
    process.stdout.write(
      JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }) + "\n"
    );
  } else {
    const metaStr = meta && Object.keys(meta).length > 0 ? " " + JSON.stringify(meta) : "";
    const line = `[${level.padEnd(5)}] ${msg}${metaStr}`;
    if (level === "ERROR") console.error(line);
    else if (level === "WARN") console.warn(line);
    else console.log(line);
  }
}

export const logger = {
  info:  (msg: string, meta?: Meta) => emit("INFO",  msg, meta),
  warn:  (msg: string, meta?: Meta) => emit("WARN",  msg, meta),
  error: (msg: string, meta?: Meta) => emit("ERROR", msg, meta),
};
