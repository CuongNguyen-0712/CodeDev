"use strict";
/**
 * Runs ONE test case of untrusted JavaScript. Started by server.mjs for every test as
 *
 *   node --permission --allow-fs-read=<this file> --max-old-space-size=<mb> runner.cjs
 *
 * with an empty environment. The Node permission model denies file system access (except
 * reading this file), child processes, worker threads, native addons and WASI.
 *
 * Protocol: the payload { code, harness, entry, input, nonce } arrives on stdin; the result is
 * written to fd 3 as `<nonce><json>\n`. The nonce only lives in this closure, so whatever user
 * code prints (or writes to fd 3 itself) cannot pass for the result.
 *
 * Same harness contract as the browser runner (lib/challenges/runner.js):
 *   async function __harness(input, ctx) { ...call the user's functions...; return output; }
 * Without a harness, the entry function is called with the input mapped onto its parameters.
 */
const fs = require("node:fs");
const { performance } = require("node:perf_hooks");

const MAX_LOGS = 50;
const MAX_LOG_CHARS = 1000;
const MAX_OUTPUT_CHARS = 256 * 1024;

const writeFd = fs.writeSync;
const exit = process.exit.bind(process);

function format(value) {
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
}

function toJson(value) {
    if (value === undefined) return null;
    try { return JSON.parse(JSON.stringify(value)); } catch { return String(value); }
}

function paramNames(fn) {
    const source = Function.prototype.toString.call(fn);
    const match = source.match(/^[^(]*\(([^)]*)\)/) || source.match(/^\s*(?:async\s*)?([A-Za-z_$][\w$]*)\s*=>/);
    if (!match) return [];
    return match[1]
        .split(",")
        .map((part) => part.replace(/\/\*[\s\S]*?\*\//g, "").split("=")[0].trim())
        .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
}

function mapArgs(fn, input) {
    if (Array.isArray(input)) return input;
    if (input === null || typeof input !== "object") return [input];
    const names = paramNames(fn);
    if (names.length > 0 && names.every((name) => Object.prototype.hasOwnProperty.call(input, name))) {
        return names.map((name) => input[name]);
    }
    return [input];
}

let payload;
try {
    payload = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
    exit(2);
}

const { code, harness, entry, input, nonce } = payload;
let reported = false;

function report(result) {
    if (reported) return;
    reported = true;
    let line = JSON.stringify(result);
    if (line.length > MAX_OUTPUT_CHARS) {
        line = JSON.stringify({ ok: false, error: "Output too large", logs: [], unhandled: [], timeMs: result.timeMs });
    }
    writeFd(3, nonce + line + "\n");
    exit(0);
}

const logs = [];
const unhandled = [];
const push = (level) => (...args) => {
    if (logs.length < MAX_LOGS) logs.push({ level, text: args.map(format).join(" ").slice(0, MAX_LOG_CHARS) });
};
globalThis.console = { log: push("log"), info: push("info"), warn: push("warn"), error: push("error"), debug: push("log") };

process.on("unhandledRejection", (reason) => {
    unhandled.push(reason && reason.message ? reason.message : String(reason));
});

const started = performance.now();
const elapsed = () => Math.round(performance.now() - started);
const failure = (error) => ({
    ok: false,
    error: (error && error.name ? error.name + ": " : "") + (error && error.message ? error.message : String(error)),
    logs,
    unhandled,
    timeMs: elapsed(),
});

process.on("uncaughtException", (error) => report(failure(error)));

// Nothing below may hand user code a way back to this module's scope.
delete payload.nonce;
process.mainModule = undefined;

// No environment (the OS may still add a few variables) and no way to signal other processes:
// same-uid processes could otherwise kill the runner server or other learners' runs.
for (const key of Object.keys(process.env)) delete process.env[key];
for (const name of ["kill", "_kill", "binding", "_linkedBinding", "dlopen", "_debugProcess", "abort"]) {
    try {
        Object.defineProperty(process, name, { value: undefined, writable: false, configurable: false });
    } catch { /* not present on this platform */ }
}

(async () => {
    try {
        const factory = new Function(
            code + "\n;\n" + (harness || "") + "\n;\n" +
            "return {" +
            "  harness: typeof __harness === \"function\" ? __harness : null," +
            "  entry: " + (entry ? "(typeof " + entry + " !== \"undefined\" ? " + entry + " : null)" : "null") +
            "};"
        );
        const exported = factory();

        const ctx = {
            entry: exported.entry,
            mapArgs,
            callEntry: (value) => {
                if (typeof exported.entry !== "function") throw new Error("Entry function \"" + entry + "\" was not found");
                return exported.entry(...mapArgs(exported.entry, value));
            },
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            unhandledRejections: () => unhandled.slice(),
        };

        const output = exported.harness ? await exported.harness(input, ctx) : await ctx.callEntry(input);

        // Let pending rejections surface before reporting (same as the browser runner).
        await new Promise((resolve) => setTimeout(resolve, 0));

        report({ ok: true, output: toJson(output), logs, unhandled, timeMs: elapsed() });
    } catch (error) {
        report(failure(error));
    }
})();
