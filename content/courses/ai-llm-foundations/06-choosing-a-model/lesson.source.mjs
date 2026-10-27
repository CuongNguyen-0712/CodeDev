// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aif-2-3",
    title: "How to choose a model: ChatGPT, Gemini, Claude, DeepSeek or one that runs locally",
    slug: { _type: "slug", current: "choose-a-model-api-or-local" },
    description:
        "CodeDev first put every AI feature on the model at the top of a public leaderboard, then proposed moving everything to the cheapest API after the bill arrived. Both decisions used one number for three different tasks. Learn to choose a model per task from criteria you can measure - quality on your own eval set, cost per 1,000 requests, p95 latency, context size, repeatability and where the data is allowed to go - how a model that runs locally with Ollama changes that picture, and how to write the decision down so it can be checked again next month.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer and design reviewer, CodeDev learning platform",
        problem:
            "CodeDev has three AI features: the hint bot, an inline \"explain my error\" box under failing tests, and a weekly summary of learner feedback for instructors. All three were put on chat-large because it ranked second on a public leaderboard. After the hint bot bill (lesson 4) and the slow hints (lesson 5), a pull request proposes moving all three to budget-api, the cheapest API the team found. The design review has to answer a simpler question than \"which model is best\": which model fits each task, and how do we know?",
    },

    content: [
        h2("1. The incident: one model, chosen by one number, for three tasks"),
        p("The pull request and the review comments, as they appeared in the repository of https://api.codedev.test:"),
        code("text", `
PR #1874  Move all AI features to budget-api
"chat-large costs us ~$9k/month. budget-api is 25x cheaper per token and is in the top 10
 of the leaderboard. Changing AI_MODEL in .env for hint-bot, explain-error and feedback-summary."

Review comments
1. explain-error: on our 200 recorded learner errors budget-api scores 0.78; our bar is 0.80.
   chat-large scored 0.91 but has p95 6.2 s - the inline box budget is 3 s. Neither fits.
2. feedback-summary: prompts contain learners' names and emails. budget-api's provider has
   no data processing agreement with us. This change sends personal data to a processor that
   legal has not approved. Blocking.
3. hint-bot: budget-api is fine on quality (0.81) and cost. Why one model for all three?`, "PR #1874 and its review"),
        p("The first decision (chat-large for everything) optimized one number, a leaderboard rank. The second (budget-api for everything) optimized another, the price per token. Each looked reasonable on its own number and failed on numbers it did not look at: latency, quality on CodeDev's own tasks, and where learners' data goes. The fix is not a better favourite model. It is a way of choosing that looks at all the constraints of each task."),

        h2("2. Read the evidence: three tasks, three sets of constraints"),
        p("Before comparing models, write down what each task needs. These numbers come from the product requirements, the usage logs (lesson 4) and the latency budgets (lesson 5):"),
        code("text", `
feature           someone waiting?   personal data in prompt?   typical tokens in/out   quality bar   p95 budget   max cost / 1k requests
hint-bot          yes (panel)        no (code and errors)        600 / 300               0.80          8,000 ms     $3.00
explain-error     yes (inline)       no                          1,400 / 250             0.80          3,000 ms     $2.00
feedback-summary  no (weekly job)    yes (names, emails)         6,000 / 400             0.82          15,000 ms    $20.00`, "task constraints"),
        p("Then measure the candidates on each task. One row per model and task, from an eval run (section 4), never from a vendor's page:"),
        code("text", `
explain-error, 200 recorded learner errors, example prices per 1M tokens

model        runs on            data agreement   quality   p95 ms   context   cost / 1k requests
chat-large   provider API       approved         0.91      6,200    200k      $6.00
chat-mini    provider API       approved         0.84      1,900    128k      $0.36
budget-api   provider API       none             0.78      1,200     64k      $0.24
local-8b     CodeDev GPU        local            0.79      3,800      8k      $0.00 (+ hardware)
local-27b    CodeDev GPU        local            0.86      5,400     32k      $0.00 (+ hardware)`, "explain-error candidates"),
        p("Cost per 1,000 requests is the formula from lesson 4 with the task's typical tokens: `(1,400 x input price + 250 x output price) / 1,000`. For chat-mini at example prices of $0.15 and $0.60 per 1M tokens that is (210 + 150) / 1,000 = $0.36."),

        h2("3. Core idea: criteria, not brands"),
        p("ChatGPT, Gemini, Claude and DeepSeek are names of model families and products; behind each there are several models of different sizes, prices and speeds, and they change every few months. Open-weight models that you can download and run yourself, for example through Ollama, add another column. A choice that names a brand (\"we use the best one\") will be out of date before the next release. A choice that names criteria can be re-checked in an afternoon."),
        h3("The criteria, in the order they eliminate candidates"),
        numbered([
            "**Data: where may the prompt go?** If prompts contain personal data, secrets or anything your users did not agree to share, only models whose provider you have an approved processing agreement with, or models running on your own machines, are candidates. Read the API terms, not the consumer chat app's: retention and use for training can differ. This is a yes/no rule; no price or quality score changes it (lesson 9 goes deeper).",
            "**Context: does the request fit?** Input plus the answer must fit in the model's context window (lesson 2). A model with an 8k window cannot review a 30k-token file, whatever it costs.",
            "**Quality on your task.** A score on your own eval set of real inputs, compared with a bar the product agreed on. Not a leaderboard rank, which averages tasks that are not yours.",
            "**Latency.** p95 from your own runs, compared with the budget of the feature (lesson 5).",
            "**Cost.** Cost per 1,000 requests at the task's typical token counts (lesson 4), compared with the budget.",
        ]),
        p("Among the models that pass every rule, pick the **cheapest**. Extra quality or speed above the bar is only worth paying for if the bar is wrong, and then the honest fix is to change the bar, with evidence, and run the comparison again."),
        h3("Repeatability is a criterion too"),
        p("If a feature must give the same answer to the same input (grading, tagging, anything that is audited), prefer a model and settings that support it: a low temperature (lesson 3), a pinned model version rather than an alias that the provider moves to a newer model, and for local models a fixed model file. Record the exact version in the decision; a quality score is only valid for the version you measured."),
        callout("info", "When not to run a full comparison",
            "A one-off script you will run twice, or an internal prototype with no user data, does not need an eval set: use whatever model you already have access to and move on. The moment a feature reaches learners, handles their data or costs more than a few dollars a day, it needs the comparison below, even if it is only 50 examples."),

        challenge("chal_quiz_aif_231"),

        h2("4. Measure quality with a small eval set"),
        p("An eval set is a file of real inputs with what a good answer must contain. For explain-error, the team took 200 failing submissions from the logs (with personal data removed), wrote down for each the actual cause, and graded each model's recorded explanation by whether it names that cause and does not give away the solution:"),
        code("json", `
{
  "id": "err-0137",
  "input": "TypeError: Cannot read properties of undefined (reading 'map')\\n    at renderList (list.ts:14)",
  "mustMention": ["undefined", "before the data has loaded"],
  "mustNotContain": ["return items?.map"]
}`, "evals/explain-error/err-0137.json"),
        code("typescript", `
type EvalCase = { id: string; mustMention: string[]; mustNotContain: string[] };
type Recorded = { id: string; model: string; answer: string; totalMs: number; inputTokens: number; outputTokens: number };

function passes(c: EvalCase, answer: string): boolean {
  const text = answer.toLowerCase();
  return c.mustMention.every((m) => text.includes(m.toLowerCase()))
      && c.mustNotContain.every((m) => !text.includes(m.toLowerCase()));
}

// quality of one model = share of cases it passes; the same run gives its p95 and its token counts
function quality(cases: EvalCase[], answers: Recorded[], model: string): number {
  const byId = new Map(answers.filter((a) => a.model === model).map((a) => [a.id, a.answer]));
  return cases.filter((c) => passes(c, byId.get(c.id) ?? "")).length / cases.length;
}`, "evals/score.ts"),
        bullets([
            "**Record once, grade many times.** Store every model's answers and timings, then change the grader without paying for the calls again. The challenges in this course work the same way: recorded fixtures, no live model.",
            "**Automatic checks first, people second.** Keyword and structure checks catch most failures cheaply; a person reads a sample (say 20 answers per model) to catch what the checks miss.",
            "**Keep the eval set when you choose.** It is how you re-check the decision when a provider releases a new version or changes a price.",
        ]),

        h2("5. Models that run locally"),
        p("An open-weight model runs on your own machine or server, so prompts never leave it. With Ollama, trying one takes two commands, and its OpenAI-compatible endpoint lets the same client code talk to either a hosted API or the local model:"),
        code("bash", `
ollama pull <model>          # pick a model from ollama.com/library; small ones run on a laptop
ollama run <model> --verbose # chat with it and see prompt eval and eval rates (lesson 5)`, "terminal"),
        code("typescript", `
import OpenAI from "openai";

// The same client code, two places to send it. Which one a feature uses is a config decision.
const hosted = new OpenAI();                                                            // provider API
const local = new OpenAI({ baseURL: "http://localhost:11434/v1", apiKey: "ollama" });  // Ollama on this machine

const client = feature.personalData ? local : hosted;`, "llm/client.ts (example)"),
        p("What local buys you and what it costs:"),
        bullets([
            "**Data stays on your machines.** For the feedback summary this alone makes local-27b a candidate where budget-api is not.",
            "**No per-token bill, but a real one.** A GPU server, its power, its monitoring and someone to update it. At low volume a hosted API is usually cheaper overall; at high, steady volume or with strict data rules, local can win.",
            "**Speed depends on your hardware.** local-27b's 5.4 s p95 is fine for a weekly job and too slow for the inline box.",
            "**Smaller open models are often weaker on hard tasks**, sometimes good enough on narrow ones. Only your eval set can tell you which.",
            "**You control the version.** A local model file does not change unless you change it, which helps repeatability.",
            "**Check the licence.** Open-weight models come with licences that differ in what commercial use they allow.",
        ]),

        h2("6. The decision, per task"),
        p("Applied to section 2, the review produced one model per feature and wrote down why, so the next review can check it against new numbers:"),
        code("text", `
explain-error     constraints: no personal data, quality >= 0.80, p95 <= 3,000 ms, <= $2.00 / 1k
                  out: budget-api (quality 0.78), local-8b (quality 0.79, p95), local-27b (p95),
                       chat-large (p95, cost)
                  choice: chat-mini (quality 0.84, p95 1,900 ms, $0.36 / 1k), pinned version recorded

feedback-summary  constraints: PERSONAL DATA, quality >= 0.82, p95 <= 15,000 ms, <= $20.00 / 1k
                  out: budget-api (no data agreement)
                  remaining: chat-mini (approved processor), local-27b (local)
                  choice: decided by cost of the GPU server we already run for evals

re-check when:    a provider changes a price or retires a version, the eval set changes,
                  or production p95 / cost per 1k drifts above the budget (lesson 5 dashboard)`, "decision record (excerpt)"),
        p("Notice that the hint bot moved too: budget-api passes its bar (0.81 against 0.80) at a fraction of chat-large's cost, so part of PR #1874 was right, for that one task. Choosing per task is what made it possible to keep the good part."),

        h2("7. Your turn: choose the cheapest model that fits"),
        p("Write the selection step of the review as code. Given a task's constraints and the measured candidates, return the cheapest model that passes every rule with a reason line, or explain for every candidate which rules it breaks. A candidate whose quality or p95 nobody has measured for this task does not fit: \"not measured\" is not \"good enough\"."),
        code("typescript", `
function chooseModel(input: { task: Task; models: Model[] }): string[] {
  // for each model: list its violations (data, context, quality, p95, cost - in that order)
  // fitting = models with no violations; pick the cheapest, or report every violation
}`),
        challenge("chal_coding_aif_232"),

        h2("8. How to verify a model choice"),
        bullets([
            "**Re-run the eval set** on every candidate when a provider ships a new version, changes prices or you change the prompt. Compare against the recorded decision, not against memory.",
            "**Pin and log the model version** with every call (lesson 4's usage log). A quality drop that lines up with a version change is then a query, not a mystery.",
            "**Watch production numbers** against the budgets: cost per 1k and p95 per feature on the dashboard from lesson 5.",
            "**Check the data path, not just the code.** For a feature with personal data, confirm from network or gateway logs which hosts actually receive prompts, and that each one is on the approved processor list.",
        ]),

        h2("9. Common mistakes"),
        bullets([
            "**Choosing by leaderboard rank.** Spot it: the decision cites a public ranking and no eval run on your own inputs.",
            "**One model for every feature.** Spot it: one `AI_MODEL` setting shared by tasks with different latency budgets and data rules.",
            "**Checking data rules last.** Spot it: a comparison table sorted by price where the data column was added afterwards, or is missing.",
            "**Treating \"not measured\" as \"fine\".** Spot it: a new model chosen from its announcement before it has a p95 or a quality score on your task. In code, a comparison like `quality < minQuality` that silently passes when quality is `null`.",
            "**Comparing a local model's $0 with a per-token price.** Spot it: no hardware, power or operations cost anywhere in the decision.",
        ]),

        h2("10. Summary"),
        bullets([
            "Choose per task: data rules and context size eliminate candidates first, then the quality bar on your own eval set, then the p95 budget, and the cheapest remaining model wins.",
            "Brands and leaderboards change; criteria and a recorded eval set let you re-check the choice in an afternoon.",
            "A local model (for example through Ollama) keeps data on your machines and lets you pin the version, at the cost of hardware, operations and usually some quality, so measure it like any other candidate.",
        ]),

        h2("Sources"),
        bullets([
            "OpenAI API documentation, models and text generation - platform.openai.com/docs/guides/text",
            "Anthropic documentation, choosing a model and prompt engineering - docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview",
            "Ollama model library and OpenAI-compatible API - ollama.com/library",
        ]),
        callout("tip", "Practice on your own (not graded): an API model against a local one",
            "Pick one small task you care about (for example \"explain this error message in two sentences\") and write 20 eval cases with what a good answer must mention. Install Ollama, pull a small open-weight model from ollama.com/library and record its answers, eval rate and total time with --verbose. If you have API access to a hosted model (ChatGPT/OpenAI, Gemini, Claude or DeepSeek), record its answers for the same 20 cases with the usage object and timings. Score both with the same checks, compute cost per 1,000 requests with the provider's current prices, and write a five-line decision record: constraints, candidates, who is out and why, the choice, and when to re-check."),
    ],
});
