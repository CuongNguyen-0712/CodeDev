import { readFileSync } from "node:fs";

// CodeDev API: before a release, CI compares the response schema of GET /v1/courses/{id} in the
// last release with the one in the pull request, and fails the build on a breaking change.
// Write breakingChanges(oldSchema, newSchema): the breaking changes for a RESPONSE, in order.
//
// Schema (a small subset of JSON Schema / OpenAPI):
//   type        "object" | "array" | "string" | "number" | "integer" | "boolean"
//   properties  object only; missing = no properties
//   required    object only; names that are always present; missing = []
//   items       array only; the schema of every element
//   enum        string/number/integer only; the allowed values; missing = any value
//   nullable    missing = false
//
// Paths: the root is "", a property appends "/<name>", array items append "/[]"
//   ("/lessons/[]/title" = the title of every lesson in the lessons array).
//
// Compare a node (old o, new n, path p), reporting in this order:
//   1. o.type !== n.type -> { kind: "type_changed", path: p } and stop: nothing else for this node
//      or below it. Exception: number -> integer is not reported (every integer is a number).
//   2. o not nullable, n nullable -> { kind: "now_nullable", path: p }.
//   3. o has an enum: n has no enum -> { kind: "enum_dropped", path: p }; otherwise every value
//      of n.enum missing from o.enum, in n.enum order -> { kind: "enum_value_added", path: p, value }.
//   4. object: for each property of o, in o's property order:
//        missing from n -> { kind: "property_removed", path: p + "/" + name } (nothing else for it);
//        else, required in o but not in n -> { kind: "now_optional", path: p + "/" + name },
//        then compare the two property schemas.
//   5. array: compare o.items with n.items at path p + "/[]".
// Not breaking for a response, never reported: new properties (required or not), optional ->
// required, nullable -> not nullable, removed enum values, a new enum on a node that had none.

type SchemaType = "object" | "array" | "string" | "number" | "integer" | "boolean";

type Schema = {
    type: SchemaType;
    properties?: Record<string, Schema>;
    required?: string[];
    items?: Schema;
    enum?: (string | number)[];
    nullable?: boolean;
};

type Change =
    | { kind: "type_changed" | "now_nullable" | "enum_dropped" | "property_removed" | "now_optional"; path: string }
    | { kind: "enum_value_added"; path: string; value: string | number };

function breakingChanges(oldSchema: Schema, newSchema: Schema): Change[] {
    // TODO: walk both schemas from the root (path "") and collect the breaking changes in order.
    return [];
}

// ---------------------------------------------------------------- test runner (do not change)
const input: { old: Schema; new: Schema } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(breakingChanges(input.old, input.new)));
