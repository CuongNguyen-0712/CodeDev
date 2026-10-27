// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aif-3-2",
    title: "Grounding answers in documents and allowing \"I'm not sure\"",
    slug: { _type: "slug", current: "grounding-answers-in-documents-allowing-not-sure" },
    description:
        "The CodeDev billing FAQ bot promised a learner a 30-day refund although the policy says 7 days - and its system prompt already said \"Do not hallucinate\". Learn why that sentence cannot work, how to ground answers in the documents you provide, how to turn citations into links a user can click and a test can check, how to refuse politely when the documents do not cover a question, and how to measure all of it with a small eval set instead of a feeling.",
    estimatedTime: 20,

    scenario: {
        role: "Developer on the CodeDev growth team, owner of the billing FAQ bot",
        problem:
            "Four days after the support bot was fixed, ticket #2318 arrives: the billing FAQ bot told a learner that premium courses can be refunded within 30 days. The refund policy says 7 days, and only if less than 20% of the lessons are finished. The learner asked for the refund on day 12, quoting the bot. The bot's system prompt already contains \"IMPORTANT: Never make up information. Do not hallucinate.\" Your lead asks for a fix that you can show works, not another sentence in the prompt.",
    },

    content: [
        h2("1. The incident"),
        p("The billing FAQ bot was built quickly, by a different team, before the support-bot incident of lesson 3.1. When that incident went round, someone added one line to its system prompt as a precaution. Here is the whole prompt and the conversation from ticket #2318:"),
        code("text", `
You are the CodeDev billing assistant. Answer questions about prices, points and refunds.
IMPORTANT: Never make up information. Do not hallucinate.

Question: Can I get a refund for a premium course I bought last week?`, "Prompt log, request fq_3c90"),
        code("text", `
learner u_7310  Can I get a refund for a premium course I bought last week?
billing bot     Yes! Premium courses can be refunded within 30 days of purchase, no questions
                asked. Open Profile > Orders and choose "Request refund".`, "Billing widget, conversation fq_3c90"),
        code("text", `
Refunds (https://app.codedev.test/help/refunds)
A premium course can be refunded within 7 days of purchase if less than 20% of its
lessons are finished. Courses paid with points are not refunded; the points are returned
instead. Request it from Profile > Orders.`, "The refund policy page"),
        code("text", `
2026-10-24T10:42:51Z billing-bot req=fq_3c90 model=chat-small-2025-01 temperature=0.3
  input_tokens=52 output_tokens=41 docs_attached=0 finish_reason=stop`, "billing-bot request log"),
        p("You have seen this shape before: `docs_attached=0`, a prompt that asks for an answer every time, and a fluent, specific answer. \"30 days, no questions asked\" is one of the most common refund phrases on the web, which is why it is a likely continuation. The new line in the prompt changed nothing, and this lesson explains why."),

        h2("2. Why \"Do not hallucinate\" cannot work on its own"),
        p("An instruction can only change what the model does with information it has. \"Do not hallucinate\" assumes two things the model does not have:"),
        bullets([
            "**The facts.** The refund policy is not in the prompt and almost certainly not in the training data: it is CodeDev's own page, and it may have changed since the model's cutoff. No instruction can create the missing \"7 days\".",
            "**A reliable sense of what it does not know.** The model writes the most likely next tokens. It has no separate signal that says \"this sentence is invented\": \"30 days\" and \"7 days\" are produced by the same process. Asking it to be \"100% sure\" asks for a check it cannot reliably do.",
        ]),
        p("Such instructions are not useless - telling a model how to behave when it lacks information is part of a good prompt, as you will see below. They are useless **alone**, and their effect is unmeasured. Some prompts with \"only answer if you are sure\" start refusing questions the model could answer, and nobody notices because nobody counts. The fix is the same as in lesson 3.1: give the model the facts, a rule, and a way out - then measure."),
        callout("info", "When not to ground",
            "Grounding is for questions with a factual answer that lives in your documents: prices, limits, policies, API signatures, deadlines. A model that drafts a welcome message, suggests names for a study group or rephrases a hint does not need sources, and forcing citations there only makes the output worse. Decide per feature, not for the whole product."),

        h2("3. Grounding in provided documents"),
        p("Grounding means the answer is built from documents you put into the prompt, not from the model's memory. The simplest working version has three steps:"),
        numbered([
            "**Split your help pages into short sections with stable ids**, such as `refund-policy`, `points-pricing`, `certificates`. One section, one topic. The id must not change when the text is edited, because citations, logs and tests refer to it.",
            "**Retrieve a few sections for each question.** Start with the simplest search that works on your pages: keyword or tag matching over a few dozen sections is often enough. Move to embedding (vector) search when your eval set shows that the right section is not being found - not before.",
            "**Put the top sections into the prompt** as `[id] title` plus text, with a rule to answer only from them and cite the ids, and an allowed \"I'm not sure\". How many sections fit is a budget decision: each one costs input tokens (lesson 2.1) and space in the context window (lesson 1.2).",
        ]),
        p("Grounding does not make the model infallible. It can still misread a section or combine two sections wrongly. What it changes is that every answer now has a **source** you can show, check and test - and when the documents are wrong, you fix the documents, not the model."),

        h2("4. Citations a user can click"),
        p("A citation like `[refund-policy]` is useful twice: the user can open the page and read the rule themselves, and your code can check that the answer is tied to a page that was really in the prompt. Never show citations as raw ids, and never trust them blindly: a model can produce an id that looks right but was not sent, just as it produced `force: true`."),
        code("typescript", `
type Section = { id: string; title: string; url: string; text: string };
type Checked =
  | { kind: "answer"; text: string; links: { title: string; url: string }[] }
  | { kind: "unsure"; text: string }
  | { kind: "reject"; reason: string };

const CITATION = /\\[([a-z0-9-]+)\\]/g;

function checkAnswer(answer: string, sent: Section[]): Checked {
  if (answer.startsWith("I'm not sure")) return { kind: "unsure", text: answer };
  const ids = [...new Set([...answer.matchAll(CITATION)].map((m) => m[1]))];
  if (ids.length === 0) return { kind: "reject", reason: "no citation" };
  const links: { title: string; url: string }[] = [];
  for (const id of ids) {
    const section = sent.find((s) => s.id === id);
    if (!section) return { kind: "reject", reason: \`cites \${id}, which was not in the prompt\` };
    links.push({ title: section.title, url: section.url });
  }
  return { kind: "answer", text: answer.replace(CITATION, "").trim(), links };
}`, "lib/bot/checkAnswer.ts"),
        p("A rejected answer is never shown. The widget shows the polite \"I'm not sure\" message instead (section 5) and the request is logged with the reason, so a run of rejections shows up on a dashboard. The links are rendered under the answer as \"Source: Refunds\" with the page URL - the user does not need to trust the bot, they can check."),
        callout("tip", "Check the claim, not only the id",
            "A valid id proves the page was in the prompt, not that the page says what the answer says. In the eval set (section 6), add an expected phrase for important facts - for example the answer about refunds must contain \"7 days\" - so that a correct citation attached to a wrong number still fails."),

        challenge("chal_quiz_aif_321"),

        h2("5. Refusing politely when the documents do not cover it"),
        p("\"I'm not sure\" is a correct answer when the documents do not answer the question. It is only a good answer if it is useful. Compare:"),
        code("text", `
Bad:   I'm sorry, I cannot help with that.
Good:  I'm not sure - the help pages I have do not cover refunds for courses paid
       partly with points. A person on the billing team can check your order:
       [Contact billing support]   Related: Refunds`, "Two ways to say \"I'm not sure\""),
        bullets([
            "**Say what is not covered**, in the user's words, so they know the bot understood the question.",
            "**Offer the next step**: a human handoff (a support form with the conversation attached) and, if retrieval found something close, a link to it.",
            "**Do not apologise in a loop or guess \"probably\"**. A hedged guess is still a guess; the learner in ticket #2318 would have acted on \"probably 30 days\" too.",
            "**Watch for over-refusal.** A bot that says \"I'm not sure\" to everything is safe and useless. The eval set must contain answerable questions that it is expected to answer.",
        ]),

        h2("6. Measuring with a small eval set"),
        p("You cannot see hallucinations by reading a few answers: the wrong ones look exactly like the right ones. You can count them. An eval set is a list of real questions, each labelled with what a correct reply looks like:"),
        code("json", `
[
  { "question": "Can I get a refund for a premium course I bought last week?",
    "mustCite": "refund-policy", "mustContain": "7 days" },
  { "question": "What happens to my points if a course is refunded?",
    "mustCite": "refund-policy", "mustContain": "points are returned" },
  { "question": "How many points does a premium course cost?", "mustCite": "points-pricing" },
  { "question": "Can I get a refund for a course my company paid by invoice?", "mustBeUnsure": true },
  { "question": "Can I pay for a course in instalments?", "mustBeUnsure": true }
]`, "eval/billing-bot.cases.json"),
        p("Each run sorts every reply into one of four buckets: **grounded** (cites the expected page, contains the expected phrase), **correctly unsure**, **invented** (an answer where \"I'm not sure\" was expected, or a wrong fact) and **over-refused** (\"I'm not sure\" where the docs had the answer). Start with 20-30 cases taken from real tickets, including every incident question, and add a case each time a new wrong answer is reported."),
        code("text", `
billing-bot eval, 24 cases            grounded  unsure-ok  invented  over-refused
prompt v1 ("Do not hallucinate")         0          1         23          0
prompt v2 (docs + rule + I'm not sure)  17          5          1          1`, "Eval report on recorded fixtures"),
        p("The report is the evidence your lead asked for: v1's extra sentence produced no grounded answers at all, v2 fixes most cases and shows exactly which two still fail. Those two become the next tasks - maybe a section that retrieval misses, maybe a page that needs rewriting. Run it on recorded fixtures in CI for every prompt change, and on the live model, several times per case, before every release and every model upgrade."),

        h2("7. How to verify"),
        bullets([
            "**The incident question is an eval case** with `mustCite` and `mustContain`, and it fails on the old prompt. A fix that does not turn that case from red to green is not a fix.",
            "**Unanswerable cases pass** with \"I'm not sure\", and answerable cases are not over-refused. Both numbers are in the report, not only the success rate.",
            "**Citation checks run in production**: `checkAnswer` rejects answers with missing or unknown citations, and the rejection rate is on the bot's dashboard.",
            "**Clicked sources and \"report a wrong answer\"** (lesson 3.4) are logged with the request id, so a reported answer can be replayed with its exact prompt.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Fixing hallucinations with wording only.** \"Do not hallucinate\", \"be accurate\", \"only if 100% sure\". Spot it: the diff of the fix adds sentences to the prompt but no documents and no tests.",
            "**Citations nobody checks.** The model's `[id]` is displayed as is, or ignored. Spot it: search the code for where citations are parsed; if nothing compares them with the sections sent, an invented id goes straight to the user.",
            "**A refusal with no way forward.** \"I cannot help with that\" ends the conversation and sends the user to guess. Spot it: read the unsure message in the widget - does it offer a human and a related page?",
            "**An eval set with only answerable questions.** It rewards a bot that always answers and never tests \"I'm not sure\". Spot it: count the `mustBeUnsure` cases; aim for at least one in five.",
            "**Reaching for vector search first.** It adds a service, an index and costs before you know retrieval is the problem. Spot it: the eval report shows whether the right section was in the prompt; improve retrieval only when it was not.",
        ]),

        h2("9. Summary"),
        numbered([
            "\"Do not hallucinate\" adds no facts and asks for a self-check the model cannot reliably do; grounding adds the facts by putting your documents, with stable ids, into the prompt.",
            "Citations become links the user can click and checks your code can run: an answer that cites nothing, or a page that was not sent, is rejected and replaced by a polite \"I'm not sure\" with a next step.",
            "A small eval set with answerable and unanswerable questions measures grounded, unsure, invented and over-refused replies - on every prompt change and every model upgrade.",
        ]),

        h2("Sources"),
        bullets([
            "Anthropic documentation: prompt engineering overview and \"Reduce hallucinations\" (let the model say it does not know, answer from quotes of the provided documents, verify with citations) - docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview",
            "OpenAI documentation: text generation and prompting - platform.openai.com/docs/guides/text",
        ]),
        callout("tip", "Self-practice (not graded): an eval set for your own bot",
            "Take ten questions a real user could ask about a product you know - a course, a library, your team's internal API. For each, write the section id that answers it, an expected phrase, or mustBeUnsure. Make at least two of them unanswerable and one of them close to a documented topic but not covered (like the invoice refund above). Then run them by hand against any chatbot twice: once with no documents and once with the relevant sections pasted in, and count the four buckets."),
    ],
});
