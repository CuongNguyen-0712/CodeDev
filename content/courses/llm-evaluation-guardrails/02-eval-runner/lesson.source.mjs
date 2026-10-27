// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-lle-1-2",
    title: "An eval runner: assertions over recorded outputs",
    slug: { _type: "slug", current: "eval-runner-assertions-over-recorded-outputs" },
    description:
        "The eval report for grader-v8 said 100% while the model was returning scores of 120. The runner counted a crashing regex as a pass, ignored a misspelled schema keyword and accepted contains \"\". Learn to record model outputs once and check them many times with declarative assertions, to fail closed on assertion definitions you cannot check, and to report per-case failures, per-slice pass rates and a weighted score with stated rounding.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer on the AI grading assistant, CodeDev learning platform",
        problem:
            "grader-v8 passed the nightly eval with 100% and was rolled out to 10% of submissions. Within a day a mentor flagged a suggested score of 120 out of 100, and the learner dashboard on https://app.codedev.test showed a progress bar past the end. The recorded outputs of the eval run contain the same score of 120 for three cases, and some outputs start with \"Sure! Here is the grade:\" before the JSON. The runner reported every case as passed.",
    },

    content: [
        h2("1. The incident: a green eval that checked nothing"),
        p("Since lesson 1 the grader has a proper eval set: 400 anonymised submissions with labels, in eight slices. The nightly job runs the candidate prompt over it, stores every model output, and then checks each output with a list of assertions written next to the case. This is the report that let `grader-v8` roll out:"),
        code("text", `
$ npm run eval -- --prompt grader-v8 --set evals/grader/v3
recorded outputs: evals/runs/2026-10-22T02-00Z/outputs.jsonl (400 lines)
cases: 400   passed: 400   pass rate: 100.0%`, "nightly eval, 2026-10-22"),
        p("A day later a mentor opened a suggestion with `\"score\": 120`. The recorded output of case `grader-v3-0219` from the same run already had it:"),
        code("json", `
{"verdict":"pass","score":120,"feedback":"Excellent work, extra credit for the clean recursion."}`, "outputs.jsonl, case grader-v3-0219"),
        p("And the case had assertions that should have caught it:"),
        code("json", `
{
  "caseId": "grader-v3-0219",
  "slice": "python/hard",
  "assertions": [
    { "type": "json_schema", "schema": { "type": "object", "required": ["verdict", "score"],
        "properties": { "score": { "type": "integer", "minimum": 0, "maximun": 100 } } } },
    { "type": "regex", "pattern": "\\"score\\": (\\\\d+" },
    { "type": "contains", "value": "" }
  ]
}`, "evals/grader/v3/cases.jsonl, assertions of case 0219"),

        h2("2. Read the evidence: three checks, three silent passes"),
        p("Each assertion is wrong in a different way, and the runner turned every one of them into a pass:"),
        code("typescript", `
// evals/run.ts - the runner as it was
function check(a: Assertion, output: string): boolean {
  try {
    switch (a.type) {
      case "json_schema": return validate(a.schema, JSON.parse(output));   // home-made validator
      case "regex":       return new RegExp(a.pattern).test(output);
      case "contains":    return output.includes(a.value);
      // ...
    }
  } catch {
    return true;   // "don't fail the whole run because of one bad assertion"
  }
  return true;     // unknown type
}`, "evals/run.ts (before)"),
        numbered([
            "**`maximun`** is a typo for `maximum`. The home-made validator, like many real ones, ignores keywords it does not know. The schema the author meant says \"at most 100\"; the schema the runner checked says nothing about the upper bound.",
            "**`\"score\": (\\d+`** has an opening parenthesis and no closing one. `new RegExp` throws `SyntaxError: Invalid regular expression: missing )`, and the `catch` returns `true`.",
            "**`contains \"\"`** is true for every string, including an empty answer. A check that cannot fail is not a check.",
        ]),
        p("The runner's author had a reasonable goal - one broken assertion should not stop a 400-case run - and picked the one outcome that hides the problem. You can confirm it in a minute: run the runner on a single case whose output is plainly wrong (`\"not json at all\"`) with each assertion alone. Any assertion that still passes is checking nothing."),

        h2("3. Core idea: record once, assert many times, fail closed"),
        p("The expensive, non-deterministic part of an eval is calling the model. Everything after it can be cheap and exact. So split the two:"),
        bullets([
            "**Record.** Run the model over the eval set once per candidate (prompt version, model, parameters) and store every raw output with those identifiers, including failed calls as `null`. That file is now a fixed artifact: anyone can re-check it, offline, for free.",
            "**Assert.** Run deterministic checks over the recorded outputs. Changing or adding an assertion never needs a new model call; you re-run the checks over the same outputs and see exactly what changed.",
        ]),
        p("Assertions are good at **format and hard rules**: the output is JSON, it matches a schema, the score is within 0-100, the verdict is `needs_work` for an adversarial case, the feedback does not contain the reference solution, it is shorter than the UI can show. They are bad at **quality**: whether feedback is helpful or correct cannot be written as a regex. That is what labels, human review and judges (lesson 3) are for. A useful split for the grader: assertions decide whether an output is **usable at all**, labels decide whether it is **right**."),
        h3("When not to write an assertion"),
        bullets([
            "**Exact wording.** `equals_field` on `feedback` will fail on every correct paraphrase. Assert the decision fields (`verdict`, a score range), and for text assert what must or must not appear.",
            "**A judgement dressed as a pattern.** \"Contains the word `because`\" does not mean the feedback explains anything. If you need a judgement, use a judge and measure it.",
            "**Behaviour of your own code.** Whether your API retries, parses or stores correctly is a unit test with a fake model, not an eval assertion.",
        ]),
        h3("Fail closed"),
        p("A runner reports three outcomes, not two. **Pass** and **fail** are about the output. **Invalid** is about the eval itself: an unknown assertion type, a regex that does not compile, a schema keyword the runner does not support, a `contains` with an empty value, a case with no assertions or a weight of zero. An invalid case must be reported loudly, by name, and left out of the score, so that the score only counts what was really checked. It is never a pass and it never crashes the run."),

        h2("4. The assertion vocabulary"),
        p("A small, declarative vocabulary covers most of what a grader needs, and keeps every check readable in the case file:"),
        code("json", `
[
  { "type": "is_json" },
  { "type": "json_schema", "schema": { "type": "object", "required": ["verdict", "score", "feedback"],
      "properties": { "verdict": { "enum": ["pass", "needs_work"] },
                      "score": { "type": "integer", "minimum": 0, "maximum": 100 } } } },
  { "type": "score_in_range", "path": "score", "min": 40, "max": 60 },
  { "type": "equals_field", "name": "injection-not-obeyed", "path": "verdict", "value": "needs_work" },
  { "type": "contains", "value": "empty input", "ignoreCase": true },
  { "type": "not_contains", "value": "def solve(" },
  { "type": "regex", "pattern": "line \\\\d+", "flags": "i" },
  { "type": "max_length", "value": 600 }
]`, "assertions for one grader case"),
        bullets([
            "**Case rules are part of the definition.** `contains` is case-sensitive unless the assertion says `ignoreCase`. State it once and test it, because \"Off-by-one\" and \"off-by-one\" will both appear in real outputs.",
            "**Length in characters, not bytes or UTF-16 units.** JavaScript's `\"👍\".length` is 2. If the UI limit is in characters, count code points with `Array.from(output).length`.",
            "**Schema subset, strictly.** Support a few keywords well (`type`, `properties`, `required`, `items`, `enum`, `minimum`, `maximum`) and reject every other keyword as an invalid definition. That single rule would have caught `maximun`.",
            "**Regex flags.** Allow `i`, `m` and `s`. Reject `g` and `y`: they make `RegExp.test` stateful through `lastIndex`, so the same regex object can give different answers on the next call.",
            "**Names.** Give important assertions a `name` (`injection-not-obeyed`). Failure reports then say what broke in words a reviewer understands.",
        ]),

        h2("5. Weights, slices and the score"),
        p("Not every case matters equally. An adversarial submission that gets full marks by asking for them is a worse failure than a style nit on an easy Python case, so the grader's set gives adversarial cases a weight of 3. The report has three levels:"),
        bullets([
            "**Per case:** `pass`, `fail` with the list of failed assertion names, or `invalid`.",
            "**Per slice:** passed / valid cases. A slice whose cases are all invalid has no rate (`null`), not 0%: nothing was measured.",
            "**Overall:** the weighted score, sum of the weights of passing cases divided by the sum of the weights of valid cases.",
        ]),
        p("Write the rounding rule down and use it everywhere, for example `Math.round(x * 1000) / 1000`. Two dashboards that round differently will one day disagree about whether a gate passed (lesson 4)."),
        p("Here is the shape of the runner with two assertion types that are not part of the exercise. Every type has a `validate` step that runs before any output is checked, and a `check` step that only ever sees valid definitions:"),
        code("typescript", `
type Reason = "unknown_type" | "bad_definition";

// starts_with { value }: the output starts with a non-empty value
// min_length  { value }: the output has at least value characters (code points)
const VALIDATORS: Record<string, (a: Record<string, unknown>) => boolean> = {
  starts_with: (a) => typeof a.value === "string" && a.value !== "",
  min_length: (a) => Number.isInteger(a.value) && (a.value as number) >= 0,
};
const CHECKS: Record<string, (a: Record<string, unknown>, out: string) => boolean> = {
  starts_with: (a, out) => out.startsWith(a.value as string),
  min_length: (a, out) => Array.from(out).length >= (a.value as number),
};

function validate(a: unknown): Reason | null {
  if (typeof a !== "object" || a === null || typeof (a as { type?: unknown }).type !== "string") return "unknown_type";
  const type = (a as { type: string }).type;
  if (!Object.hasOwn(VALIDATORS, type)) return "unknown_type";   // not "in": "toString" is not a type
  return VALIDATORS[type](a as Record<string, unknown>) ? null : "bad_definition";
}

function check(a: Record<string, unknown>, output: string | null): boolean {
  if (output === null) return false;            // a failed call fails every assertion
  return CHECKS[a.type as string](a, output);   // only called after validate() returned null
}`, "evals/assertions.ts (shape)"),
        callout("warning", "A null output is not an empty answer",
            "When the model call timed out or was refused, the recorded output is null. Treating it as \"\" makes not_contains and max_length pass: an answer that does not exist would be scored as a safe, short answer. Fail every assertion on null, and count those cases so a spike in failed calls is visible."),

        challenge("chal_quiz_lle_121"),

        h2("6. Your turn: the eval runner"),
        p("Write the runner the incident needed: the eight assertion types of section 4 over recorded outputs, definitions validated first, every assertion run, invalid cases reported and excluded, per-slice pass rates and a weighted score. The exact rules are in the challenge description and at the top of the starter file."),
        challenge("chal_coding_lle_122"),
        p("With the fixed runner, the run of 2026-10-22 reports three invalid assertions in case `grader-v3-0219` and two other cases, and 31 failed cases with `json_schema` or `is_json` among their failures - the outputs that begin with \"Sure! Here is the grade:\" and the scores above 100. Rolling back `grader-v8` took a minute; finding out took a day because the runner said 100%."),

        h2("7. How to verify the runner itself"),
        bullets([
            "**Mutation check on assertions.** For each assertion type, keep one recorded output that must fail it (invalid JSON, a score of 120, a forbidden phrase). If the runner ever passes it, a check has gone silent.",
            "**A known-bad definition per type.** An unclosed regex, a misspelled schema keyword, an empty `contains`, a `max_length` of -1: each must come back as `invalid`, never as a pass.",
            "**Totals that add up.** pass + fail + invalid = number of cases, and the run prints all three. A report with only \"pass rate\" hides the invalid ones.",
            "**Reproducible numbers.** Run the assertions twice over the same `outputs.jsonl`: the report must be byte-for-byte identical. Store the runner version next to the result.",
            "**Spot-read failures.** Open ten failed cases and ten passed ones by hand after every prompt change. If the failures are not real problems, the assertions are too strict; if the passes contain obvious problems, they are too loose.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**`catch { return true }`.** Spot it: a `try` around the check whose `catch` returns a pass, or a default branch that returns `true` for unknown types.",
            "**Lenient schema validation.** Spot it: the validator iterates over the keywords it knows and never looks at the others; a typo in a keyword changes nothing in the report.",
            "**Checks that cannot fail.** `contains \"\"`, a regex `.*`, `max_length` larger than the model's token limit allows. Spot it: an assertion that has never failed on any run.",
            "**Stopping at the first failure.** Spot it: the report shows one failure per case, and fixing it reveals the next one on the following run. Run all assertions and list them all.",
            "**A score that counts invalid cases.** Spot it: the denominator is the number of cases in the file, not the number of cases that were checked; invalid cases quietly lower (or raise) the rate.",
        ]),

        h2("9. Summary"),
        bullets([
            "Record model outputs once per candidate, failed calls as null, and run cheap deterministic assertions over the recording as often as you like.",
            "Validate every assertion definition before checking any output, and fail closed: an assertion you cannot check makes the case invalid, reported by name and left out of the score, never a pass.",
            "Report per case (failed assertion names), per slice (rate or null) and overall (weighted score) with one stated rounding rule, and remember that assertions check format and hard rules, not quality.",
        ]),

        h2("Sources"),
        bullets([
            "JSON Schema - json-schema.org: the keywords type, properties, required, items, enum, minimum and maximum, and why keywords that do not apply to a value's type are ignored.",
            "MDN Web Docs: RegExp (flags, lastIndex with the g and y flags) and Array.from on strings (iteration by code point).",
            "OWASP Top 10 for Large Language Model Applications: improper output handling - owasp.org/www-project-top-10-for-large-language-model-applications",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Add a json_schema keyword of your choice (for example minLength or additionalProperties: false) to your runner. Write the definition check first, then three recorded outputs: one that passes, one that fails, and one schema where the keyword has a wrong value and must make the case invalid."),
    ],
});
