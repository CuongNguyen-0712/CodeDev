// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aif-1-3",
    title: "Temperature & repeatability: why the same question gets different answers",
    slug: { _type: "slug", current: "llm-temperature-repeatability" },
    description:
        "Learners clicked \"Explain again\" on the same compile error and got a different explanation every time, so they reported the hint bot as broken; at temperature 0 the answers still differed now and then. Learn how temperature and top_p turn next-token probabilities into a choice, why temperature 0 is not a determinism guarantee on hosted APIs, how to measure repeatability from recorded runs, and when to fix it with settings, with a stored answer, or not at all.",
    estimatedTime: 25,

    scenario: {
        role: "Full-stack developer, CodeDev learning platform",
        problem:
            "Support received 23 tickets in one week saying the \"Explain my error\" bot is broken: a learner clicks \"Explain again\" on the same TypeScript error and gets a different explanation, sometimes with a different fix, and asks which one is right. The team lowered the temperature from the default 1 to 0. The tickets dropped, but QA can still produce a slightly different answer about one time in twenty with identical requests.",
    },

    content: [
        h2("1. The incident: \"the bot changes its mind\""),
        p("A learner on https://app.codedev.test pasted this into a support ticket, with two screenshots of the hint panel taken a minute apart, for the same code and the same error `TS2322: Type 'string' is not assignable to type 'number'.`:"),
        code("text", `
first click:   The variable \`total\` is declared as number, but \`input.value\` is a string.
               Convert it with Number(input.value) before adding it.

second click:  You are adding a string to a number. Change the type of \`total\` to string,
               or convert the value.`, "support ticket #4471"),
        p("Both answers are about the right problem, but the second suggests changing the type of `total` to string, which would hide the bug instead of fixing it. A learner cannot tell which one to trust, and \"the bot says something different every time\" sounds like a defect. The hint service sent the request with no `temperature` setting, so the provider's default of 1 applied."),
        p("This lesson explains where the variation comes from, why setting the temperature to 0 reduced it but did not remove it, and how to decide what the product should do about it."),

        h2("2. Reproduce it and read the evidence"),
        p("You cannot debug variation from one sample. QA recorded the same request twenty times at temperature 1 and twenty times at temperature 0, with identical messages, and saved every output to a fixture file. A summary of the recording, after ignoring differences in spacing and capital letters:"),
        code("text", `
prompt            temperature  runs  different answers  most common answer
explain-ts2322    0            20    2                  19 of 20
explain-ts2322    1            20    9                  7 of 20`, "recorded runs, 2026-10-21"),
        p("At temperature 1 the most common answer appears in only 7 of 20 runs. At temperature 0 it appears in 19 of 20, and the one different run only rephrases \"is declared as number\" as \"has type number\". Two facts follow: the variation is real and mostly caused by the setting, and the setting alone does not make the output identical."),

        h2("3. Temperature: how a probability becomes a choice"),
        p("Lesson 1.1 showed that the model computes a probability for every possible next token. Something then has to pick one. **Sampling** picks at random, weighted by the probabilities, and **temperature** reshapes the probabilities before the pick. A low temperature makes likely tokens even more likely; a high temperature flattens the distribution so unlikely tokens get chosen more often. The same four candidates at three temperatures:"),
        code("text", `
text so far: "The loop tries to reassign count, which is declared with"

candidate     temperature 0.5   temperature 1 (as computed)   temperature 1.5
" const"          93.3%              70.0%                        55.4%
" let"             4.3%              15.0%                        19.9%
" the"             1.9%              10.0%                        15.2%
" a"               0.5%               5.0%                         9.5%`, "the same probabilities, reshaped"),
        p("At temperature 0 the pick becomes, in principle, \"always take the most likely token\". One different token early in an answer changes everything after it, because every later token is predicted from the text so far. That is why two runs can diverge into completely different explanations, not just different words."),
        bullets([
            "**Ranges and defaults differ.** Many APIs accept 0 to 2 with a default of 1; Anthropic's Messages API accepts 0 to 1, default 1. Some reasoning models do not let you change temperature at all. Check the API reference of the model you call.",
            "**top_p is a second knob.** It limits the pick to the smallest set of most likely tokens whose probabilities add up to p (0.9 = the top 90%). Providers recommend changing temperature or top_p, not both.",
            "**Variety is sometimes the point.** \"Suggest a practice project\" or \"give me another example\" should vary; the same answer every time would be the bug there.",
        ]),

        h2("4. Why temperature 0 still varies on hosted APIs"),
        p("If temperature 0 means \"take the most likely token\", why did one run in twenty differ? Because \"most likely\" is the result of billions of floating-point operations, and a hosted API does not run your request alone:"),
        bullets([
            "**Batching and floating point.** The provider groups your request with others on the same GPUs. Different batch sizes change the order of additions, floating-point addition is not exactly associative, and when two candidate tokens are almost equally likely, a tiny difference flips which one wins.",
            "**Infrastructure and model updates.** Requests may land on different hardware or software versions; a model name that is an alias can point to a newer snapshot next month.",
            "**Seeds are best effort.** Some APIs accept a `seed` to make sampling repeatable and return a fingerprint of the backend configuration so you can see when it changed, but they document it as best-effort, not a guarantee.",
        ]),
        callout("warning", "Temperature 0 is not a determinism guarantee",
            "Provider documentation says it directly: even at temperature 0, results will not be fully deterministic. Treat a low temperature as \"much more repeatable\", never as \"identical\". A model you run yourself (for example with Ollama, a fixed seed and temperature 0 on the same machine and version) is usually far more repeatable, which is one reason to consider a local model for some tasks (lesson 2.3)."),
        p("Repeatability is therefore a property you measure for each feature, the same way you measure latency: run the same prompt several times at the settings you plan to ship, compare the outputs, and decide whether the number is good enough for what the feature promises."),

        challenge("chal_quiz_aif_131"),

        h2("5. Choosing a fix"),
        p("Start from what the user needs, not from the setting:"),
        numbered([
            "**Factual, single-answer features** (explain an error, extract fields, classify a submission): use a low temperature, 0 to 0.3. Variety only adds chances to be wrong.",
            "**The same text on a second look**: if a learner must see exactly the same explanation when they come back, do not ask the model again. Store the first answer under a key made of everything that defines the question (model, prompt version, challenge, error text, a hash of the code) and show the stored answer. This is the only way to get identical text, and it also saves the cost of the second call.",
            "**A deliberate new answer**: offer it as its own action, \"Explain differently\", so that variation is expected instead of surprising.",
            "**Creative features** (practice ideas, example data): keep the default or a higher temperature, and do not count variety as a defect.",
        ]),
        p("For CodeDev the fix was the second and third: temperature 0 for \"Explain my error\", a stored answer per error and code hash, and a separate \"Explain differently\" button. The second explanation from the ticket, the one that suggested changing the type, is also a reminder that repeatable is not the same as correct: a stable wrong answer is still wrong (lesson 3.1)."),

        h2("6. Worked example: recording runs to measure"),
        p("Measuring repeatability needs real outputs once, then no model at all. The script below records ten runs per temperature with the OpenAI Node SDK and writes them to a fixture file; the analysis then runs on the file, in tests, for free. The Anthropic and Gemini SDKs take the same `temperature` parameter; with Ollama it goes in `options: { temperature: 0, seed: 42 }`:"),
        code("typescript", `
import OpenAI from "openai";
import { writeFileSync } from "node:fs";

const client = new OpenAI();
const prompts = { "explain-ts2322": buildExplainPrompt(TS2322_FIXTURE) };   // id -> messages
const runs: { prompt: string; temperature: number; output: string | null }[] = [];

for (const [prompt, messages] of Object.entries(prompts)) {
    for (const temperature of [0, 1]) {
        for (let i = 0; i < 10; i++) {
            try {
                const res = await client.chat.completions.create({
                    model: process.env.HINT_MODEL!,
                    temperature,
                    max_completion_tokens: 400,
                    messages,
                });
                runs.push({ prompt, temperature, output: res.choices[0].message.content });
            } catch {
                runs.push({ prompt, temperature, output: null });   // record the failure, do not retry
            }
        }
    }
}
writeFileSync("fixtures/explain-runs.json", JSON.stringify(runs, null, 2));`, "recordRuns.ts"),
        p("Ten runs cost ten requests, so record on a small set of prompts that matter and reuse the file. Record again whenever you change the model, the prompt or the settings, and keep the old file to compare."),
        p("The analysis compares outputs after normalising them, because two answers that differ only in spacing or capital letters are the same answer for a learner. It reports, for each prompt and temperature, how many runs agree with the most common answer, and flags the ones below a threshold. Write it:"),
        challenge("chal_coding_aif_132"),

        h2("7. How to verify"),
        bullets([
            "**A recorded fixture per feature.** 10 to 20 runs per prompt and setting, saved with the date, model and prompt version. The agreement numbers become a regression check: rerun the recording after a model change and compare.",
            "**Choose the threshold from the feature's promise.** \"Explain my error\" should agree in most runs; \"Suggest a project\" can agree in almost none. Write the threshold next to the feature, not one number for the whole product.",
            "**Exact agreement is strict on purpose.** It measures whether the text repeats, not whether it is right. Check correctness separately, for example that the answer names the error code and never contains a full solution.",
            "**In production**, log the settings (model, temperature, prompt version) with every answer and count \"Explain again\" clicks per error: a high rate is a sign learners do not trust the first answer.",
            "**Stored answers**: check that the second request for the same key returns the stored text and makes no API call (count the calls in a test with a fake client).",
        ]),

        h2("8. Common mistakes and how to spot them"),
        bullets([
            "**Leaving the default for a factual feature.** The default is often 1. Spot it by searching the integration for `temperature`; if it is not set, you are shipping the provider's default.",
            "**Promising identical output from temperature 0.** Tests that compare the exact text of a live model fail randomly. Spot it in flaky CI runs; test fixtures, properties or stored answers instead.",
            "**Measuring with one run.** \"I tried it and got the same answer twice\" says little. Spot it by asking how many runs a conclusion is based on; record at least 10.",
            "**Changing temperature and top_p together.** Two knobs that do similar things make results hard to explain. Spot it in the request body; change one.",
            "**Comparing raw strings.** A trailing newline or a capital letter counts as a different answer and makes a stable prompt look unstable. Spot it when distinct answers look identical on screen; normalise before comparing.",
        ]),

        h2("9. Summary"),
        numbered([
            "Temperature reshapes the next-token probabilities before one token is sampled: low means more repeatable, high means more varied, and one different early token changes the whole answer.",
            "Temperature 0 is not a determinism guarantee on hosted APIs (batching, floating point, backend changes); measure repeatability from recorded runs instead of assuming it.",
            "Choose by what the feature promises: a low temperature for factual answers, a stored answer when the user must see the same text again, a deliberate \"answer differently\" action, and free variety for creative features.",
        ]),

        h2("Sources"),
        bullets([
            "OpenAI API docs, Chat Completions reference: temperature, top_p, seed and system_fingerprint - platform.openai.com/docs/guides/text",
            "Anthropic docs, Messages API reference: temperature (and the note that temperature 0 is not fully deterministic) - docs.anthropic.com",
            "Ollama docs, Modelfile parameters: temperature, top_p, seed - ollama.com",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run one \"explain this error\" prompt ten times at temperature 0 and ten times at 1 with a small local model in Ollama, first without and then with a fixed seed. Save the outputs in the fixture format above, run your measureStability on them, and compare the numbers with the same experiment on a hosted API you have access to."),
    ],
});
