import { readFileSync } from "node:fs";

// CodeDev API -> grading-service: read the W3C traceparent of the incoming request and write the
// headers of the outgoing call for a child span (https://www.w3.org/TR/trace-context/).
//
// parseTraceparent(header) returns { version, traceId, parentId, sampled } or null when the header is
// missing or invalid. Trim spaces and tabs at both ends first, then:
//   - the header is at least 55 characters; version = characters 0-1, lowercase hex, followed by "-";
//     version "ff" is invalid;
//   - version "00": exactly 55 characters: 00-<trace-id>-<parent-id>-<trace-flags>;
//   - a higher version (01 to fe): parse the first 55 characters the same way; if the header is longer,
//     character 55 must be "-" (what follows is not ours to read);
//   - trace-id 32, parent-id 16 and trace-flags 2 characters of lowercase hex (0-9, a-f), with "-" between;
//   - a trace-id or parent-id made only of zeros is invalid;
//   - sampled = the lowest bit of trace-flags (flags & 0x01).
//
// childHeaders(incoming, ids) returns the headers for the outgoing call:
//   - valid parent: traceparent "00-<same trace-id>-<new span id>-<01 if sampled, else 00>" (always
//     version 00, the only one we know; other flag bits are set to 0);
//   - missing or invalid parent: start a new trace, "00-<new trace id>-<new span id>-01";
//   - new ids come from ids.traceId() / ids.spanId(); an all-zero id is invalid: draw again;
//   - tracestate: passed through unchanged (the exact string received) only when the parent is valid
//     and validTracestate(header) is true, otherwise null.
//
// validTracestate(header): at most 512 characters; split on ","; trim spaces and tabs around each
// member; empty members are allowed but at least one non-empty member is required; each member is
// key=value split at the first "="; at most 32 members; no key twice;
//   key:   [a-z][a-z0-9_\-*/]{0,255}  or  [a-z0-9][a-z0-9_\-*/]{0,240}@[a-z][a-z0-9_\-*/]{0,13}
//   value: 1 to 256 characters from 0x20-0x7E except "," and "=", not ending with a space.

type ParentContext = { version: string; traceId: string; parentId: string; sampled: boolean };
type IdSource = { traceId: () => string; spanId: () => string };
type Incoming = { traceparent: string | null; tracestate: string | null };
type Outgoing = { traceparent: string; tracestate: string | null };

const OWS = /^[ \t]+|[ \t]+$/g;
const isHex = (s: string, length: number): boolean => s.length === length && /^[0-9a-f]+$/.test(s);
const allZero = (s: string): boolean => /^0+$/.test(s);

function parseTraceparent(header: string | null): ParentContext | null {
    // [ ] Check the header's length, version and separators
    // [ ] Read and check the trace id, parent id and flags
}

const KEY = /^(?:[a-z][a-z0-9_\-*/]{0,255}|[a-z0-9][a-z0-9_\-*/]{0,240}@[a-z][a-z0-9_\-*/]{0,13})$/;
const VALUE = /^[\x20-\x2b\x2d-\x3c\x3e-\x7e]{0,255}[\x21-\x2b\x2d-\x3c\x3e-\x7e]$/;

function validTracestate(header: string): boolean {
    // [ ] Accept tracestate only when every member is valid
}

function newId(draw: () => string): string {
    // [ ] Draw an id that is not all zeros
}

function childHeaders(incoming: Incoming, ids: IdSource): Outgoing {
    // [ ] Headers for the outgoing call
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "traceIds": string[], "spanIds": string[], "requests": [{ "traceparent"?, "tracestate"? }] }.
// ids.traceId() / ids.spanId() return the listed ids in turn (cycling). Prints one JSON array:
// per request { parent: parseTraceparent(...), traceparent, tracestate } of childHeaders(...).
const input: { traceIds: string[]; spanIds: string[]; requests: { traceparent?: string | null; tracestate?: string | null }[] } =
    JSON.parse(readFileSync(0, "utf8"));
let nextTrace = 0;
let nextSpan = 0;
const ids: IdSource = {
    traceId: () => input.traceIds[nextTrace++ % input.traceIds.length],
    spanId: () => input.spanIds[nextSpan++ % input.spanIds.length],
};
const results = input.requests.map((request) => {
    const incoming: Incoming = { traceparent: request.traceparent ?? null, tracestate: request.tracestate ?? null };
    const parent = parseTraceparent(incoming.traceparent);
    const out = childHeaders(incoming, ids);
    return { parent, traceparent: out.traceparent, tracestate: out.tracestate };
});
console.log(JSON.stringify(results));
