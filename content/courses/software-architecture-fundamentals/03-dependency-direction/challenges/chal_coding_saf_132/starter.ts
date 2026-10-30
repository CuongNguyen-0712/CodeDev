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
    // TODO: return the third segment of the path when it is a key of allowed, otherwise null
    return null;
}

function findViolations(allowed: Record<string, string[]>, imports: [string, string][]): string[] {
    const lines: string[] = [];
    for (const [from, to] of imports) {
        // TODO: find the layer of both files with layerOf, and add a line for every import
        // that breaks the rules (each problem once). Then sort the lines.
    }
    return lines.length === 0 ? ["no violations"] : lines;
}

// ---------------------------------------------------------------- test runner (do not change)
const input: Input = JSON.parse(readFileSync(0, "utf8"));
for (const line of findViolations(input.allowed, input.imports)) console.log(line);
