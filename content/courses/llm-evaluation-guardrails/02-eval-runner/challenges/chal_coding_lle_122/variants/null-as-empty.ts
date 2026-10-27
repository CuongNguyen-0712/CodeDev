import { readFileSync } from "node:fs";

// Wrong: a failed call (null output) is checked as an empty string, so not_contains and max_length pass.


type Assertion = { [key: string]: unknown };
type EvalCase = { id: string; slice?: string; weight?: unknown; output: string | null; assertions?: unknown };
type Reason = "unknown_type" | "bad_definition" | "bad_weight" | "no_assertions";
type Problem = { id: string; at: number | null; reason: Reason };
type CaseResult = { id: string; status: "pass" | "fail" | "invalid"; failed: string[] };
type SliceResult = { slice: string; passed: number; total: number; rate: number | null };
type Report = { cases: CaseResult[]; invalid: Problem[]; slices: SliceResult[]; score: number | null };

const TYPES = ["is_json", "json_schema", "contains", "not_contains", "regex", "max_length", "equals_field", "score_in_range"];
const SCHEMA_TYPES = ["object", "array", "string", "number", "integer", "boolean", "null"];
const SCHEMA_KEYS = ["type", "properties", "required", "items", "enum", "minimum", "maximum"];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round3 = (x: number): number => Math.round(x * 1000) / 1000;
const validPath = (p: unknown): p is string => typeof p === "string" && p !== "" && p.split(".").every((s) => s !== "");

function validSchema(s: unknown): boolean {
    if (!isObject(s)) return false;
    for (const [key, v] of Object.entries(s)) {
        if (!SCHEMA_KEYS.includes(key)) return false;
        if (key === "type" && !(typeof v === "string" && SCHEMA_TYPES.includes(v))) return false;
        if (key === "properties" && !(isObject(v) && Object.values(v).every(validSchema))) return false;
        if (key === "required" && !(Array.isArray(v) && v.every((r) => typeof r === "string"))) return false;
        if (key === "items" && !validSchema(v)) return false;
        if (key === "enum" && !(Array.isArray(v) && v.length > 0
            && v.every((e) => e === null || ["string", "number", "boolean"].includes(typeof e)))) return false;
        if ((key === "minimum" || key === "maximum") && !isFiniteNumber(v)) return false;
    }
    return true;
}

function validate(a: unknown): Reason | null {
    if (!isObject(a) || typeof a.type !== "string" || !TYPES.includes(a.type)) return "unknown_type";
    switch (a.type) {
        case "is_json":
            return null;
        case "json_schema":
            return validSchema(a.schema) ? null : "bad_definition";
        case "contains":
        case "not_contains":
            return typeof a.value === "string" && a.value !== "" && (a.ignoreCase === undefined || typeof a.ignoreCase === "boolean")
                ? null : "bad_definition";
        case "regex": {
            if (typeof a.pattern !== "string" || a.pattern === "") return "bad_definition";
            const flags = a.flags === undefined ? "" : a.flags;
            if (typeof flags !== "string" || !/^[ims]*$/.test(flags) || new Set(flags).size !== flags.length) return "bad_definition";
            try {
                new RegExp(a.pattern, flags);
            } catch {
                return "bad_definition";
            }
            return null;
        }
        case "max_length":
            return Number.isInteger(a.value) && (a.value as number) >= 0 ? null : "bad_definition";
        case "equals_field":
            return validPath(a.path) && "value" in a ? null : "bad_definition";
        case "score_in_range":
            return validPath(a.path) && isFiniteNumber(a.min) && isFiniteNumber(a.max) && a.min <= a.max ? null : "bad_definition";
    }
    return "unknown_type";
}

function parse(output: string): { ok: boolean; value: unknown } {
    try {
        return { ok: true, value: JSON.parse(output) };
    } catch {
        return { ok: false, value: undefined };
    }
}

function matches(schema: Record<string, unknown>, v: unknown): boolean {
    const t = schema.type;
    if (t !== undefined) {
        const ok = t === "object" ? isObject(v)
            : t === "array" ? Array.isArray(v)
            : t === "string" ? typeof v === "string"
            : t === "number" ? typeof v === "number"
            : t === "integer" ? Number.isInteger(v)
            : t === "boolean" ? typeof v === "boolean"
            : v === null;
        if (!ok) return false;
    }
    if (Array.isArray(schema.enum) && !schema.enum.some((e) => e === v)) return false;
    if (typeof v === "number") {
        if (isFiniteNumber(schema.minimum) && v < schema.minimum) return false;
        if (isFiniteNumber(schema.maximum) && v > schema.maximum) return false;
    }
    if (isObject(v)) {
        if (Array.isArray(schema.required) && !schema.required.every((k) => Object.prototype.hasOwnProperty.call(v, k as string))) return false;
        if (isObject(schema.properties)) {
            for (const [k, sub] of Object.entries(schema.properties)) {
                if (Object.prototype.hasOwnProperty.call(v, k) && !matches(sub as Record<string, unknown>, v[k])) return false;
            }
        }
    }
    if (Array.isArray(v) && isObject(schema.items)) {
        const items = schema.items;
        if (!v.every((e) => matches(items, e))) return false;
    }
    return true;
}

function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
        return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
    }
    if (isObject(a) && isObject(b)) {
        const ka = Object.keys(a);
        return ka.length === Object.keys(b).length
            && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
    }
    return false;
}

function field(output: string, path: string): { found: boolean; value: unknown } {
    const parsed = parse(output);
    if (!parsed.ok) return { found: false, value: undefined };
    let cur: unknown = parsed.value;
    for (const seg of path.split(".")) {
        if (!isObject(cur) || !Object.prototype.hasOwnProperty.call(cur, seg)) return { found: false, value: undefined };
        cur = cur[seg];
    }
    return { found: true, value: cur };
}

function check(a: Assertion, recorded: string | null): boolean {
    const output = recorded ?? "";
    switch (a.type) {
        case "is_json":
            return parse(output).ok;
        case "json_schema": {
            const p = parse(output);
            return p.ok && matches(a.schema as Record<string, unknown>, p.value);
        }
        case "contains":
        case "not_contains": {
            const value = a.value as string;
            const found = a.ignoreCase === true ? output.toLowerCase().includes(value.toLowerCase()) : output.includes(value);
            return a.type === "contains" ? found : !found;
        }
        case "regex":
            return new RegExp(a.pattern as string, (a.flags as string | undefined) ?? "").test(output);
        case "max_length":
            return Array.from(output).length <= (a.value as number);
        case "equals_field": {
            const f = field(output, a.path as string);
            return f.found && deepEqual(f.value, a.value);
        }
        case "score_in_range": {
            const f = field(output, a.path as string);
            return f.found && typeof f.value === "number" && f.value >= (a.min as number) && f.value <= (a.max as number);
        }
    }
    return false;
}

function runEval(cases: EvalCase[]): Report {
    const results: CaseResult[] = [];
    const invalid: Problem[] = [];
    const slices = new Map<string, { passed: number; total: number }>();
    let weightAll = 0;
    let weightPassed = 0;

    for (const c of cases) {
        const problems: Problem[] = [];
        const w = c.weight === undefined ? 1 : c.weight;
        if (!isFiniteNumber(w) || w <= 0) problems.push({ id: c.id, at: null, reason: "bad_weight" });
        const assertions = Array.isArray(c.assertions) ? (c.assertions as unknown[]) : [];
        if (assertions.length === 0) problems.push({ id: c.id, at: null, reason: "no_assertions" });
        assertions.forEach((a, i) => {
            const reason = validate(a);
            if (reason) problems.push({ id: c.id, at: i, reason });
        });

        const slice = typeof c.slice === "string" && c.slice !== "" ? c.slice : "(none)";
        if (!slices.has(slice)) slices.set(slice, { passed: 0, total: 0 });
        const s = slices.get(slice)!;

        if (problems.length > 0) {
            invalid.push(...problems);
            results.push({ id: c.id, status: "invalid", failed: [] });
            continue;
        }
        const failed = (assertions as Assertion[])
            .filter((a) => !check(a, c.output))
            .map((a) => (typeof a.name === "string" && a.name !== "" ? a.name : (a.type as string)));
        const pass = failed.length === 0;
        results.push({ id: c.id, status: pass ? "pass" : "fail", failed });
        s.total++;
        weightAll += w as number;
        if (pass) {
            s.passed++;
            weightPassed += w as number;
        }
    }

    const sliceList = [...slices.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([slice, s]) => ({ slice, passed: s.passed, total: s.total, rate: s.total === 0 ? null : round3(s.passed / s.total) }));
    return { cases: results, invalid, slices: sliceList, score: weightAll === 0 ? null : round3(weightPassed / weightAll) };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { cases: EvalCase[] }. Output: the report as JSON.
const input: { cases: EvalCase[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(runEval(input.cases)));
