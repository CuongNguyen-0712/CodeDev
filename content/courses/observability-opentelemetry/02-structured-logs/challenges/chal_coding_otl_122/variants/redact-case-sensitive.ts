import { readFileSync } from "node:fs";

// CodeDev API and grading worker: one JSON log line per record, joinable to the trace.
//
// createLogger(options, bindings) returns a Logger. logger.log(level, msg, fields) writes ONE line
// with options.write(line) - a JSON object with the fields in this order:
//   time      new Date(options.now()).toISOString()
//   level     the level name ("info", "error", ...)
//   msg       the message
//   trace_id  options.activeSpan()?.traceId  - both ids are left out when there is no active span
//   span_id   options.activeSpan()?.spanId     (read the span when the line is written)
//   ...then the other fields, sorted by key (default string sort): the logger's bindings merged
//   with the call's fields, the call's fields winning. Fields named time, level, msg, trace_id or
//   span_id are dropped: the logger owns them.
// Rules for every value, at any depth (nested objects and arrays):
//   - a key whose value is undefined is dropped (so an undefined call field leaves the binding as it
//     was); an undefined array item becomes null, as JSON.stringify does;
//   - a key listed in options.redact (compared case-insensitively) gets the value "[REDACTED]";
//   - an Error becomes { name, message, stack } where stack is the first frame of error.stack (the
//     first line that starts with "at " once trimmed); no frame -> no stack key;
//   - a string longer than options.maxStringLength becomes its first maxStringLength characters
//     followed by "...[truncated]" (msg and the error fields included).
// Levels: trace 10, debug 20, info 30, warn 40, error 50, fatal 60. A record is written when its
// level is >= options.level. An unknown level (in options or in a call) throws
// new Error("unknown level: <level>").
// logger.child(bindings) returns a logger with the parent's bindings merged with the new ones (the
// new ones win; an undefined one is not set), writing through the same options.

type Fields = { [key: string]: unknown };
type SpanContext = { traceId: string; spanId: string };
type LoggerOptions = {
    level: string;
    redact: string[];
    maxStringLength: number;
    now: () => number;
    activeSpan: () => SpanContext | null;
    write: (line: string) => void;
};
interface Logger {
    log(level: string, msg: string, fields?: Fields): void;
    child(bindings: Fields): Logger;
}

const LEVELS: Record<string, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
const RESERVED = new Set(["time", "level", "msg", "trace_id", "span_id"]);

function levelValue(level: string): number {
    if (!Object.prototype.hasOwnProperty.call(LEVELS, level)) throw new Error(`unknown level: ${level}`);
    return LEVELS[level];
}

function createLogger(options: LoggerOptions, bindings: Fields = {}): Logger {
    const threshold = levelValue(options.level);
    const redact = new Set(options.redact.map((key) => key.toLowerCase()));
    const max = options.maxStringLength;

    const clean = (value: unknown): unknown => {
        if (typeof value === "string") return value.length > max ? `${value.slice(0, max)}...[truncated]` : value;
        if (value instanceof Error) {
            const out: Fields = { name: clean(value.name), message: clean(value.message) };
            const frame = (value.stack ?? "").split("\n").map((line) => line.trim()).find((line) => line.startsWith("at "));
            if (frame !== undefined) out.stack = clean(frame);
            return out;
        }
        if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : clean(item)));
        if (value !== null && typeof value === "object") return cleanObject(value as Fields);
        return value;
    };
    const cleanObject = (obj: Fields): Fields => {
        const out: Fields = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value === undefined) continue;
            out[key] = options.redact.includes(key) ? "[REDACTED]" : clean(value);
        }
        return out;
    };

    return {
        log(level: string, msg: string, fields: Fields = {}): void {
            if (levelValue(level) < threshold) return;
            const record: Fields = { time: new Date(options.now()).toISOString(), level, msg: clean(msg) };
            const span = options.activeSpan();
            if (span) {
                record.trace_id = span.traceId;
                record.span_id = span.spanId;
            }
            const merged = { ...cleanObject(bindings), ...cleanObject(fields) };
            for (const key of Object.keys(merged).sort()) {
                if (!RESERVED.has(key)) record[key] = merged[key];
            }
            options.write(JSON.stringify(record));
        },
        child(more: Fields): Logger {
            const set = Object.entries(more).filter(([, value]) => value !== undefined);
            return createLogger(options, { ...bindings, ...Object.fromEntries(set) });
        },
    };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "config": { level, redact, maxStringLength }, "steps": Step[] }.
// In fields, { "$error": { name, message, stack } } stands for an Error and { "$undefined": true } for undefined.
// The clock starts at 2026-10-20T09:14:03.000Z. "enter"/"exit" push and pop the active span.
// Prints every written line; a thrown error prints "!! <message>".
type Step =
    | { op: "advance"; ms: number }
    | { op: "enter"; traceId: string; spanId: string }
    | { op: "exit" }
    | { op: "child"; name: string; of: string; bindings: Fields }
    | { op: "log"; logger?: string; level: string; msg: string; fields?: Fields };

function decode(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(decode);
    if (value !== null && typeof value === "object") {
        const obj = value as Fields;
        if (obj.$undefined === true) return undefined;
        if (obj.$error !== undefined) {
            const e = obj.$error as { name: string; message: string; stack?: string };
            const error = new Error(e.message);
            error.name = e.name;
            error.stack = e.stack;
            return error;
        }
        const out: Fields = {};
        for (const [key, item] of Object.entries(obj)) out[key] = decode(item);
        return out;
    }
    return value;
}

const input: { config: { level: string; redact: string[]; maxStringLength: number }; steps: Step[] } =
    JSON.parse(readFileSync(0, "utf8"));
let clock = Date.parse("2026-10-20T09:14:03.000Z");
const spans: SpanContext[] = [];
const out: string[] = [];
const loggers: Record<string, Logger> = {};
try {
    loggers.root = createLogger({
        ...input.config,
        now: () => clock,
        activeSpan: () => (spans.length ? { ...spans[spans.length - 1] } : null),
        write: (line) => out.push(line),
    });
    for (const step of input.steps) {
        try {
            switch (step.op) {
                case "advance":
                    clock += step.ms;
                    break;
                case "enter":
                    spans.push({ traceId: step.traceId, spanId: step.spanId });
                    break;
                case "exit":
                    spans.pop();
                    break;
                case "child":
                    loggers[step.name] = loggers[step.of].child(decode(step.bindings) as Fields);
                    break;
                case "log":
                    loggers[step.logger ?? "root"].log(step.level, step.msg, step.fields === undefined ? undefined : (decode(step.fields) as Fields));
                    break;
            }
        } catch (error) {
            out.push(`!! ${(error as Error).message}`);
        }
    }
} catch (error) {
    out.push(`!! ${(error as Error).message}`);
}
console.log(out.length ? out.join("\n") : "(no lines)");
