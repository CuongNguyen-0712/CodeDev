// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aif-3-1",
    title: "The confident wrong answer: hallucination, missing context & knowledge cutoff",
    slug: { _type: "slug", current: "confident-wrong-answer-hallucination-knowledge-cutoff" },
    description:
        "The CodeDev support bot told a learner to call submitLesson({ lessonId, force: true }) - an option that never existed - about a lab SDK that changed after the model's knowledge cutoff. Work through the incident like an on-call engineer: read the chat transcript, the prompt that was actually sent, the current docs and the request log, separate hallucination from missing context and knowledge cutoff, rule out the temperature and the model size, fix the prompt with grounding, citations and an allowed \"I'm not sure\", and prove the fix with a small eval set.",
    estimatedTime: 25,

    scenario: {
        role: "Developer on call for the CodeDev support bot",
        problem:
            "Tuesday 09:10. Support ticket #2291: on Monday night the CodeDev support bot told a learner to submit a lesson with submitLesson({ lessonId, force: true }) to skip a failing hidden test. The learner's lab script then crashed with \"unknown option force\", and four more learners have reported the same advice since. Nobody on the team has ever heard of a force option. You own the bot: find out why it answered this, fix it, and show that the fix works.",
    },

    content: [
        h2("1. The incident"),
        p("This is the course scenario: the kind of failure every product that uses an LLM meets sooner or later. The answer was short, friendly, specific - and wrong. Here is what the learner saw in the support widget at https://app.codedev.test:"),
        code("text", `
21:14:02  learner u_5521  How do I submit my lesson when one hidden test still fails?
21:14:07  support bot     You can force the submission. Call submitLesson({ lessonId, force: true })
                          from your lab script: the force flag skips the hidden tests and marks the
                          lesson as submitted. It has been supported since @codedev/lab 1.4.
21:31:40  learner u_5521  I tried it: CodeDevLabError: submitLesson: unknown option "force"
                          (expected { lessonId, attemptId }). What now?`, "Support widget, conversation sb_77f3"),
        p("The first reaction in the team channel was \"the AI is broken, switch it off\". The second was \"set the temperature to 0\". Before anyone changes anything, do what you would do for any production bug: collect the evidence, explain **all** of it, then fix the cause you can prove. An LLM bug is still a bug, and it still leaves logs."),

        h2("2. The evidence pack"),
        p("Four pieces of evidence were collected in the first half hour. The quiz below refers to them by letter."),
        h3("A. The chat transcript"),
        p("Shown above: the question, the bot's answer with the `force` option and the version claim \"since @codedev/lab 1.4\", and the error the learner got when they followed it."),
        h3("B. The prompt that was actually sent"),
        p("The bot logs every prompt it sends (lesson 3.3 shows how to log prompts without leaking personal data). This is the full prompt of request sb_77f3, nothing more:"),
        code("text", `
You are the CodeDev support assistant. Be friendly and answer the learner's question.

Question: How do I submit my lesson when one hidden test still fails?`, "Prompt log, request sb_77f3"),
        h3("C. The current documentation"),
        code("text", `
submitLesson({ lessonId, attemptId })                      @codedev/lab 2.x
  lessonId   string   the lesson to submit
  attemptId  string   the attempt created by \`codedev test\`
An attempt with a failing test is rejected (status "rejected", failedTests listed).
Tests cannot be skipped: fix the test, run \`codedev test\` again and submit the new attemptId.

CHANGELOG
2.0.0  2025-09-15  submitLesson(lessonId) is replaced by submitLesson({ lessonId, attemptId })
1.4.0  2024-11-02  codedev test prints the attempt id
1.0.0  2024-03-11  first release: submitLesson(lessonId)`, "https://app.codedev.test/docs/lab/submit"),
        h3("D. The request log line"),
        code("text", `
2026-10-20T21:14:07.418Z support-bot req=sb_77f3 user=u_5521 model=chat-small-2025-01
  knowledge_cutoff=2025-01 temperature=0.2 input_tokens=41 output_tokens=58
  docs_attached=0 finish_reason=stop latency_ms=1840`, "support-bot request log"),

        h2("3. Reading the evidence"),
        p("Read each piece for what it **shows**, one line each, before you form any theory:"),
        bullets([
            "**A** shows a confident, detailed answer: an exact call, an explanation of what the flag does and a version number. Detail is not evidence. The only fact the learner could check - the call itself - failed at once.",
            "**B** shows that the prompt contains the question and a one-line persona. No documentation, no instruction to stay within known facts, and no permitted way to say \"I don't know\".",
            "**C** shows that `force` never existed: 1.0 had `submitLesson(lessonId)`, 2.0 changed it to `submitLesson({ lessonId, attemptId })`, and 1.4 only changed what `codedev test` prints. The \"since 1.4\" in A is invented as well.",
            "**D** shows the model's knowledge cutoff (2025-01), the date the SDK changed (2025-09-15, from C) falls after it, `docs_attached=0`, a low temperature of 0.2 and a normal `finish_reason=stop`. The request did not fail; it completed exactly as designed.",
        ]),

        h2("4. Hypothesis: three gaps that add up to one invented answer"),
        p("Remember from lesson 1.1 how the model writes: it picks a likely next token, again and again. It does not look anything up, and nothing in that loop checks the result against reality. When the right answer is not in its training data and not in the prompt, the most likely continuation is still a fluent, plausible answer. That is what three separate gaps produced here:"),
        numbered([
            "**Knowledge cutoff.** The model's training data ends in January 2025. It may have seen the 1.x SDK, it cannot have seen 2.0 from September 2025. Anything it says about the current signature is a guess.",
            "**Missing context.** The current page (C) exists, but the prompt (B) did not carry it: `docs_attached=0`. The model was asked about a private SDK it has, at best, seen an old version of.",
            "**A vague prompt.** \"Be friendly and answer the learner's question\" asks for an answer, every time. With no instruction to answer only from given facts and no permitted \"I'm not sure\", the friendliest likely continuation is a confident one. `force: true` is a very common pattern in many tools, which is exactly why it is a likely continuation here.",
        ]),
        p("Three words get mixed up in incident channels, and the fix depends on which one you have:"),
        bullets([
            "**Knowledge cutoff / outdated knowledge**: the model repeats something that was true before its cutoff. Here that would have been `submitLesson(lessonId)` - the 1.x call. Old, but real.",
            "**Missing context**: the information exists but was not in the prompt. The model cannot read your docs, your database or your repository unless you put the relevant part into the context window (lesson 1.2).",
            "**Hallucination**: the model produces something that is not supported by its context and was never true. `force: true` and \"since 1.4\" are hallucinations: no version ever had them.",
        ]),
        p("In this incident the hallucination is the symptom, and the cutoff plus the missing context plus the vague prompt are the causes. A good hypothesis explains all four pieces of evidence: the invented option (A, C), the empty prompt (B) and the log (D). This one does."),
        h3("Rule out the tempting wrong ones"),
        bullets([
            "**\"The temperature is too high.\"** D says 0.2, already low. Temperature changes how often the model picks a less likely token (lesson 1.3). At 0 it would pick the most likely token every time - and without the docs, the most likely answer is still a guess. You would get the same wrong answer, repeatably. Repeatable is not the same as true.",
            "**\"A bigger model would know.\"** A bigger model has a knowledge cutoff too, and `@codedev/lab` is CodeDev's own SDK: no public model can be relied on to know its September 2025 changes. A bigger model is often more fluent, which makes an invented answer sound even more convincing.",
            "**\"The provider had an outage.\"** `finish_reason=stop` and a normal latency mean the request completed normally. Nothing failed except the design of the prompt.",
            "**\"The learner asked badly.\"** The question in B is short and clear. A support bot has to cope with real questions; this one did not need rephrasing, it needed facts.",
        ]),

        h2("5. The fix: give the model the facts and a way out"),
        p("You cannot make a model know what it was never shown, and you cannot make it reliably notice what it does not know. What you can control is the prompt and what you do with the answer. The fix has four parts, in this order:"),
        numbered([
            "**Grounding.** Retrieve the relevant pages of the CodeDev docs for the question and put them into the prompt, each with a stable id: `[lab-submit-v2] Submitting a lesson (@codedev/lab 2.x)` followed by its text. Retrieval already exists in the support bot; the prompt builder dropped its result.",
            "**Answer only from the documentation, with citations.** Tell the model to use only those pages and to cite the `[id]` of the page it used. A citation turns \"trust me\" into \"check here\": the app can link it, and a test can check it.",
            "**An allowed \"I'm not sure\".** Tell the model what to say when the pages do not answer the question, and hand that case over to a human (\"I'm not sure - here is how to reach support\"). Without this path, the instruction to answer only from the docs still leaves the model under pressure to produce *something*.",
            "**An eval set.** A short list of real questions with the source each answer must cite, or the expectation \"I'm not sure\". It runs on every prompt or model change, so the next refactor of the prompt builder cannot silently drop the docs again.",
        ]),
        p("With the fix in place, the same question gets the 2.x call with a citation of `[lab-submit-v2]` that the widget turns into a link to the docs page, and a question the docs do not cover gets an honest \"I'm not sure\" followed by the widget's \"Ask a person on the support team\" button. Neither answer depends on what the model happened to learn before January 2025."),
        callout("warning", "\"Please don't hallucinate\" is not a fix",
            "The most common first attempt is one more sentence in the system prompt: \"Do not make things up. Only give correct answers.\" It adds no facts, so the model still has nothing to answer from, and the model cannot reliably tell which of its own sentences are invented. Lesson 3.2 shows why and what to measure instead. In the challenge below, a prompt with that sentence and no documentation still gets the invented answer."),

        challenge("chal_quiz_aif_311"),

        h2("6. The challenge: fix the prompt builder"),
        p("The code runner never calls a real LLM. The challenge file contains a **fake model** that replays answers recorded from the provider model for four common questions. It behaves like the recordings did:"),
        bullets([
            "Told to answer only from the documentation, with the page that answers the question in the prompt as `[<id>] <title>`, it answers from that page and cites it.",
            "Told to answer only from the documentation, without that page, it says \"I'm not sure\" if the prompt allows that reply, and otherwise still invents an answer.",
            "Without that instruction it answers from what it learned before its cutoff - the invented answer - even when the page is somewhere in the prompt.",
        ]),
        p("The test runner passes each question, the pages retrieval found (most relevant first) and `options.maxDocs` to `buildPrompt`, sends the prompt to the fake model and prints the answer. Run the starter first: you will see `force: true` come back, the same evidence as transcript A. Then fix `buildPrompt` and run it again."),
        challenge("chal_coding_aif_312"),

        h2("7. How to verify the fix"),
        p("\"I asked the bot again and now it is right\" is not verification. One question, one run, checks one path out of many - and with a temperature above 0 the next run may differ (lesson 1.3). Verify the way you would verify any other fix: with a test that would have failed before."),
        bullets([
            "**A small eval set.** Ten to thirty real questions from support tickets. Each case says which source the answer must cite, or that it must be \"I'm not sure\". Include the question from ticket #2291 and at least one question the docs do not cover.",
            "**Run it in CI on recorded fixtures** (like the challenge) so that every change to the prompt builder is checked in seconds, without cost and without a network.",
            "**Run it against the live model before each release**, several times per question, because live answers vary. Track the share of cited, \"I'm not sure\" and uncited answers.",
            "**Check the citations, not only their presence.** The cited id must be one of the pages that were in the prompt, and that page should contain the claim.",
            "**Watch production.** Log `docs_attached` and the cited ids for every request. A sudden run of `docs_attached=0`, like in D, is an alert, not a statistic.",
        ]),
        code("typescript", `
// eval/support-bot.eval.ts - runs on recorded answers in CI, on the live model before a release
type EvalCase = { question: string; mustCite?: string; mustBeUnsure?: boolean };

const cases: EvalCase[] = [
  { question: "Can I submit a lesson while a hidden test fails?", mustCite: "lab-submit-v2" },
  { question: "Why does my quiz retry give less EXP?", mustCite: "limits-attempts" },
  { question: "Does the code editor have a dark mode?", mustBeUnsure: true },
];

function checkAnswer(c: EvalCase, answer: string, sentIds: string[]): string | null {
  if (c.mustBeUnsure) return answer.startsWith("I'm not sure") ? null : "invented an answer";
  const cited = [...answer.matchAll(/\\[([a-z0-9-]+)\\]/g)].map((m) => m[1]);
  if (!cited.length) return "no citation";
  if (cited.some((id) => !sentIds.includes(id))) return "cites a page that was not in the prompt";
  return cited.includes(c.mustCite!) ? null : \`cites \${cited.join(", ")} instead of \${c.mustCite}\`;
}`, "support-bot.eval.ts"),
        p("On the prompt from evidence B, the first case fails with \"no citation\" and the third with \"invented an answer\". After the fix, all three pass - and they keep checking every later change."),

        h2("8. Common mistakes in a hallucination incident"),
        bullets([
            "**Trusting detail and confidence.** A version number and a precise call make an answer sound checked; they are produced the same way as everything else. Spot it: look for a source the claim came from. No source in the prompt means no grounding.",
            "**Tuning the temperature.** Lowering it makes the wrong answer repeatable, not right. Spot it: a fix proposal that changes sampling settings but adds no information to the prompt.",
            "**Buying a bigger model to fix missing context.** No model knows your private, recently changed API. Spot it: check the cutoff date in the log against the date of the change in your changelog.",
            "**Blaming the model before reading the prompt.** In this incident the prompt builder dropped the retrieved docs. Spot it: log the full prompt (redacted) and `docs_attached` for every request, and read them first.",
            "**Verifying with one question.** Spot it: ask for the eval run, including a question the docs do not cover, instead of a screenshot of one good answer.",
        ]),

        h2("9. Summary"),
        numbered([
            "A confident wrong answer usually has ordinary causes you can prove from the logs: a knowledge cutoff before the change, missing context (no docs in the prompt) and a prompt that demands an answer with no way to say \"I'm not sure\".",
            "Temperature and model size do not add facts. Grounding does: put the relevant documents in the prompt, require answers only from them with citations, and allow \"I'm not sure\".",
            "Prove the fix with a small eval set that checks citations and the \"I'm not sure\" cases, on recorded fixtures in CI and on the live model before each release.",
        ]),

        h2("Sources"),
        bullets([
            "OpenAI documentation: text generation and prompting - platform.openai.com/docs/guides/text",
            "Anthropic documentation: prompt engineering overview, and \"Reduce hallucinations\" (allow the model to say it does not know, ground answers in quotes from documents) - docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview",
            "Check your provider's model page for the knowledge cutoff of the exact model version you call, and log it with every request.",
        ]),
        callout("tip", "Self-practice (not graded): the incident table and a user-facing notice",
            "Write the incident as a table with four columns - symptom, cause, evidence, fix - with one row each for the invented option, the knowledge cutoff, the missing docs and the vague prompt; every evidence cell must point at A, B, C or D. Then write the short notice the five affected learners will get: what the bot told them, that it was wrong, the correct way to submit (with a link to the docs page), what CodeDev changed so it does not happen again, and how to report a wrong answer. No blame on the learner, no technical jargon, at most eight lines."),
    ],
});
