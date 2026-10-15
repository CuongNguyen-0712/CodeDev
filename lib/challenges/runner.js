'use client';

import { outputsMatch, toJsonValue } from "./compare";

/**
 * Runs JavaScript challenge code in the browser, one throw-away Web Worker per
 * test case so state cannot leak between tests and an infinite loop only kills
 * its own test (the worker is terminated when the time limit is hit).
 *
 * Harness contract (optional, stored as a `harness` coding file):
 *   async function __harness(input, ctx) { ...call the user's functions...; return output; }
 * Without a harness, the entry function (first function in the starter code) is
 * called with the test input mapped onto its parameter names.
 */

const WORKER_OVERHEAD_MS = 750;

const WORKER_SOURCE = String.raw`
const MAX_LOGS = 50;

function format(value) {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (e) { return String(value); }
}

function toJson(value) {
    if (value === undefined) return null;
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return String(value); }
}

function paramNames(fn) {
    const source = Function.prototype.toString.call(fn);
    const match = source.match(/^[^(]*\(([^)]*)\)/) || source.match(/^\s*(?:async\s*)?([A-Za-z_$][\w$]*)\s*=>/);
    if (!match) return [];
    return match[1]
        .split(',')
        .map((part) => part.replace(/\/\*[\s\S]*?\*\//g, '').split('=')[0].trim())
        .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
}

function mapArgs(fn, input) {
    if (Array.isArray(input)) return input;
    if (input === null || typeof input !== 'object') return [input];

    const names = paramNames(fn);
    if (names.length > 0 && names.every((name) => Object.prototype.hasOwnProperty.call(input, name))) {
        return names.map((name) => input[name]);
    }
    return [input];
}

self.onmessage = async (event) => {
    const { code, harness, entry, input } = event.data;
    const logs = [];
    const unhandled = [];

    const push = (level) => (...args) => {
        if (logs.length < MAX_LOGS) logs.push({ level, text: args.map(format).join(' ').slice(0, 1000) });
    };
    self.console = { log: push('log'), info: push('info'), warn: push('warn'), error: push('error'), debug: push('log') };

    self.addEventListener('unhandledrejection', (e) => {
        e.preventDefault();
        const reason = e.reason;
        unhandled.push(reason && reason.message ? reason.message : String(reason));
    });

    // The sandbox has no business talking to the network.
    for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches']) {
        try { self[name] = undefined; } catch (e) { /* read-only */ }
    }

    const started = performance.now();

    try {
        const factory = new Function(
            code + '\n;\n' + (harness || '') + '\n;\n' +
            'return {' +
            '  harness: typeof __harness === "function" ? __harness : null,' +
            '  entry: ' + (entry ? '(typeof ' + entry + ' !== "undefined" ? ' + entry + ' : null)' : 'null') +
            '};'
        );
        const exported = factory();

        const ctx = {
            entry: exported.entry,
            mapArgs,
            callEntry: (value) => {
                if (typeof exported.entry !== 'function') throw new Error('Entry function "' + entry + '" was not found');
                return exported.entry(...mapArgs(exported.entry, value));
            },
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            unhandledRejections: () => unhandled.slice(),
        };

        let output;
        if (exported.harness) {
            output = await exported.harness(input, ctx);
        } else {
            output = await ctx.callEntry(input);
        }

        // Let pending rejections surface before reporting.
        await new Promise((resolve) => setTimeout(resolve, 0));

        self.postMessage({
            ok: true,
            output: toJson(output),
            logs,
            unhandled,
            timeMs: Math.round(performance.now() - started),
        });
    } catch (error) {
        self.postMessage({
            ok: false,
            error: (error && error.name ? error.name + ': ' : '') + (error && error.message ? error.message : String(error)),
            logs,
            unhandled,
            timeMs: Math.round(performance.now() - started),
        });
    }
};
`;

let workerUrl = null;

function getWorkerUrl() {
    if (!workerUrl) {
        workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
    }
    return workerUrl;
}

// Name of the first function declared in the starter code (function decl or const arrow/function).
export function detectEntryName(source = '') {
    const patterns = [
        /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/,
        /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/,
    ];

    for (const pattern of patterns) {
        const match = source.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function runSingle({ code, harness, entry, input, timeLimitMs }) {
    return new Promise((resolve) => {
        const worker = new Worker(getWorkerUrl());
        const budget = timeLimitMs + WORKER_OVERHEAD_MS;
        const started = performance.now();

        const timer = setTimeout(() => {
            worker.terminate();
            resolve({
                ok: false,
                timedOut: true,
                error: `Time limit exceeded (${timeLimitMs}ms)`,
                logs: [],
                unhandled: [],
                timeMs: Math.round(performance.now() - started),
            });
        }, budget);

        worker.onmessage = (event) => {
            clearTimeout(timer);
            worker.terminate();
            resolve(event.data);
        };

        worker.onerror = (event) => {
            event.preventDefault?.();
            clearTimeout(timer);
            worker.terminate();
            resolve({
                ok: false,
                error: event.message || 'Script error',
                logs: [],
                unhandled: [],
                timeMs: Math.round(performance.now() - started),
            });
        };

        worker.postMessage({ code, harness, entry, input });
    });
}

/**
 * Runs tests sequentially. Returns per-test results:
 *   { id, name, isHidden, status: 'passed'|'failed'|'error'|'timeout'|'pending', output, error, logs, timeMs, timedOut }
 * Hidden tests have no expected output on the client, so their status stays 'pending'
 * until the server grades them.
 */
export async function runTests({ code, harness, entry, tests, timeLimitMs = 2000, onProgress }) {
    const results = [];

    for (const test of tests) {
        const outcome = await runSingle({ code, harness, entry, input: test.input, timeLimitMs });

        let status;
        if (outcome.timedOut) status = 'timeout';
        else if (!outcome.ok) status = 'error';
        else if (test.isHidden || test.expected === undefined) status = 'pending';
        else status = outputsMatch(outcome.output, test.expected) ? 'passed' : 'failed';

        const result = {
            id: test.id,
            name: test.name,
            isHidden: Boolean(test.isHidden),
            status,
            output: outcome.ok ? toJsonValue(outcome.output) : undefined,
            expected: test.expected,
            error: outcome.ok ? null : outcome.error,
            logs: outcome.logs || [],
            unhandled: outcome.unhandled || [],
            timeMs: outcome.timeMs || 0,
            timedOut: Boolean(outcome.timedOut),
        };

        results.push(result);
        onProgress?.(result, results.length, tests.length);
    }

    return results;
}

// Shape sent to the server for grading: { [testId]: { output, error, timeMs, timedOut } }.
export function toSubmissionPayload(results) {
    return Object.fromEntries(results.map((r) => [r.id, {
        output: r.output === undefined ? null : r.output,
        error: r.error || null,
        timeMs: r.timeMs,
        timedOut: r.timedOut,
    }]));
}
