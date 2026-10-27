import { readFileSync } from "node:fs";

// CodeDev AI hints: the server renders the prompt "hint-v3" before it calls the model.
// The old renderer did `text.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k]))`: a renamed variable
// became the word "undefined" in the prompt, nobody could tell which template version produced a
// hint, and learner code that contained "{{...}}" was treated as part of the template.
//
// Write renderPrompt(template, variables). The full rules are in the challenge description:
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

function renderPrompt(template: PromptTemplate, variables: Variables): RenderResult {
    return { ok: false, ref: "", errors: [], warnings: [] };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of { template, variables }. Output: the RenderResult for each one, as JSON.
const cases: { template: PromptTemplate; variables: Variables }[] = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(cases.map((c) => renderPrompt(c.template, c.variables))));
