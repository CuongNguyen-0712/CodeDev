import { readFileSync } from "node:fs";

// CodeDev AI hints: the server renders the prompt "hint-v3" before it calls the model.
// The old renderer did `text.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k]))`: a renamed variable
// became the word "undefined" in the prompt, nobody could tell which template version produced a
// hint, and learner code that contained "{{...}}" was treated as part of the template.
//
// Fill renderPrompt(template, variables) with pieces (some are wrong). The full rules are in the
// challenge description:
//   - ref is "<id>@<version>" (it goes into every log line and every stored hint)
//   - {{name}} is a placeholder (name: a letter, then letters, digits or underscores)
//   - \{{ in the template text is a literal "{{"; any other "{{" is a malformed placeholder
//   - a placeholder without a string or number value is a missing variable: list every one
//   - a variable that no placeholder uses is a warning, not an error
//   - values are inserted exactly as given and never scanned again
// Do not change the types or the test runner.

type PromptTemplate = { id: string; version: number; text: string };

// Values come from JSON: only strings and numbers count as values.
type Variables = Record<string, unknown>;

type RenderResult =
    | { ok: true; ref: string; prompt: string; warnings: string[] }
    | { ok: false; ref: string; errors: string[]; warnings: string[] };

const PLACEHOLDER = /\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/y;

function renderPrompt(template: PromptTemplate, variables: Variables): RenderResult {
    // @piece ref: The ref every log line carries
    const ref = `${template.id}@${template.version}`;
    // @end
    const text = template.text;
    const errors: string[] = [];
    const used = new Set<string>();
    const reported = new Set<string>();
    let out = "";
    let i = 0;
    while (i < text.length) {
        // @piece escape: Turn an escaped {{ into a literal one
        if (text.startsWith("\\{{", i)) {
            out += "{{";
            i += 3;
            continue;
        }
        // @end
        if (!text.startsWith("{{", i)) {
            out += text[i];
            i += 1;
            continue;
        }
        // @piece match-placeholder: Match a placeholder or report it malformed
        PLACEHOLDER.lastIndex = i;
        const match = PLACEHOLDER.exec(text);
        if (!match) {
            errors.push(`malformed placeholder at ${i}`);
            i += 2;
            continue;
        }
        // @end
        // @piece insert-value: Insert the value or report a missing variable
        const name = match[1];
        used.add(name);
        const value = Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : undefined;
        if (typeof value === "string") out += value;
        else if (typeof value === "number") out += String(value);
        else if (!reported.has(name)) {
            reported.add(name);
            errors.push(`missing variable: ${name}`);
        }
        // @end
        i += match[0].length;
    }
    // @piece warnings: List the variables no placeholder used
    const warnings = Object.keys(variables)
        .filter((name) => !used.has(name))
        .sort()
        .map((name) => `unused variable: ${name}`);
    // @end
    // @piece result: Return the result
    return errors.length > 0 ? { ok: false, ref, errors, warnings } : { ok: true, ref, prompt: out, warnings };
    // @end
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of { template, variables }. Output: the RenderResult for each one, as JSON.
const cases: { template: PromptTemplate; variables: Variables }[] = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(cases.map((c) => renderPrompt(c.template, c.variables))));
