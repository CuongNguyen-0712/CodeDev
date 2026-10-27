// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aif-1-2",
    title: "What fits in the context window, and what gets cut",
    slug: { _type: "slug", current: "llm-context-window-what-gets-cut" },
    description:
        "Long chats with CodeDev's tutor failed with \"context_length_exceeded\", and the first fix trimmed the oldest messages, which removed the system prompt and let the tutor hand out full solutions. Learn what the context window holds (input and output together), why a model remembers nothing between requests, what a long context costs, and how to trim a chat safely: keep the system prompt and the newest question, fill backwards with whole messages, and reserve room for the answer.",
    estimatedTime: 25,

    scenario: {
        role: "Full-stack developer, CodeDev learning platform",
        problem:
            "Learners who chat with the AI tutor for a long time on one challenge get \"Something went wrong\" after about 30 messages. A hotfix that sends only the last 20 messages made the error go away, but three days later a mentor reported that the tutor now pastes complete solutions when a learner insists, which the tutor's rules forbid. The rules are in the system prompt, and nobody changed it.",
    },

    content: [
        h2("1. The incident: a fix that removed the rules"),
        p("The tutor panel next to each challenge on https://app.codedev.test keeps the whole conversation and sends it to the model on every turn. Its system prompt, about 650 tokens, starts like this:"),
        code("text", `
You are the CodeDev tutor for the challenge below. Never write a complete solution.
Give one hint step at a time and end with a question that makes the learner think.
...`, "tutor system prompt (start)"),
        p("Long conversations started failing. The API answered with an error, and the panel showed a generic message:"),
        code("text", `
2026-10-19T14:02:11Z tutor.chat conv=c_8812 turn=31 messages=31 input_tokens=7650 max_output=1000
  -> 400 {"error":{"code":"context_length_exceeded","message":"This model's maximum context length
     is 8192 tokens. However, you requested 8650 tokens (7650 in the messages, 1000 in the completion)."}}`, "tutor-service log"),
        p("The hotfix was one line. It sent the system prompt followed by the history, and kept only the last 20 entries:"),
        code("typescript", `
// tutor/buildMessages.ts - the hotfix
const messages = [{ role: "system", content: TUTOR_RULES }, ...history].slice(-20);`, "buildMessages.ts"),
        p("For chats shorter than 20 entries nothing changed. For longer ones, `slice(-20)` cut from the front of the array, and the front of the array was the system prompt. From then on, the model received a conversation with no rules at all, and \"just give me the code, please\" got the code."),

        h2("2. Read the evidence"),
        p("The error message already contains the arithmetic: 7650 tokens of messages plus 1000 tokens requested for the answer is 8650, more than the 8192 the model accepts. The request log of the tutor after the hotfix shows the second problem:"),
        code("text", `
conv=c_8812 turn=41 messages=20 first_role=user  input_tokens=4310 max_output=1000 stop=stop
conv=c_9030 turn=12 messages=12 first_role=system input_tokens=2240 max_output=1000 stop=stop`, "tutor-service log, after the hotfix"),
        p("`first_role=user` on a long chat means the request started without a system message. Logging the role of the first message was enough to find every affected conversation:"),
        code("sql", `
SELECT count(DISTINCT conversation_id) AS chats_without_rules
FROM   tutor_requests
WHERE  first_role <> 'system'
  AND  created_at >= '2026-10-19';

 chats_without_rules
---------------------
                 214`, "psql"),

        h2("3. The context window"),
        p("The **context window** is the maximum number of tokens one request can involve: everything the model reads **plus** everything it writes. If the input is 7650 tokens and the model may write up to 1000, the request needs 8650 tokens of room. Some providers reject a request whose input plus output limit is too large, as here; others accept it and simply stop the answer early when the window is full. Either way, input and output share one budget."),
        p("What goes into the input is up to your application:"),
        bullets([
            "**The system prompt**: the rules and role of the assistant.",
            "**The conversation so far**: every earlier question and answer you choose to resend.",
            "**Extra material**: the learner's code, the challenge text, documents you retrieved (lesson 3.2), tool results.",
            "**The new question.**",
        ]),
        h3("The model remembers nothing between requests"),
        p("This is the fact the hotfix missed. A chat model has no memory of earlier requests. Each API call is independent: the model sees only the tokens in that call. The \"conversation\" exists because your application stores it and sends it again every time. If a message is not in the request, for the model it never happened, and that includes the system prompt. Chat apps such as ChatGPT, Gemini or Claude do the same thing behind the scenes, plus their own features for remembering facts across chats."),
        h3("Bigger windows are not free"),
        p("Context windows range from a few thousand tokens for small local models to hundreds of thousands, and over a million for some hosted models (check the model page of your provider; the numbers change). A large window removes the error, but not the costs:"),
        bullets([
            "**You pay for every input token on every turn.** A chat that resends its history pays for message 1 again on turn 2, 3, 4 and so on, so the total cost of a conversation grows much faster than its length (lesson 2.1).",
            "**Time.** More input tokens take longer to process before the first output token appears (lesson 2.2).",
            "**Attention.** Research on long contexts (for example \"Lost in the Middle\", Liu et al., 2023) found that models use information at the start and end of a long input more reliably than information in the middle. A 300-message chat may fit and still be followed badly.",
        ]),
        callout("info", "When not to build a trimming policy",
            "If your conversations are short (a single question and answer, or a few turns) and you have measured that the longest real ones stay far below the window, you do not need trimming yet: log input tokens per request and add it when the numbers approach the limit. The tutor needed it because learners stay on one challenge for hours."),

        h2("4. A safe trimming policy"),
        p("When the history does not fit, something has to go. The simplest policy that works keeps what matters most and removes from the oldest end:"),
        numbered([
            "**Reserve the output first.** The budget for the input is the context window minus the max output tokens you will request. Trimming the input to exactly the window leaves no room for the answer.",
            "**Always keep the system prompt.** It is not part of the conversation; it is the configuration of the assistant. It goes first in every request.",
            "**Always keep the newest message.** It is the question being answered. If the system prompt and the newest message alone do not fit, no trimming can help: tell the user the message is too long.",
            "**Fill backwards with whole messages.** Add the previous message, then the one before it, while the total stays within the budget. A message cut in half (half a code block, half an instruction) confuses the model more than a missing one.",
            "**Stop at the first message that does not fit.** Skipping a large message and adding older ones would leave a hole in the middle, so the model would see answers to questions it cannot read.",
            "**Send in chronological order and record what was dropped.** The model expects the conversation oldest first; the dropped list lets you log it and tell the user.",
        ]),
        p("Counting tokens per request is too slow and too late; count them per message, once, when the message is stored, with the model's tokenizer (lesson 1.1), and keep the number next to the message. Each message also costs a few tokens of formatting overhead in the API's chat format, so either include that overhead in the stored count or keep a small safety margin in the budget."),
        callout("warning", "Summaries are a second step, not the first",
            "A common upgrade is to replace the dropped messages with a short summary written by a model. It keeps more of the conversation, but it costs an extra model call, can lose or distort details, and needs its own tests. Start with trimming plus a clear notice; add a summary only when learners actually need older context."),

        challenge("chal_quiz_aif_121"),

        h2("5. Worked example: using a trim plan"),
        p("The trimming itself is the exercise below. Around it, the tutor service needs very little code: build the request from the plan, request exactly the output tokens that were reserved, and tell the learner when older messages were left out. A plan is either an error or the ids to send:"),
        code("typescript", `
type ContextPlan =
    | { sent: string[]; dropped: string[]; inputTokens: number }
    | { error: "invalid_input" | "does_not_fit" };

const CONTEXT_LIMIT = 8192;      // from the model page; check it when you change models
const MAX_OUTPUT = 1000;

export async function tutorTurn(conv: Conversation) {
    const plan = fitContext({
        contextLimit: CONTEXT_LIMIT,
        reservedOutputTokens: MAX_OUTPUT,
        system: { id: "system", tokens: TUTOR_RULES_TOKENS },
        history: conv.messages.map(({ id, role, tokens }) => ({ id, role, tokens })),
    });
    if ("error" in plan) {
        return { reply: "Your message is too long for the tutor. Shorten it or send the code in parts." };
    }
    const byId = new Map(conv.messages.map((m) => [m.id, m]));
    const messages = [
        { role: "system" as const, content: TUTOR_RULES },
        ...plan.sent.slice(1).map((id) => ({ role: byId.get(id)!.role, content: byId.get(id)!.content })),
    ];
    console.log(JSON.stringify({ conv: conv.id, input_tokens: plan.inputTokens, dropped: plan.dropped.length, first_role: messages[0].role }));

    const response = await client.chat.completions.create({
        model: process.env.TUTOR_MODEL!,
        max_completion_tokens: MAX_OUTPUT,          // the same number that was reserved
        messages,
    });
    return {
        reply: response.choices[0].message.content ?? "",
        notice: plan.dropped.length > 0 ? "The tutor no longer sees the oldest messages of this chat." : null,
    };
}`, "tutorTurn.ts"),
        p("Two details matter. The reserved output and `max_completion_tokens` are the same constant, so they cannot drift apart. And the log line records `first_role` and the number of dropped messages on every request, which is exactly the evidence that would have caught the hotfix on day one. The Anthropic SDK takes the system prompt as a separate `system` field instead of a message, which makes it harder to trim by accident; the budget rule is the same."),
        p("Now write `fitContext`. The starter gives the exact rules; the tests replay recorded chats with precomputed token counts, including the incident's 15-message conversation."),
        challenge("chal_coding_aif_122"),

        h2("6. How to verify"),
        bullets([
            "**Unit tests on recorded chats.** Token counts are just numbers, so a test needs no model: a chat that fits, the incident chat, a message that lands exactly on the budget, a huge last message, and a chat with a large message in the middle.",
            "**An invariant in every test.** The first id sent is the system prompt and the last is the newest message, whatever the input.",
            "**Production logs.** Log input tokens, the number of dropped messages and the role of the first message per request. Alert if `first_role` is ever not `system`, and watch how often input tokens approach the budget.",
            "**Replay the longest real chats.** Export the 20 longest conversations, run them through the plan and check that none fails and none loses the system prompt.",
            "**Check the API's own numbers.** Compare your `inputTokens` with the `usage` the API returns for the same request; a steady gap is the per-message overhead you need to include.",
        ]),

        h2("7. Common mistakes and how to spot them"),
        bullets([
            "**Trimming the system prompt with the history.** `slice(-N)` or `shift()` on an array whose first element is the system message. Spot it by logging the role of the first message sent.",
            "**Forgetting the output.** Trimming the input to the full window leaves no room for the answer: the request is rejected or the answer stops after a few tokens with stop reason `length`. Spot it by checking that the budget subtracts the max output tokens.",
            "**Counting messages instead of tokens.** \"Keep the last 20 messages\" fits 20 short messages and fails on 20 messages with pasted code. Spot it by testing with a few very long messages.",
            "**Cutting a message in half, or leaving a hole.** Truncated code blocks and answers without their question make the model guess. Spot it with a test that has a large message in the middle of the chat.",
            "**Dropping silently.** The learner refers to something from an hour ago and the tutor acts as if it never happened. Spot it in support tickets; prevent it with a visible notice.",
        ]),

        h2("8. Summary"),
        numbered([
            "The context window is one token budget for the whole request: system prompt, history, extra material, the new question and the answer. The model remembers nothing between requests; your application resends what it should know.",
            "Long contexts fit more but cost more on every turn, take longer and are followed less reliably in the middle. Measure before you build trimming, and log input tokens per request.",
            "Trim safely: reserve the output, keep the system prompt and the newest message, fill backwards with whole messages, stop at the first that does not fit, send in order and tell the user what was dropped.",
        ]),

        h2("Sources"),
        bullets([
            "OpenAI API docs, Text generation and Conversation state (each request carries the conversation you send) - platform.openai.com/docs/guides/text",
            "Anthropic docs, Context windows and Token counting - docs.anthropic.com",
            "Liu et al., \"Lost in the Middle: How Language Models Use Long Contexts\", 2023 (arXiv:2307.03172)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Run a small model locally with Ollama, set options.num_ctx to 2048 and keep a chat going by resending the history yourself. Watch prompt_eval_count grow with every turn, then add your fitContext before each request and check that the first message is always the system prompt."),
    ],
});
