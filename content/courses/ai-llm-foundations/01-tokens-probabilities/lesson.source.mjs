// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aif-1-1",
    title: "How an LLM writes text: tokens, probabilities & the next word",
    slug: { _type: "slug", current: "llm-tokens-probabilities-next-word" },
    description:
        "CodeDev's hint bot cut Vietnamese explanations in the middle of a sentence and cost twice the estimate for Vietnamese learners. Learn what a token is and why the same sentence costs more tokens in Vietnamese than in English, how a model picks the next token from probabilities, what the max output tokens limit does, how to read the stop reason (\"length\" versus \"stop\") and why a model answers from what it learned instead of looking things up.",
    estimatedTime: 20,

    scenario: {
        role: "Full-stack developer, CodeDev learning platform",
        problem:
            "Two weeks after CodeDev added Vietnamese to the \"Explain my error\" hint bot, support received 37 screenshots of hints that stop in the middle of a sentence, all of them in Vietnamese. The same week, finance flagged that the hint bot's bill for Vietnamese learners was about twice the estimate in the launch plan. The English hints, sent through the same code and the same model, look complete and cost what was planned.",
    },

    content: [
        h2("1. The incident: hints that stop mid-sentence"),
        p("The \"Explain my error\" button on https://app.codedev.test sends the learner's compiler error and code to a hosted large language model (LLM) and shows the answer under the editor. A Vietnamese learner who hit TypeScript error 2588 got this hint:"),
        code("text", `
Lỗi này xảy ra vì biến \`count\` được khai báo bằng \`const\`, nên khi vòng lặp
cố gắng gán lại giá trị cho nó, TypeScript báo lỗi 2588. Để sửa, bạn có thể`, "hint shown to the learner"),
        p("The last words mean \"To fix it, you can\", and then nothing. The launch plan had estimated the cost per hint from English hints and set a limit of 300 output tokens per answer, \"almost twice the average hint\". Nobody had measured a Vietnamese hint."),
        p("This lesson explains the three facts behind both symptoms: models read and write **tokens**, not words or characters; they write one token at a time until something tells them to stop; and the API tells you which thing that was."),

        h2("2. Read the evidence"),
        p("The hint service logs one line per request with the numbers the API returned. Two requests from the same minute, for the same error, in the two languages:"),
        code("text", `
2026-10-12T09:41:07Z hint.generate lang=en input_tokens=612  output_tokens=174 max_output=300 stop=stop   latency_ms=2310
2026-10-12T09:41:19Z hint.generate lang=vi input_tokens=1148 output_tokens=300 max_output=300 stop=length latency_ms=3950`, "hint-service log"),
        p("Three things stand out. The Vietnamese request used almost twice as many input tokens for the same instructions and the same code. Its output used exactly 300 tokens, the limit. And its stop reason is `length`, not `stop`. Counting over the whole week tells the same story:"),
        code("sql", `
SELECT lang,
       count(*)                                         AS hints,
       round(avg(output_tokens))                        AS avg_output,
       round(100.0 * avg((stop = 'length')::int), 1)    AS pct_cut
FROM   hint_requests
WHERE  created_at >= now() - interval '7 days'
GROUP  BY lang;

 lang | hints | avg_output | pct_cut
------+-------+------------+---------
 en   |  9120 |        181 |     0.4
 vi   |  3315 |        287 |    41.2`, "psql"),
        p("41% of Vietnamese hints hit the limit. The average is held down to 287 only because the cut answers cannot go above 300; the real length the model wanted to write is higher."),

        h2("3. Tokens: what the model actually reads"),
        p("A model does not see letters or words. Before your text reaches it, a **tokenizer** splits it into **tokens**: frequent pieces of text taken from a fixed vocabulary of tens of thousands of entries. A common English word is often one token, a space usually belongs to the word after it, and a rare or long word is split into several pieces. An illustrative split (the `|` marks token boundaries):"),
        code("text", `
English    The| loop| tries| to| reassign| count|,| which| is| const|.
           11 tokens for 9 words

Vietnamese V|òng| l|ặp| c|ố| g|ắng| g|án| lại| bi|ến| count|,| v|ốn| là| const|.
           20 tokens for 11 words`, "illustrative tokenization"),
        callout("info", "Every model family has its own tokenizer",
            "The split above is an illustration, not the output of one particular model. GPT, Claude, Gemini, DeepSeek and the open models you run with Ollama each use their own vocabulary, so the same text gives different counts. Never copy token counts from one model to another: count with the tokenizer of the model you call."),
        p("Why does Vietnamese cost more? Tokenizer vocabularies are built from training text, and most of that text is English. English words got their own tokens; Vietnamese syllables with diacritics such as `ặ` or `ế` are rarer, so they are often split into smaller pieces. Newer tokenizers have narrowed the gap, but for many models Vietnamese (like Thai, Hindi or Korean) still needs noticeably more tokens for the same meaning. The same is true of code: indentation, long identifiers and minified JSON all have their own token cost."),
        p("Tokens matter to you for three reasons, all of which appear in the incident:"),
        bullets([
            "**Price.** Providers bill per token, with separate prices for input and output tokens (lesson 2.1). Twice the tokens is twice the bill.",
            "**Limits.** The context window (lesson 1.2) and the output limit are counted in tokens, not characters.",
            "**Time.** The model writes output one token at a time, so more output tokens means a longer wait (lesson 2.2). The Vietnamese request above took 3.95 s instead of 2.31 s.",
        ]),
        p("A rule of thumb for English is about 4 characters or three quarters of a word per token. It is useful for a first guess about English prose and wrong for everything else. The launch plan used it for every language."),

        h2("4. The next token: probabilities, not lookups"),
        p("Generation is a loop. The model reads all the tokens so far (your prompt plus whatever it has already written) and computes a **probability for every token in its vocabulary** being the next one. One token is chosen, appended, and the loop runs again. Some APIs can return the top candidates with their log-probabilities; turned into percentages, one step of the hint looks like this:"),
        code("text", `
text so far: "The loop tries to reassign count, which is declared with"

candidate next token     probability
" const"                     0.71
" the"                       0.12
" a"                         0.06
" let"                       0.04
" readonly"                  0.02
...  (the rest of the vocabulary shares the remaining 0.05)`, "recorded top-5 next-token probabilities"),
        p("How one token is chosen from that list is controlled by settings such as temperature, which is lesson 1.3. What matters here is what the probabilities come from. During training the model adjusted billions of numbers (its **weights**) so that it predicts the next token of real text well. After training those numbers are fixed. When you send a request, the model has exactly two sources: its weights and the tokens in your request. Nothing else."),
        h3("Why a model does not \"look things up\""),
        p("There is no database query inside the model and no web search. When it writes \"TS2588 means you assigned to a const\", it is not reading the TypeScript documentation; it produces the tokens that are most likely after your prompt, given everything it saw in training. For a common error, the likely text is usually also the correct text. For a rare error code, a library released after the model's training data was collected, or a fact about your own platform, the most likely text can be fluent and wrong (lesson 3.1)."),
        callout("warning", "The chat app is not the model",
            "ChatGPT, Gemini, Claude and DeepSeek as apps can search the web or read your files, because the app runs a search and puts the results into the prompt before the model writes. A plain API call does not do that unless your code does it (lesson 3.2). Do not assume your API integration knows what the chat app seemed to know."),

        h2("5. Stopping: max output tokens and the stop reason"),
        p("The loop has to end somehow. In practice one of these ends it:"),
        bullets([
            "**The model chooses to stop.** It produces a special end token because, given its training, the answer is complete. This is the normal case.",
            "**The output limit is reached.** You set a maximum number of output tokens in the request. When the model has written that many, the API stops it immediately, in the middle of a word if necessary. It does not shorten the answer to fit; it cuts it.",
            "**A stop sequence appears.** Some APIs let you give strings, such as `\"\\n\\nQuestion:\"`, that end the output when the model writes them.",
            "**Something else.** A content filter, a tool call or a context window that is already full (lesson 1.2) has its own reason value.",
        ]),
        p("Every response tells you which one happened. The field names differ between providers, the idea does not:"),
        code("text", `
                    output limit (request)      finished normally        cut by the limit
OpenAI Chat         max_completion_tokens       finish_reason "stop"     finish_reason "length"
Anthropic Messages  max_tokens                  stop_reason "end_turn"   stop_reason "max_tokens"
Google Gemini       maxOutputTokens             finishReason "STOP"      finishReason "MAX_TOKENS"
Ollama (local)      options.num_predict         done_reason "stop"       done_reason "length"`, "field names (check each provider's current API reference)"),
        p("The hint service read only the text and ignored the stop reason, so a cut answer looked exactly like a finished one. Writing \"answer in at most 120 words\" in the prompt helps the model aim for a length, but it is a request, not a limit: only the max output tokens setting is enforced, and only the stop reason tells you whether it was hit."),

        challenge("chal_quiz_aif_111"),

        h2("6. Worked example: count, limit, check"),
        p("Here is the hint call written the way it should have been, with the OpenAI Node SDK. The model name comes from configuration because model lists change; `usage` and `finish_reason` are logged on every call:"),
        code("typescript", `
import OpenAI from "openai";

const client = new OpenAI();                       // reads OPENAI_API_KEY from the environment
const MAX_OUTPUT: Record<"en" | "vi", number> = { en: 400, vi: 700 };   // from measured p95, see section 7

export async function explainError(lang: "en" | "vi", rules: string, question: string) {
    const response = await client.chat.completions.create({
        model: process.env.HINT_MODEL!,           // e.g. a small, cheap model; lesson 2.3
        max_completion_tokens: MAX_OUTPUT[lang],
        messages: [
            { role: "system", content: rules },
            { role: "user", content: question },
        ],
    });
    const choice = response.choices[0];
    console.log("hint.generate", JSON.stringify({
        lang,
        input_tokens: response.usage?.prompt_tokens,
        output_tokens: response.usage?.completion_tokens,
        stop: choice.finish_reason,
    }));
    if (choice.finish_reason === "length") {
        return { complete: false as const, text: choice.message.content ?? "" };
    }
    return { complete: true as const, text: choice.message.content ?? "" };
}`, "explainError.ts"),
        p("The same request with the Anthropic SDK differs only in names: `max_tokens` is required, the system prompt is a separate `system` field, and the result has `stop_reason` and `usage.input_tokens` / `usage.output_tokens`. With Ollama on your own machine, `curl http://localhost:11434/api/generate` returns `prompt_eval_count`, `eval_count` and `done_reason` in its JSON, which is a free way to watch tokens and stop reasons without an API key."),
        p("The UI then treats `complete: false` as what it is: a partial answer. Show it with a clear \"The explanation was cut off\" note and a \"Show more\" button that asks for a continuation, or ask again with a request for a shorter answer. Never present a cut answer as a finished one."),
        callout("info", "Prices in this course are examples",
            "When a lesson shows a price, it is an example price to practise the arithmetic. Prices, limits and model names change often: check the provider's current pricing page before you estimate a real budget."),

        h2("7. How to verify"),
        numbered([
            "**Count with the real tokenizer.** Take 50 recent hints per language and count their tokens with your model's own counter: `tiktoken` / `js-tiktoken` for OpenAI models, the `messages.countTokens` endpoint for Claude, `countTokens` for Gemini, or the counts in an Ollama response. Compare tokens per character across languages instead of trusting a rule of thumb.",
            "**Set the limit from measurements.** Look at the 95th percentile of output tokens for answers that finished with `stop`, per language, and set the limit above it. A limit below the length a normal answer needs is a bug, not a saving.",
            "**Watch the stop reason.** Log it on every call and chart the share of `length` per language and per feature. It should be close to zero; a jump after a prompt or model change is the first sign of cut answers.",
            "**Budget per language.** Estimate cost from measured tokens per hint for each language, not from one average. The incident's \"twice the estimate\" is the measured Vietnamese ratio, visible in the log in section 2 before any bill arrived.",
        ]),

        h2("8. Common mistakes and how to spot them"),
        bullets([
            "**Estimating tokens from English.** Words times 1.33 underestimates Vietnamese, code and JSON. Spot it by comparing a few real token counts per language with your estimate.",
            "**Ignoring the stop reason.** A cut answer and a complete one have the same type in your code. Spot it by searching the integration for `finish_reason` / `stop_reason`; if nothing reads it, cut answers are invisible.",
            "**Using the output limit as a length instruction.** A small `max_tokens` does not make the model write a short answer, it cuts a long one. Spot it when the `length` share rises right after someone lowered the limit to save money.",
            "**Copying token counts between models.** A count measured with one model's tokenizer does not hold for another. Spot it when the bill does not match the estimate after a model switch.",
            "**Trusting the model as a reference.** A confident answer about a rare error code or a new library version may be likely text, not a fact. Spot it by checking answers about recent or rare topics against the documentation (lesson 3.1).",
        ]),

        h2("9. Summary"),
        numbered([
            "Models read and write tokens from their own tokenizer. Token counts drive price, limits and time, and they differ by language and by model: Vietnamese often needs far more tokens than English for the same meaning.",
            "The model writes one token at a time, each chosen from probabilities computed from its fixed weights and your prompt; it does not look anything up unless your application puts the information into the prompt.",
            "Output stops when the model ends it, when max output tokens is reached, or for another reason the API reports. Read the stop reason on every call: `length` means the answer was cut.",
        ]),

        h2("Sources"),
        bullets([
            "OpenAI API docs, Text generation guide and the Chat Completions reference (max_completion_tokens, finish_reason, usage) - platform.openai.com/docs/guides/text",
            "Anthropic docs, Messages API (max_tokens, stop_reason, usage) and Token counting",
            "Ollama API docs, Generate a completion (prompt_eval_count, eval_count, done_reason) - ollama.com",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Install Ollama, pull a small model and send the same short explanation in English and in Vietnamese with \"stream\": false. Compare prompt_eval_count for the two prompts. Then set options.num_predict to 20 and check that done_reason changes to \"length\" and the answer stops mid-sentence."),
    ],
});
