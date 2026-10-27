import { readFileSync } from "node:fs";

// CodeDev model choice: pick a model for one task from measured candidates.
// The test runner reads one JSON object from stdin: { task, models }.
//   task    the task's typical request (inputTokens, outputTokens) and its constraints:
//           maxCostPer1k (USD per 1,000 requests), maxP95Ms, minQuality (score on the team's eval
//           set, 0..1) and personalData (true when the prompts contain learners' personal data)
//   models  candidates in the order they were proposed; prices are example USD per 1M tokens,
//           p95Ms and quality are null when nobody has measured them yet for this task
//
// costPer1k(task, m) = (task.inputTokens x m.inputPer1M + task.outputTokens x m.outputPer1M) / 1000
//
// A model fits when none of these is violated. Check them in this order and describe each
// violation exactly like this:
//   1. data     personalData is true and the model is neither local nor an approvedProcessor
//               -> "personal data would leave the company"
//   2. context  contextTokens < inputTokens + outputTokens  -> "context <contextTokens> < <needed> tokens needed"
//   3. quality  null -> "quality not measured";  below minQuality -> "quality <quality> < <minQuality>"
//   4. p95      null -> "p95 not measured";      above maxP95Ms   -> "p95 <p95Ms>ms > <maxP95Ms>ms"
//   5. cost     costPer1k above maxCostPer1k -> "cost per 1k <cost with toFixed(2)> > <maxCostPer1k>"
// A value equal to its limit fits. Numbers are printed as JavaScript prints them (template strings).
//
// chooseModel(input) returns the lines to print:
//   at least one model fits -> the cheapest fitting model by costPer1k; on equal cost the higher
//   quality, then the smaller name (plain string order):
//     "choose <name>"
//     "reason: cheapest fitting model (<fitting> of <candidates> fit); cost per 1k <toFixed(2)>,
//      p95 <p95Ms>ms, quality <quality>, data: <d>"   (one line; <d> is "no personal data" when
//      personalData is false, otherwise "runs locally" for a local model or "approved processor")
//   no model fits -> "no model fits", then one line per candidate in input order:
//     "<name>: <violations joined with ", ">"
//   no candidates at all -> "no model fits", "(no candidates)"

type Task = {
    name: string;
    inputTokens: number;
    outputTokens: number;
    maxCostPer1k: number;
    maxP95Ms: number;
    minQuality: number;
    personalData: boolean;
};
type Model = {
    name: string;
    inputPer1M: number;
    outputPer1M: number;
    p95Ms: number | null;
    contextTokens: number;
    quality: number | null;
    local: boolean;
    approvedProcessor: boolean;
};
type Input = { task: Task; models: Model[] };

function costPer1k(task: Task, m: Model): number {
    return 0;
}

function chooseModel(input: Input): string[] {
    return [];
}

// ---------------------------------------------------------------- test runner (do not change)
const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(chooseModel(input).join("\n"));
