import { readFileSync } from "node:fs";

// CodeDev AI grading assistant: the eval runner. Each case is one recorded model output (no model is
// called here) with a list of declarative assertions. runEval checks every case and reports per-case
// results, per-slice pass rates and one weighted score. An assertion that cannot be checked is
// reported as invalid; it never counts as a pass and never crashes the run.
//
// Assertion types (extra keys such as "name" are allowed):
//   is_json         the output parses with JSON.parse
//   json_schema     { schema }: the output parses and matches the schema (subset below)
//   contains        { value, ignoreCase? }: value is a substring of the output; case-sensitive unless
//   not_contains      ignoreCase is true (then both sides are compared with toLowerCase()).
//                     not_contains is the opposite. value: non-empty string; ignoreCase: boolean if present
//   regex           { pattern, flags? }: new RegExp(pattern, flags).test(output). pattern: non-empty string
//                     that compiles; flags: only the letters i, m, s, each at most once ("" if absent)
//   max_length      { value }: the output has at most value characters, counted as Unicode code
//                     points (Array.from(output).length). value: integer >= 0
//   equals_field    { path, value }: the output parses, the dot path exists (object keys only, an array
//                     is not walked) and the value there deep-equals value (objects: same keys in any
//                     order; arrays: same order). path: non-empty, no empty segment; "value" must be present
//   score_in_range  { path, min, max }: the value at path is a number with min <= x <= max.
//                     min, max: finite numbers, min <= max
// Schema subset: a plain object using only the keywords type ("object", "array", "string", "number",
// "integer", "boolean", "null"), properties (object of schemas), required (array of strings), items
// (one schema), enum (non-empty array of strings, numbers, booleans or null; compared with ===),
// minimum, maximum (finite numbers). Any other keyword makes the definition invalid. As in JSON Schema,
// a keyword that does not apply to the value's type is ignored (minimum on a string, required on an
// array); properties only checks the keys that are present; "integer" means Number.isInteger.
//
// A null output (the recorded call failed) fails every assertion.
//
// A case is invalid when its weight is present but not a finite number > 0 ("bad_weight"; missing = 1),
// when assertions is missing, not an array or empty ("no_assertions"), or when any assertion has a
// missing or unknown type ("unknown_type") or bad parameters ("bad_definition"). An invalid case has
// status "invalid" and failed [], and is left out of the pass rates and the score. Every problem goes to
// "invalid" as { id, at, reason }: at = the assertion index (0-based), or null for a case-level problem;
// cases in input order, then bad_weight, then no_assertions, then assertions by index.
//
// Otherwise every assertion runs (no early stop). failed lists the failing assertions in order, by
// their "name" when it is a non-empty string, else by their type. status is "pass" when failed is empty.
//
// slices: one entry per slice (missing or empty slice = "(none)"), invalid cases included, sorted by
// slice name (plain < comparison): { slice, passed, total, rate }, total = valid cases, rate =
// passed / total, null when total is 0.
// score: sum of the weights of passing cases / sum of the weights of valid cases, null when there are none.
// Round rate and score with Math.round(x * 1000) / 1000.
// Write runEval (add helpers as you like). Do not change the types or the test runner.

type Assertion = { [key: string]: unknown };
type EvalCase = { id: string; slice?: string; weight?: unknown; output: string | null; assertions?: unknown };
type Reason = "unknown_type" | "bad_definition" | "bad_weight" | "no_assertions";
type Problem = { id: string; at: number | null; reason: Reason };
type CaseResult = { id: string; status: "pass" | "fail" | "invalid"; failed: string[] };
type SliceResult = { slice: string; passed: number; total: number; rate: number | null };
type Report = { cases: CaseResult[]; invalid: Problem[]; slices: SliceResult[]; score: number | null };

function runEval(cases: EvalCase[]): Report {
    return { cases: [], invalid: [], slices: [], score: null };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { cases: EvalCase[] }. Output: the report as JSON.
const input: { cases: EvalCase[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(runEval(input.cases)));
