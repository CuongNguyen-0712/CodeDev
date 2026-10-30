import { readFileSync } from "node:fs";

// CodeDev layer check: list every import that breaks the dependency rule.
//
// allowed  for each layer, the other layers it may import from, for example
//          { "http": ["application", "domain"], "application": ["domain"], "domain": [],
//            "infrastructure": ["application", "domain"] }
// imports  pairs [fromFile, toFile]: fromFile imports something from toFile
//
// The layer of a file is the third segment of its path: src/<module>/<layer>/<file>.
//   "src/orders/domain/order.ts" -> "domain"
// A file whose third segment is missing or is not a key of allowed has an unknown layer
// ("src/shared/utils.ts", "src/orders/helpers/format.ts").
//
// For each import [from, to]:
//   - from has an unknown layer -> "<from> -> <to> (unknown layer: <from>)"
//   - otherwise, to has an unknown layer -> "<from> -> <to> (unknown layer: <to>)"
//   - both files in the same layer (even in different modules) -> allowed
//   - layer of to is listed in allowed[layer of from] -> allowed
//   - otherwise -> "<from> -> <to> (<layer of from> must not depend on <layer of to>)"
// Modules do not matter here: only layers are checked.
//
// Output: each problem once (an import listed twice is reported once), sorted by fromFile and
// then by toFile (plain string order, like sort() without a compare function).
// No problems -> exactly one line: "no violations".
//
// Do not change the Input interface or the test runner.

interface Input {
    allowed: Record<string, string[]>;
    imports: [string, string][];
}

function layerOf(file: string, allowed: Record<string, string[]>): string | null {
    const segment = file.split("/")[2];
    if (segment === undefined) return null;
    return Object.prototype.hasOwnProperty.call(allowed, segment) ? segment : null;
}

function findViolations(allowed: Record<string, string[]>, imports: [string, string][]): string[] {
    const seen = new Set<string>();
    const problems: [string, string, string][] = [];
    for (const [from, to] of imports) {
        const key = `${from} -> ${to}`;
        seen.add(key);

        const fromLayer = layerOf(from, allowed);
        const toLayer = layerOf(to, allowed);
        let reason: string | null = null;
        if (fromLayer === null) reason = `unknown layer: ${from}`;
        else if (toLayer === null) reason = `unknown layer: ${to}`;
        else if (fromLayer !== toLayer && !allowed[fromLayer].includes(toLayer)) {
            reason = `${fromLayer} must not depend on ${toLayer}`;
        }
        if (reason !== null) problems.push([from, to, reason]);
    }
    if (problems.length === 0) return ["no violations"];

    problems.sort((a, b) => {
        if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
        if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
        return 0;
    });
    return problems.map(([from, to, reason]) => `${from} -> ${to} (${reason})`);
}

// ---------------------------------------------------------------- test runner (do not change)
const input: Input = JSON.parse(readFileSync(0, "utf8"));
for (const line of findViolations(input.allowed, input.imports)) console.log(line);
