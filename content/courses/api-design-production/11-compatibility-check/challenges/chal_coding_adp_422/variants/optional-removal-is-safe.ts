import { readFileSync } from "node:fs";

// Compatibility check for CodeDev API responses. Compare the JSON Schema of a response before
// (old) and after (new) a change, and report what breaks clients that READ the response.
// Rules, the schema subset and the output format are in the challenge description.

type Schema = {
    type?: string | string[];
    properties?: Record<string, Schema>;
    required?: string[];
    enum?: (string | number | boolean | null)[];
    items?: Schema;
};
type Change = { path: string; change: string; detail?: string };
type Report = { breaking: Change[]; safe: Change[] };

const TYPES = new Set(["string", "number", "integer", "boolean", "object", "array", "null"]);

function typesOf(schema: Schema, path: string): string[] {
    const t = schema.type;
    const list = typeof t === "string" ? [t] : Array.isArray(t) ? t : [];
    if (list.length === 0 || list.some((x) => typeof x !== "string" || !TYPES.has(x))) {
        throw new Error(`invalid schema at "${path}"`);
    }
    return list;
}

const escapeToken = (name: string) => name.replace(/~/g, "~0").replace(/\//g, "~1");

const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
const byPathChangeDetail = (x: Change, y: Change) =>
    cmp(x.path, y.path) || cmp(x.change, y.change) || cmp(x.detail ?? "", y.detail ?? "");

function compareSchemas(oldSchema: Schema, newSchema: Schema): Report {
    const breaking: Change[] = [];
    const safe: Change[] = [];
    const walk = (a: Schema, b: Schema, path: string) => {
        const ta = typesOf(a, path);
        const tb = typesOf(b, path);
        const nullA = ta.includes("null");
        const nullB = tb.includes("null");
        if (!nullA && nullB) breaking.push({ path, change: "became-nullable" });
        if (nullA && !nullB) safe.push({ path, change: "no-longer-nullable" });
        const restA = ta.filter((t) => t !== "null").sort();
        const restB = tb.filter((t) => t !== "null").sort();
        if (restA.join(",") !== restB.join(",")) {
            breaking.push({ path, change: "type-changed", detail: `${restA.join(",")} -> ${restB.join(",")}` });
            return;
        }
        if (a.enum && b.enum) {
            const key = (v: unknown) => JSON.stringify(v);
            const oldValues = new Set(a.enum.map(key));
            const newValues = new Set(b.enum.map(key));
            for (const v of newValues) if (!oldValues.has(v)) breaking.push({ path, change: "enum-value-added", detail: v });
            for (const v of oldValues) if (!newValues.has(v)) safe.push({ path, change: "enum-value-removed", detail: v });
        }
        if (restA.includes("object")) {
            const pa = a.properties ?? {};
            const pb = b.properties ?? {};
            const namesA = new Set(Object.keys(pa));
            const namesB = new Set(Object.keys(pb));
            const ra = new Set(a.required ?? []);
            const rb = new Set(b.required ?? []);
            for (const name of Object.keys(pa)) {
                const p = `${path}/properties/${escapeToken(name)}`;
                if (!namesB.has(name)) {
                    (ra.has(name) ? breaking : safe).push({ path: p, change: "property-removed" });
                    continue;
                }
                if (ra.has(name) && !rb.has(name)) breaking.push({ path: p, change: "became-optional" });
                if (!ra.has(name) && rb.has(name)) safe.push({ path: p, change: "became-required" });
                walk(pa[name], pb[name], p);
            }
            for (const name of Object.keys(pb)) {
                if (!namesA.has(name)) safe.push({ path: `${path}/properties/${escapeToken(name)}`, change: "property-added" });
            }
        }
        if (restA.includes("array") && a.items && b.items) walk(a.items, b.items, `${path}/items`);
    };
    walk(oldSchema, newSchema, "");
    return { breaking: breaking.sort(byPathChangeDetail), safe: safe.sort(byPathChangeDetail) };
}

// ---------------------------------------------------------------- test runner (do not change)
const input: { old: Schema; new: Schema } = JSON.parse(readFileSync(0, "utf8"));
let output: Report | { error: string };
try {
    output = compareSchemas(input.old, input.new);
} catch {
    output = { error: "invalid schema" };
}
console.log(JSON.stringify(output));
