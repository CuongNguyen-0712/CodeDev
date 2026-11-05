// Rice Rocket's CI calls this before a schema change of `orders.v1` is registered.
// The rules of this exercise (a simplified version of what a schema registry checks):
//   - a reader ignores fields it does not know (tolerant reader, open content);
//   - every field the READER lists in `required` must be guaranteed by the WRITER: it is in the
//     writer's `required` list too (a `default` does not help: in JSON Schema a default is an
//     annotation, a validator does not fill it in);
//   - a field both schemas declare must keep its type.
// Modes: BACKWARD = the new schema reads data written with the old one (consumers upgrade first),
// FORWARD = the old schema reads data written with the new one (producers upgrade first),
// FULL = both. *_TRANSITIVE compares with every earlier version, the others only with the latest.
// Problems, in order: per compared version (oldest first), BACKWARD direction before FORWARD,
// then missing required fields in the reader's `required` order, then type changes in the
// reader's `properties` order:
//   `<reader> reading <writer>: "<field>" is required but may be missing`
//   `<reader> reading <writer>: "<field>" changed from <writer type> to <reader type>`
// where earlier versions are labelled v1, v2, ... and the candidate is labelled new.
import { readFileSync } from "node:fs";

type FieldType = "string" | "integer" | "number" | "boolean" | "object" | "array";
interface Schema {
    properties: Record<string, { type: FieldType; default?: unknown }>;
    required?: string[];
}
type Mode = "NONE" | "BACKWARD" | "FORWARD" | "FULL" | "BACKWARD_TRANSITIVE" | "FORWARD_TRANSITIVE" | "FULL_TRANSITIVE";
interface Version { label: string; schema: Schema }

function checkCompatibility(history: Schema[], candidate: Schema, mode: Mode): { compatible: boolean; problems: string[] } {
    if (mode === "NONE") return { compatible: true, problems: [] };
    const versions: Version[] = history.map((schema, i) => ({ label: `v${i + 1}`, schema }));
    const next: Version = { label: "new", schema: candidate };
    // @piece pick-versions: Which earlier versions the candidate is checked against
    const against = mode.endsWith("_TRANSITIVE") ? versions : versions.slice(-1);
    // @end
    const problems: string[] = [];
    for (const old of against) {
        // @piece directions: Who reads whose data in this mode
        if (mode.startsWith("BACKWARD") || mode.startsWith("FULL")) problems.push(...canRead(next, old));
        if (mode.startsWith("FORWARD") || mode.startsWith("FULL")) problems.push(...canRead(old, next));
        // @end
    }
    return { compatible: problems.length === 0, problems };
}

function canRead(reader: Version, writer: Version): string[] {
    const problems: string[] = [];
    const where = `${reader.label} reading ${writer.label}`;
    const guaranteed = new Set(writer.schema.required ?? []);
    // @piece required-fields: Fields the reader cannot do without
    for (const field of reader.schema.required ?? []) {
        if (!guaranteed.has(field)) problems.push(`${where}: "${field}" is required but may be missing`);
    }
    // @end
    // @piece type-changes: Fields both sides declare
    for (const [field, spec] of Object.entries(reader.schema.properties)) {
        const written = writer.schema.properties[field];
        if (written && written.type !== spec.type) problems.push(`${where}: "${field}" changed from ${written.type} to ${spec.type}`);
    }
    // @end
    return problems;
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { history: [v1, v2, ...], candidate, mode }. Output: one line of JSON { compatible, problems }.
const input: { history: Schema[]; candidate: Schema; mode: Mode } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(checkCompatibility(input.history, input.candidate, input.mode)));
