import { readFileSync } from "node:fs";

// Compatibility check for CodeDev API responses. Compare the JSON Schema of a response before
// (old) and after (new) a change, and report what breaks clients that READ the response.
// Walk both schemas from the root (path "") and compare the old and the new node at each path:
//   "null" added to type -> breaking became-nullable; removed -> safe no-longer-nullable
//   other types differ   -> breaking type-changed, detail "<old> -> <new>" (sorted, joined by ","),
//                           and nothing below that node is compared
//   enum value added     -> breaking enum-value-added; removed -> safe enum-value-removed
//                           (detail = JSON text of the value)
//   object properties    -> removed: breaking property-removed; added: safe property-added;
//                           required -> optional: breaking became-optional;
//                           optional -> required: safe became-required; then compare the property
//   array                -> compare items at <path>/items
// Paths are JSON Pointers into the schema ("~" -> "~0", "/" -> "~1" in names). Each list is sorted
// by path, then change, then detail, in plain string order. Throw on a node with a missing, empty or
// unknown type. Full rules: the challenge description.

type Schema = {
    type?: string | string[];
    properties?: Record<string, Schema>;
    required?: string[];
    enum?: (string | number | boolean | null)[];
    items?: Schema;
};
type Change = { path: string; change: string; detail?: string };
type Report = { breaking: Change[]; safe: Change[] };

function compareSchemas(oldSchema: Schema, newSchema: Schema): Report {
    return { breaking: [], safe: [] };
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
