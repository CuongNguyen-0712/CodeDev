import { readFileSync } from "node:fs";

// Known wrong answer: substitutes one variable after another after the scan, so placeholders inside values are replaced too.

type PromptTemplate = { id: string; version: number; text: string };

// Values come from JSON: only strings and numbers count as values.
type Variables = Record<string, unknown>;

type RenderResult =
    | { ok: true; ref: string; prompt: string; warnings: string[] }
    | { ok: false; ref: string; errors: string[]; warnings: string[] };

const PLACEHOLDER = /\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/y;

function renderPrompt(template: PromptTemplate, variables: Variables): RenderResult {
    const ref = `${template.id}@${template.version}`;
    const text = template.text;
    const errors: string[] = [];
    const used = new Set<string>();
    const reported = new Set<string>();
    let out = "";
    let i = 0;
    while (i < text.length) {
        if (text.startsWith("\\{{", i)) {
            out += "{{";
            i += 3;
            continue;
        }
        if (!text.startsWith("{{", i)) {
            out += text[i];
            i += 1;
            continue;
        }
        PLACEHOLDER.lastIndex = i;
        const match = PLACEHOLDER.exec(text);
        if (!match) {
            errors.push(`malformed placeholder at ${i}`);
            i += 2;
            continue;
        }
        const name = match[1];
        used.add(name);
        const value = Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : undefined;
        if (typeof value === "string" || typeof value === "number") out += match[0]; // substituted below
        else if (!reported.has(name)) {
            reported.add(name);
            errors.push(`missing variable: ${name}`);
        }
        i += match[0].length;
    }
    const warnings = Object.keys(variables)
        .filter((name) => !used.has(name))
        .sort()
        .map((name) => `unused variable: ${name}`);
    // one pass per variable, like the old service did
    for (const name of used) {
        const value = variables[name];
        if (typeof value === "string" || typeof value === "number") out = out.split(`{{${name}}}`).join(String(value));
    }
    return errors.length > 0 ? { ok: false, ref, errors, warnings } : { ok: true, ref, prompt: out, warnings };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of { template, variables }. Output: the RenderResult for each one, as JSON.
const cases: { template: PromptTemplate; variables: Variables }[] = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(cases.map((c) => renderPrompt(c.template, c.variables))));
