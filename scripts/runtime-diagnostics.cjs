"use strict";

const util = require("node:util");
const process = require("node:process");
const { monitorEventLoopDelay } = require("node:perf_hooks");

const service = String(process.env.BOM_SERVICE || process.env.SERVICE_NAME || "bom").trim() || "bom";
const levelName = String(process.env.BOM_LOG_LEVEL || process.env.LOG_LEVEL || "info").toLowerCase();
const format = String(process.env.BOM_LOG_FORMAT || "pretty").toLowerCase();
const levels = { debug: 10, info: 20, log: 20, warn: 30, error: 40 };
const threshold = levels[levelName] ?? levels.info;
let errorSequence = 0;

function nextErrorEventId() {
  errorSequence = (errorSequence + 1) % 46656;
  return `ERR-${Date.now().toString(36).toUpperCase()}-${process.pid.toString(36).toUpperCase()}-${errorSequence.toString(36).toUpperCase().padStart(3, "0")}`;
}

const original = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const secretKey = /(token|password|secret|authorization|cookie|session|api[_-]?key|private[_-]?key|client[_-]?secret)/i;
const knownSecrets = Object.entries(process.env)
  .filter(([key, value]) => secretKey.test(key) && typeof value === "string" && value.length >= 6)
  .map(([, value]) => value)
  .sort((a, b) => b.length - a.length);

function redactString(input) {
  let value = String(input);
  for (const secret of knownSecrets) {
    if (secret && value.includes(secret)) value = value.split(secret).join("[REDACTED]");
  }
  value = value
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/((?:token|password|secret|api[_-]?key|client[_-]?secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s/]+(@)/gi, "$1[REDACTED]$2");
  return value;
}

function sanitize(value, depth = 0) {
  if (depth > 5) return "[MaxDepth]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message || String(value)),
      code: value.code,
      stack: value.stack ? redactString(value.stack) : undefined,
      cause: value.cause ? sanitize(value.cause, depth + 1) : undefined,
    };
  }
  if (typeof value === "string") return redactString(value);
  if (value == null || typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(v => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    let count = 0;
    for (const [key, val] of Object.entries(value)) {
      if (++count > 80) { out.__truncated = true; break; }
      out[key] = secretKey.test(key) ? "[REDACTED]" : sanitize(val, depth + 1);
    }
    return out;
  }
  return redactString(util.inspect(value));
}

function renderArg(arg) {
  if (arg instanceof Error) return redactString(arg.stack || `${arg.name}: ${arg.message}`);
  const safe = sanitize(arg);
  if (typeof safe === "string") return safe;
  if (safe instanceof Error) return safe.stack || safe.message;
  return util.inspect(safe, { depth: 6, breakLength: Infinity, compact: true, maxArrayLength: 50, maxStringLength: 4000 });
}

function collectErrors(value, found = [], depth = 0, seen = new Set()) {
  if (depth > 4 || value == null) return found;
  if (value instanceof Error) {
    if (!seen.has(value)) { seen.add(value); found.push(value); }
    if (value.cause) collectErrors(value.cause, found, depth + 1, seen);
    return found;
  }
  if (typeof value !== "object" || seen.has(value)) return found;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 40)) collectErrors(item, found, depth + 1, seen);
  } else {
    let count = 0;
    for (const item of Object.values(value)) {
      if (++count > 60) break;
      collectErrors(item, found, depth + 1, seen);
    }
  }
  return found;
}

function emit(level, args) {
  if ((levels[level] ?? 20) < threshold) return;
  const ts = new Date().toISOString();
  const label = level === "log" ? "INFO" : level.toUpperCase();
  const eventId = level === "error" ? nextErrorEventId() : undefined;
  if (format === "json") {
    const payload = {
      ts,
      level: label,
      service,
      pid: process.pid,
      ...(eventId ? { eventId } : {}),
      message: args.map(renderArg).join(" "),
    };
    original[level === "log" ? "log" : level](JSON.stringify(payload));
    return;
  }
  const prefix = `${ts} [${label}] [${service}] [pid:${process.pid}]${eventId ? ` [${eventId}]` : ""}`;
  const sink = original[level === "log" ? "log" : level];
  sink(`${prefix} ${args.map(renderArg).join(" ")}`);
  if (level === "error") {
    const errors = [];
    const seen = new Set();
    for (const arg of args) collectErrors(arg, errors, 0, seen);
    for (const error of errors) {
      const stack = error.stack ? redactString(error.stack) : `${error.name}: ${redactString(error.message || String(error))}`;
      sink(`${prefix} [traceback]\n${stack}`);
    }
  }
}

console.log = (...args) => emit("log", args);
console.info = (...args) => emit("info", args);
console.debug = (...args) => emit("debug", args);
console.warn = (...args) => emit("warn", args);
console.error = (...args) => emit("error", args);

const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();
const startedAt = Date.now();

function processSnapshot() {
  const mem = process.memoryUsage();
  const activeHandles = typeof process._getActiveHandles === "function" ? process._getActiveHandles().length : undefined;
  const activeRequests = typeof process._getActiveRequests === "function" ? process._getActiveRequests().length : undefined;
  return {
    uptimeSec: Math.round(process.uptime()),
    rssMb: Number((mem.rss / 1024 / 1024).toFixed(1)),
    heapUsedMb: Number((mem.heapUsed / 1024 / 1024).toFixed(1)),
    heapTotalMb: Number((mem.heapTotal / 1024 / 1024).toFixed(1)),
    externalMb: Number((mem.external / 1024 / 1024).toFixed(1)),
    eventLoopMeanMs: Number((eventLoop.mean / 1e6 || 0).toFixed(2)),
    eventLoopP95Ms: Number((eventLoop.percentile(95) / 1e6 || 0).toFixed(2)),
    eventLoopMaxMs: Number((eventLoop.max / 1e6 || 0).toFixed(2)),
    activeHandles,
    activeRequests,
  };
}

console.info("[diagnostics] runtime diagnostics active", {
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  logLevel: levelName,
  logFormat: format,
});

process.on("warning", warning => {
  console.warn("[process-warning]", warning);
});

// Monitor uncaught exceptions without changing Node's normal crash semantics.
process.on("uncaughtExceptionMonitor", (error, origin) => {
  console.error("[process-fatal] uncaught exception", { origin, error, process: processSnapshot() });
});

process.on("exit", code => {
  try {
    const uptimeMs = Date.now() - startedAt;
    original.log(`${new Date().toISOString()} [${code === 0 ? "INFO" : "ERROR"}] [${service}] [pid:${process.pid}] [process-exit] code=${code} uptimeMs=${uptimeMs}`);
  } catch {}
});

const heartbeatSec = Math.max(0, Number(process.env.BOM_DIAGNOSTIC_HEARTBEAT_SEC || 300));
const healthRssWarnMb = Math.max(64, Number(process.env.BOM_HEALTH_RSS_WARN_MB || 512));
const healthHeapWarnMb = Math.max(32, Number(process.env.BOM_HEALTH_HEAP_WARN_MB || 384));
const healthP95WarnMs = Math.max(20, Number(process.env.BOM_HEALTH_EVENT_LOOP_P95_WARN_MS || 100));
const healthMaxWarnMs = Math.max(50, Number(process.env.BOM_HEALTH_EVENT_LOOP_MAX_WARN_MS || 500));
const healthActiveRequestsWarn = Math.max(1, Number(process.env.BOM_HEALTH_ACTIVE_REQUESTS_WARN || 50));
if (heartbeatSec > 0) {
  const timer = setInterval(() => {
    const snapshot = processSnapshot();
    const breached = [];
    if (snapshot.rssMb >= healthRssWarnMb) breached.push(`rssMb>=${healthRssWarnMb}`);
    if (snapshot.heapUsedMb >= healthHeapWarnMb) breached.push(`heapUsedMb>=${healthHeapWarnMb}`);
    if (snapshot.eventLoopP95Ms >= healthP95WarnMs) breached.push(`eventLoopP95Ms>=${healthP95WarnMs}`);
    if (snapshot.eventLoopMaxMs >= healthMaxWarnMs) breached.push(`eventLoopMaxMs>=${healthMaxWarnMs}`);
    if (Number(snapshot.activeRequests || 0) >= healthActiveRequestsWarn) breached.push(`activeRequests>=${healthActiveRequestsWarn}`);
    if (breached.length) console.warn("[process-health] degraded", { ...snapshot, breached });
    else console.debug("[process-health] healthy", snapshot);
    eventLoop.reset();
  }, Math.max(30, heartbeatSec) * 1000);
  timer.unref?.();
}
