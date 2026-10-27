// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aif-2-2",
    title: "Latency: time to first token, output length & p95",
    slug: { _type: "slug", current: "llm-latency-ttft-output-length-p95" },
    description:
        "After a prompt change, hints took 16 seconds for a typical learner and 27 seconds for one in twenty, and learners started clicking Get hint twice. Learn where the time of an LLM call goes (time to first token, then output tokens at a generation speed), why the length of the answer usually dominates, how to read p50 and p95 from recorded timings instead of trusting an average, what streaming changes and what it does not, and how to review an AI-written cost/latency dashboard script before you trust its numbers.",
    estimatedTime: 20,

    scenario: {
        role: "Full-stack developer, CodeDev learning platform",
        problem:
            "A week after the hint bot's prompt was changed to \"explain step by step with an example\", support has 41 tickets saying the hint button is frozen. The hint panel on https://app.codedev.test shows a spinner until the whole answer has arrived. Real-user monitoring shows the median wait went from 3.7 s to 16.5 s and the p95 from 6.1 s to 26.8 s, and 18% of hint requests are now followed by a second click on Get hint within 20 seconds - a second paid request for the same hint. The model, the provider and the servers did not change.",
    },

    content: [
        h2("1. The incident: a hint that takes 27 seconds"),
        p("The bug report, with the measurements attached by the developer on call:"),
        code("text", `
BUG-2317  Hint panel "frozen" for 15-30 s since prompt v2
Reported by: support (41 tickets), 2026-09-22

Real-user monitoring, hint panel, click -> answer shown (ms)
              p50      p95     double clicks
prompt v1    3,700    6,100        2%
prompt v2   16,540   26,820       18%

Hint service log, medians of 2,000 calls per version (same model, same region)
prompt  input_tokens  output_tokens  ttft_ms  total_ms
v1               590            260      640     3,700
v2               610          1,350      660    16,540`, "BUG-2317"),
        p("Read the last two lines slowly. The prompt grew by 20 tokens and the time to the first token grew by 20 ms. The **answer** grew from 260 to 1,350 tokens, and the total time grew by 12.8 seconds. The model did not get slower. It was asked to write five times as much, and it writes at a fairly steady speed."),
        p("The double clicks make it worse: a learner who sees a spinner for 20 seconds assumes it broke and asks again. Each extra click is a second full request, with its own cost (lesson 4) and its own 16 seconds."),

        h2("2. Read the evidence: one call, three timestamps"),
        p("Every LLM call has three moments you can measure: when you sent the request, when the **first token** arrived, and when the **last token** arrived. They split the call into two parts that behave very differently:"),
        code("text", `
 click / request sent        first token                                   last token
 |----- TTFT: 660 ms --------|----------- generation: 15,880 ms ------------|
   network, queue,              1,350 output tokens at ~85 tokens/s
   reading the 610-token
   input (prefill)

 total = TTFT + output tokens / generation speed  =  0.66 s + 1,350 / 85 s  =  16.5 s`, "one v2 hint call"),
        bullets([
            "**Time to first token (TTFT)** covers the network, waiting in the provider's queue and reading your whole input. It grows with long inputs and with load on the provider, and it is much longer for models that reason before they answer, because the hidden reasoning happens before the first visible token.",
            "**Generation speed** (output tokens per second) depends mostly on the model and the hardware behind it: small models are usually faster per token than large ones, and a local model is as fast as your GPU or CPU allows.",
            "**Output length** multiplies the generation time. It is the one factor your prompt controls directly, and for long answers it dominates.",
        ]),
        p("To get these numbers you need to see the first token, which means asking for a streamed response. With an official SDK it looks like this (an example for reading; the challenges use recorded timings and never call a model):"),
        code("typescript", `
const started = performance.now();
let ttftMs: number | null = null;
let text = "";

const stream = await client.responses.create({
  model: HINT_MODEL,
  instructions: HINT_INSTRUCTIONS,
  input: hintInput,
  stream: true,                                   // events arrive as tokens are generated
});

for await (const event of stream) {
  if (event.type === "response.output_text.delta") {
    ttftMs ??= performance.now() - started;       // first visible text
    text += event.delta;
    sendToBrowser(event.delta);                   // e.g. as server-sent events
  }
}

const totalMs = performance.now() - started;
log({ feature: "hint-bot", model: HINT_MODEL, ttftMs, totalMs /* + the usage counts from lesson 4 */ });`, "hints/streamHint.ts (example)"),
        p("A local model shows the same split. `ollama run <model> --verbose` prints it after every answer: the prompt eval lines are the input side of TTFT, and the eval lines are generation:"),
        code("text", `
total duration:       6.12s
load duration:        25ms
prompt eval count:    912 token(s)
prompt eval duration: 790ms
prompt eval rate:     1154.43 tokens/s
eval count:           240 token(s)
eval duration:        5.27s
eval rate:            45.54 tokens/s`, "ollama --verbose (example output)"),

        h2("3. Core idea: you pay for latency by the token"),
        p("Put the formula from section 2 next to lesson 4 and the main lesson of this module appears: **output tokens drive both cost and latency.** A hint that is five times longer is roughly five times more expensive and five times slower to finish. That is why \"make the answer shorter\" is usually the first and cheapest fix for both, and why it should be decided by what the learner needs to read, not by what the model is willing to write."),
        h3("When latency matters, and when it does not"),
        bullets([
            "**A person is waiting** (a hint panel, a chat, autocomplete): latency is the product. Set a budget per feature, for example \"first text within 1 s, complete hint p95 under 8 s\".",
            "**Nobody is waiting** (a nightly summary of course feedback, tagging old forum posts): latency hardly matters. Optimize for cost instead; many providers offer cheaper batch processing for exactly this.",
            "**A chain of calls** (classify the question, then retrieve, then answer): latencies add up. Three sequential calls with a 2 s p50 each give a p50 of about 6 s. Run independent calls in parallel, or drop the ones that do not change the answer.",
        ]),
        callout("info", "Bigger is not always slower, smaller is not always faster",
            "Generation speed depends on the model, the provider's hardware, the load at that moment and features such as reasoning. Treat any rule of thumb as a hypothesis and check it against your own recorded timings, for your own prompts, at the time of day your users use the feature."),

        challenge("chal_quiz_aif_221"),

        h2("4. p50 and p95 from recorded timings"),
        p("\"The hint takes 8 seconds on average\" sounds like a fact, but almost no learner waits 8 seconds. Here are 20 recorded total times from one afternoon, already sorted:"),
        code("text", `
 #   1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16    17    18    19    20
 s 3.1  3.4  3.6  3.9  4.2  4.4  4.5  4.8  5.0  5.1  5.3  5.6  5.9  6.2  6.8  7.5   8.9  12.4  19.7  41.0

 mean  = 161.3 / 20                  = 8.1 s   (pulled up by one 41 s call)
 p50   = value #ceil(0.50 x 20) = #10 = 5.1 s   (half the learners waited this long or less)
 p95   = value #ceil(0.95 x 20) = #19 = 19.7 s  (one learner in twenty waited longer)`, "20 hint calls, total time"),
        p("This is the **nearest-rank** percentile: sort the values, take the one at position `ceil(p / 100 x n)`, counting from 1. Monitoring tools and databases may interpolate between two values instead, so their numbers can differ slightly on small samples; what matters is that you use one method consistently and a sample large enough to have a tail."),
        bullets([
            "**p50 (the median)** tells you what a typical learner experiences.",
            "**p95** tells you what one learner in twenty experiences. With 20,000 hints a day, that is 1,000 hints a day at or above that wait. Support tickets come from the tail, not from the median.",
            "**The mean** is useful for cost (the bill is a sum, lesson 4) but misleading for waiting time: one very slow call moves it a lot, and it describes nobody.",
        ]),

        h2("5. Streaming: faster to start, not faster to finish"),
        p("With streaming, the hint panel shows the first words after the time to first token (660 ms) instead of after the whole answer (16.5 s). For something a learner reads from top to bottom, that changes how the feature feels: the learner starts reading while the rest arrives, and nobody clicks twice because something is visibly happening."),
        p("What streaming does **not** change: the model generates the same tokens at the same speed, the complete answer arrives at the same time, and the provider bills the same tokens. If the problem is \"the full answer takes too long\" or \"it costs too much\", streaming is not the fix."),
        h3("When not to stream"),
        bullets([
            "**You need the whole answer before you can use it**, such as JSON that must be parsed and validated, or a value your code acts on. Show progress differently, or make the output smaller.",
            "**The answer must be checked before anyone sees it**, for example for a full solution leaking into a hint. Showing tokens as they arrive means showing them before the check.",
            "**Nobody is watching**: a background job gains nothing from streaming.",
        ]),
        callout("tip", "Stop paying when the learner leaves",
            "Give the hint panel a Stop button and cancel the request when the learner closes the panel (an AbortController on the fetch to your own API, and closing the upstream stream on the server). Whether and when the provider stops generating, and which tokens are still billed, depends on the provider: check its documentation and your usage numbers rather than assuming."),

        h2("6. Making the complete answer faster"),
        numbered([
            "**Fewer output tokens.** Ask for exactly what the panel shows (\"one hint, at most 3 sentences\") and cap the output length as a safety limit. For BUG-2317, going back to short hints and moving the long explanation behind an \"Explain more\" button fixed the p95 and the cost together.",
            "**A faster model for the job.** A smaller model may be fast enough and good enough for hints (lesson 6 shows how to decide with an eval set, not a guess).",
            "**A shorter input**, if TTFT is the problem: send the failing test and the relevant lines, not the whole file and the whole lesson.",
            "**Fewer sequential calls**, or calls in parallel.",
            "**Reuse answers** where it is correct to: the same challenge with the same error message may get the same first hint from a cache.",
        ]),

        h2("7. The cost/latency dashboard: review the script before you trust it"),
        p("To follow BUG-2317 and the bill from lesson 4 in one place, the team asked an AI coding assistant for a small dashboard script. The request was:"),
        code("text", `
Write a script for our cost/latency dashboard. Input: recorded LLM calls of the hint bot
(model, input tokens, output tokens, time to first token in ms, total time in ms) and the
price table (USD per 1M tokens, separate input and output prices). For each model print
the number of calls, p50 time to first token, p50 and p95 total time, output tokens per
second and the total cost. Calls for a model missing from the price table must not crash
the script.`, "request sent to the AI assistant"),
        p("The assistant produced a tidy script. A developer ran it on a day of calls to the local model the team uses for development, compared the latency columns with numbers computed by hand, saw that they matched, and merged it. The next day, with hosted models in the log, the dashboard said the hint bot cost about $96,700 a day. The provider's usage page said about $298 for the same calls."),
        p("Notice why the first check missed it. A local model has a price of 0 per token, so any cost formula, right or wrong, prints 0. The test data could not fail. Before you trust AI-written code that handles money or units, check each formula against the specification you gave it, with data that has non-zero values and at least two different prices."),
        challenge("chal_coding_aif_222"),

        h2("8. How to verify latency claims"),
        bullets([
            "**Log three numbers per call**: `ttft_ms`, `total_ms` and `output_tokens`, next to the usage counts from lesson 4. With them you can tell \"the provider is slow today\" (TTFT up, speed down) from \"our answers got longer\" (output tokens up).",
            "**Measure what the learner sees** in the browser: `performance.now()` at the click, at the first rendered text and at the end. Server timings miss your own API, the network and rendering.",
            "**Report p50 and p95 per model and per prompt version**, over enough calls to have a tail (hundreds, not ten), and compare them with the latency budget of the feature.",
            "**Re-measure after every prompt change.** BUG-2317 was caused by a prompt edit, not by code or infrastructure.",
            "**For local models, use `--verbose`** in Ollama (or the `eval_count` and `eval_duration` fields of its API) and measure on the hardware you will actually run on.",
        ]),

        h2("9. Common mistakes"),
        bullets([
            "**Blaming the model or the network for a long answer.** Spot it: TTFT is stable while total time grows with output tokens.",
            "**Reporting only the average.** Spot it: a dashboard with one latency number per feature. Ask for p50 and p95.",
            "**Expecting streaming to fix total time or cost.** Spot it: after streaming, p95 of the complete answer and cost per day did not move.",
            "**No feedback while waiting.** Spot it: double clicks or repeated requests for the same input within a few seconds in the logs.",
            "**Testing cost code only with free models or one price.** Spot it: every test has price 0, or input and output prices are equal, so unit and price mix-ups cannot show up.",
        ]),

        h2("10. Summary"),
        bullets([
            "Total time is time to first token plus output tokens divided by generation speed; for long answers the output length dominates, and it drives cost too.",
            "Judge latency by p50 and p95 from recorded timings, per model and prompt version; the mean hides the tail that generates the support tickets.",
            "Streaming makes the first words appear sooner, which is often what users need, but it does not make the complete answer faster or cheaper.",
        ]),

        h2("Sources"),
        bullets([
            "OpenAI API documentation, text generation and streaming responses - platform.openai.com/docs/guides/text",
            "Anthropic documentation, streaming Messages and prompt engineering - docs.anthropic.com",
            "Ollama documentation and model library (ollama run --verbose, eval_count, eval_duration) - ollama.com/library",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pull a small open-weight model with Ollama, ask it the same question with \"answer in one sentence\" and with \"explain step by step with an example\", and record eval count, eval rate and total duration from --verbose. Plot total time against output tokens for ten runs of each. If you have an API key for a hosted model, measure TTFT and total time with streaming for the same prompts, and compute p50 and p95 by hand."),
    ],
});
