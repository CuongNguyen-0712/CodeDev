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
    if (header === null) return null;
    const h = header.replace(OWS, "");
    if (h.length < 55) return null;
    const version = h.slice(0, 2);
    if (!isHex(version, 2) || version === "ff" || h[2] !== "-") return null;
    if (version !== "00" || h.length !== 55) return null;
    if (h.length > 55 && h[55] !== "-") return null;
    const traceId = h.slice(3, 35);
    const parentId = h.slice(36, 52);
    const flags = h.slice(53, 55);
    if (!isHex(traceId, 32) || h[35] !== "-" || !isHex(parentId, 16) || h[52] !== "-" || !isHex(flags, 2)) return null;
    if (allZero(traceId) || allZero(parentId)) return null;
    return { version, traceId, parentId, sampled: (parseInt(flags, 16) & 0x01) === 1 };
}

const KEY = /^(?:[a-z][a-z0-9_\-*/]{0,255}|[a-z0-9][a-z0-9_\-*/]{0,240}@[a-z][a-z0-9_\-*/]{0,13})$/;
const VALUE = /^[\x20-\x2b\x2d-\x3c\x3e-\x7e]{0,255}[\x21-\x2b\x2d-\x3c\x3e-\x7e]$/;

function validTracestate(header: string): boolean {
    if (header.length > 512) return false;
    const keys = new Set<string>();
    for (const raw of header.split(",")) {
        const member = raw.replace(OWS, "");
        if (member === "") continue;
        const eq = member.indexOf("=");
        if (eq < 0) return false;
        const key = member.slice(0, eq);
        if (!KEY.test(key) || !VALUE.test(member.slice(eq + 1)) || keys.has(key)) return false;
        keys.add(key);
    }
    return keys.size >= 1 && keys.size <= 32;
}

function newId(draw: () => string): string {
    let id = draw();
    while (allZero(id)) id = draw();
    return id;
}

function childHeaders(incoming: Incoming, ids: IdSource): Outgoing {
    const parent = parseTraceparent(incoming.traceparent);
    if (!parent) return { traceparent: `00-${newId(ids.traceId)}-${newId(ids.spanId)}-01`, tracestate: null };
    const state = incoming.tracestate !== null && validTracestate(incoming.tracestate) ? incoming.tracestate : null;
    return { traceparent: `00-${parent.traceId}-${newId(ids.spanId)}-${parent.sampled ? "01" : "00"}`, tracestate: state };
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
