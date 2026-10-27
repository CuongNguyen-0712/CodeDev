// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aif-2-1",
    title: "How to estimate the cost of an LLM feature from tokens",
    slug: { _type: "slug", current: "estimate-llm-feature-cost-from-tokens" },
    description:
        "The hint bot's first monthly bill was ten times the estimate, because the spreadsheet priced only the prompt. Learn what a request is billed for (input, cached input and output tokens, each with its own price), why output usually costs more, why a chat gets more expensive with every turn, how to read token usage from the API response instead of guessing, and how to turn recorded usage into a cost per request, per model and per month.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "Two weeks after the AI hint bot went live on https://app.codedev.test, finance forwards the provider's usage page: about $298 a day for the hint feature, on course for almost $9,000 a month. The estimate approved before launch said $900 a month. Nothing is broken - hints work, learners like them - but the feature now costs ten times what was planned, and the team has to explain why before the next budget review.",
    },

    content: [
        h2("1. The incident: a bill ten times the estimate"),
        p("The bug report from the finance channel, with the two pieces of evidence it links to:"),
        code("text", `
BUG-2291  Hint bot costs ~10x the approved estimate
Reported by: finance, 2026-09-15
Expected:  ~$30/day ($900/month) per the launch estimate
Actual:    $297.63 on 2026-09-14, similar every day since launch

Launch estimate (spreadsheet, approved 2026-09-02):
  hints per day            20,000
  tokens per hint             600   <- hint instructions + learner code + error
  price per 1M tokens       $2.50   <- chat-large, "input"
  cost per hint           $0.0015
  cost per month (30 d)      $900

Provider usage export, 2026-09-14:
  model       requests  input_tokens  output_tokens  cost_usd
  chat-large    19,842    11,905,200     26,786,700    297.63`, "BUG-2291"),
        p("The number of hints was right: 19,842 against 20,000 planned. The prompt size was right too: 11,905,200 input tokens / 19,842 requests = 600 tokens per request. The spreadsheet was correct about everything it contained. What it did not contain was the answer: every hint also **generated** 1,350 tokens on average (26,786,700 / 19,842), and the provider charges for those at a different, higher price."),
        p("This lesson is about doing that multiplication before launch, with the right columns, from measured numbers instead of guesses."),

        h2("2. Reproduce it: the API already tells you what it billed"),
        p("You do not need the invoice to see this. Every response from an LLM API carries a **usage** object with the token counts the provider billed for that request. The hint service never logged it. Here is what the hint call looks like with an official SDK and the field it ignored (an example for reading, not something the challenges call):"),
        code("typescript", `
import OpenAI from "openai";

const client = new OpenAI();                       // reads OPENAI_API_KEY from the environment

const response = await client.responses.create({
  model: HINT_MODEL,                               // from config, never hard-coded
  instructions: HINT_INSTRUCTIONS,                 // ~420 tokens of rules for the hint bot
  input: \`Challenge: \${challenge.title}\\nCode:\\n\${code}\\nError:\\n\${error}\`,
});

console.log(response.usage);
// {
//   input_tokens: 612,
//   input_tokens_details: { cached_tokens: 0 },
//   output_tokens: 1348,
//   output_tokens_details: { reasoning_tokens: 0 },
//   total_tokens: 1960
// }`, "hints/generateHint.ts (example)"),
        p("Other providers report the same facts with other names. A Claude Messages API response, for example, has `usage.input_tokens`, `usage.output_tokens`, `usage.cache_read_input_tokens` and `usage.cache_creation_input_tokens`; the Gemini API returns `usageMetadata` with prompt and candidate token counts. A local model served by Ollama returns `prompt_eval_count` and `eval_count`. Whatever the names, there are always at least two numbers: **tokens in** and **tokens out**."),
        p("Log them for every call, with the feature name and the model, and the question \"what does this feature cost?\" becomes a query instead of a guess:"),
        code("sql", `
-- one row per LLM call, written by the hint service
SELECT model,
       count(*)                          AS requests,
       round(avg(input_tokens))          AS avg_in,
       round(avg(output_tokens))         AS avg_out,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY output_tokens) AS p95_out
FROM   ai.llm_call_log
WHERE  feature = 'hint-bot' AND created_at >= now() - interval '1 day'
GROUP  BY model;

--  model      | requests | avg_in | avg_out | p95_out
--  chat-large |    19842 |    600 |    1350 |    2210`, "usage per feature"),

        h2("3. Core idea: a request has more than one price"),
        p("An LLM provider bills each request by tokens (lesson 1), and it prices the groups of tokens differently. The cost of one request is:"),
        code("text", `
cost = ( uncached input tokens x input price
       + cached input tokens   x cached input price
       + output tokens         x output price ) / 1,000,000      (prices are per 1M tokens)`, "cost of one request"),
        p("With example prices for three kinds of model:"),
        code("text", `
model        input / 1M   cached input / 1M   output / 1M   where it runs
chat-large     $2.50          $1.25             $10.00       provider API
chat-mini      $0.15          $0.075             $0.60       provider API
local-8b       $0             -                  $0          your own machine (Ollama)`, "example prices per 1M tokens"),
        callout("warning", "These are example prices, not today's prices",
            "Prices in this course are example prices per 1M tokens, chosen to make the arithmetic readable. Real prices differ between providers and models and change often. Always check the provider's current pricing page before you estimate, and put the date you checked next to the numbers in your estimate. A local model has no per-token price, but it is not free: you pay for the hardware, its electricity and the time to run it."),
        h3("Why output tokens usually cost more"),
        p("The model reads the whole input in one pass, in parallel. It writes the output one token at a time, and every new token needs another full pass through the model (lesson 1). Output is the slow, expensive part of the work, and price tables reflect that: output prices several times the input price are common. That is why the hint bot's 1,350 output tokens cost about nine times as much as its 600 input tokens."),
        h3("What counts as input"),
        p("Input is everything you send, not just what the learner typed: the system prompt or instructions, examples, retrieved documents, the learner's code, and in a chat **every earlier message and answer**. A chat API does not remember the conversation between requests; to continue it, the app sends the history again. Think about what the tenth request of a conversation contains before you estimate a chat feature from its first message."),
        h3("Cached input and hidden output"),
        bullets([
            "**Cached input.** When many requests start with the same long prefix (the same instructions, the same course material), many providers can reuse work on that prefix and bill those tokens at a lower cached price. The rules (minimum length, how long the cache lives, whether you must mark the prefix, whether the cached count is reported inside or next to the input count) differ by provider. Read them, then check `cached_tokens` or `cache_read_input_tokens` in real responses before you count on the discount.",
            "**Reasoning tokens.** Some models think before they answer and bill those hidden tokens as output, even though you never see them. The usage object reports them (for example `output_tokens_details.reasoning_tokens`). An answer that looks short can still be expensive.",
            "**Retries and regenerations.** A timeout that is retried, or a learner who clicks \"Another hint\", is another full request with its own input and output.",
        ]),
        callout("info", "When not to build a cost model",
            "An internal tool that makes 50 calls a day costs a few dollars a month on almost any model; a five-minute multiplication is enough. Spend effort on cost when a feature runs per learner, per page view or per submission, because that is where 20,000 requests a day come from. Either way, log the usage object from the first day: it is free and it is the only evidence you will have later."),

        challenge("chal_quiz_aif_211"),

        h2("4. Worked example: the estimate, redone from recorded usage"),
        p("The team replayed one day of logged hint requests through a small estimator. The pricing function is the formula from section 3, nothing more:"),
        code("typescript", `
// The hint bot sends no repeated prefix yet, so this first version has no cached-token term.
type Price = { inputPer1M: number; outputPer1M: number };

function costUsd(price: Price, inputTokens: number, outputTokens: number): number {
  return (inputTokens * price.inputPer1M + outputTokens * price.outputPer1M) / 1_000_000;
}

const chatLarge = { inputPer1M: 2.5, outputPer1M: 10 };   // example prices per 1M tokens
costUsd(chatLarge, 600, 0);      // 0.0015  what the spreadsheet priced
costUsd(chatLarge, 600, 1350);   // 0.015   what the provider billed`, "estimate/cost.ts"),
        p("The two calls are the whole incident in two lines: $0.0015 against $0.015 per hint. Multiply by 20,000 hints a day and 30 days and you get $900 against $9,000. When part of the input is served from the prompt cache, split the input into its uncached and cached parts and price each with its own rate, as in section 3."),
        h3("From one request to a month"),
        p("A monthly projection is: **average cost of one request x requests per day x days**. Use the **average** (the mean) of recorded requests, not a typical one. The bill is a sum, and a sum follows the mean. Hint answers have a long tail: the median hint might produce 1,100 tokens while the p95 produces 2,210, and a projection from the median would come out too low again."),
        code("text", `
recorded day: 19,842 hints, total cost $297.63
average cost per hint  = 297.63 / 19,842          = $0.0150
projection, 30 days    = 0.0150 x 20,000 x 30      = $9,000
same with a cap of 500 output tokens (measured avg 430 after the change):
average cost per hint  = (600 x 2.50 + 430 x 10.00) / 1,000,000 = $0.0058
projection, 30 days    = 0.0058 x 20,000 x 30      = $3,480`, "projection"),
        p("The last two lines show the point of the exercise: once output is in the model, the useful questions appear by themselves. Does a hint need 1,350 tokens? Would a shorter, more focused hint be better for learning anyway?"),

        h2("5. Bring the cost down, in this order"),
        numbered([
            "**Measure first.** Average and p95 of input and output tokens per feature, from the usage log. Without it every change below is a guess.",
            "**Shorter output.** Ask for what the screen shows (\"one hint, at most 3 sentences, no full solution\") and set a maximum output token limit (`max_output_tokens`, `max_tokens`, `num_predict` in Ollama) as a safety cap. A cap cuts the answer off mid-sentence when it is reached, so it is a limit, not an instruction: the instruction is what makes answers short.",
            "**Smaller input.** Send the failing test and the relevant part of the code, not the whole project; trim or summarise old chat turns (lesson 2).",
            "**Reuse the stable prefix.** Put the long, unchanging instructions first so the provider's prompt cache can apply, then confirm the cached count in the usage object.",
            "**A cheaper model for the easy cases.** Lesson 6 shows how to choose a model by quality, cost, latency and data. Do not switch models to save money before you have a way to check that the answers are still good enough.",
        ]),

        h2("6. How to verify an estimate"),
        bullets([
            "**One day of real usage beats any spreadsheet.** Run the feature for a small share of learners, then compare your estimator's total for that day with the provider's usage page. They should agree to within rounding.",
            "**Recompute the bill from the export.** Input tokens x input price plus output tokens x output price must give the cost column. If it does not, you are missing a token group (cached, reasoning) or using the wrong price.",
            "**Count tokens with the provider's tools, not with words or characters.** Use the provider's token-counting endpoint or tokenizer library on real prompts. Text in Vietnamese, code and JSON often take more tokens per word than English prose (lesson 1).",
            "**Set a budget alert** in the provider's console at, say, 120% of the projection. It is the alarm the hint bot did not have.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Pricing only the prompt.** The incident. Spot it: the estimate has one token column and one price. A correct one has at least two of each.",
            "**Counting only what the user typed.** The system prompt, examples, retrieved documents and chat history are input too. Spot it: logged `input_tokens` is several times the length of the user's message.",
            "**Estimating from words or characters.** Token counts differ by language and content. Spot it: your estimate and the usage log disagree on input tokens before price even enters the picture.",
            "**Assuming every provider reports cached tokens the same way.** In some APIs the cached count is inside the input count, in others it is a separate number to add. Spot it: recompute one real response by hand from the provider's documentation.",
            "**Mixing price units.** Some old price lists and blog posts quote per 1K tokens, current tables usually per 1M. Spot it: a cost per request that is a thousand times too high or too low compared with the usage page. Lesson 5 has a script with exactly this bug.",
        ]),

        h2("8. Your turn: the estimate the hint bot needed"),
        p("Write the estimator the team should have run before launch. It reads a price table and a list of recorded requests and prints the cost of each request, the totals per model and overall, and a monthly projection. A request for a model that is not in the price table, or with impossible token counts, must become an error line in the report, not a crash: one bad log row should not hide the cost of the other 19,841."),
        code("typescript", `
function requestCost(price: Price, r: LlmRequest): number {
  // (uncached input x input price + cached input x cached price + output x output price) / 1,000,000
}

function estimate(input: Input): string[] {
  // one line per request (cost or error), then one line per model, then the total and the month
}`),
        challenge("chal_coding_aif_212"),

        h2("9. Summary"),
        bullets([
            "A request is billed for input tokens and output tokens at different prices (plus cached input and hidden reasoning tokens with some models); output is usually the more expensive side.",
            "Input is everything you send: instructions, context, code and the whole chat history, which grows with every turn.",
            "Estimate from logged usage: average cost per request x requests per day x days, with example prices replaced by the provider's current ones and the date you checked them.",
        ]),

        h2("Sources"),
        bullets([
            "OpenAI API documentation, text generation and the usage object of a response - platform.openai.com/docs/guides/text",
            "Anthropic documentation, Messages API usage fields and prompt caching - docs.anthropic.com",
            "Ollama documentation, REST API generate endpoint (prompt_eval_count, eval_count), linked from ollama.com; model list - ollama.com/library",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take one feature you use or plan to build with an LLM. Write down the instructions, a typical user input and a typical answer, count their tokens with your provider's tokenizer, and price them with today's prices from the provider's pricing page (note the date). If you have an API key, send ten real requests and compare your estimate with the usage object of each response. Then do the same with a small local model in Ollama and note what you pay instead of tokens."),
    ],
});
