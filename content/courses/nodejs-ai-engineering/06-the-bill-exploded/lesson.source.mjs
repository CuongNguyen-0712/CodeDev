// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nae-2-3",
    title: "The bill exploded: unbounded retries & a context nobody measured",
    slug: { _type: "slug", current: "the-bill-exploded-unbounded-retries-context" },
    description:
        "Two days after release 2026.10.23-1 the provider dashboard of the CodeDev AI hint shows about 40 times more input tokens a day, while learners click Hint as often as before. Work through the incident like an on-call engineer: read the usage dashboard, the hint service log, the prompt log and the release diff, form a hypothesis, rule out a price change and a traffic spike, choose a fix that bounds both the number of calls and the size of each one, and prove it with a regression test that counts calls and tokens.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on call for the CodeDev AI hint",
        problem:
            "Sunday 10:20. The finance team forwards an automatic email from the model provider: the codedev-hints project has used more than 80% of its monthly budget, on the 25th of the month. Yesterday's usage was about 40 times a normal day. Nothing looks wrong on the platform: the Hint button works, hints arrive, no alert has fired. The only change to the hint service this week is release 2026.10.23-1, which shipped PR #611 \"hint: give the model the whole repo for better hints; retry until the JSON is valid\".",
    },

    content: [
        h2("1. The incident"),
        p("This is the course scenario: the most common way an LLM feature goes wrong in production is not a wrong answer, it is a correct-looking feature that quietly costs many times what it should. Nobody gets paged, because the feature works. The first signal is a budget email, and by then the money is spent."),
        p("Here is the change that shipped on Friday morning. Read it the way the reviewer did, as a quality improvement:"),
        code("typescript", `
// hints/hintFor.ts (release 2026.10.23-1)
export async function hintFor(submission: Submission, failure: Failure): Promise<Hint> {
  const context = await repo.readAllFiles(submission.repoId);   // more context, better hints
  const messages = hintMessages(failure, context);
  let reply = await llm.complete(messages);
  let valid = isValidHint(reply);
  const retry = async () => { reply = await llm.complete(messages); valid = isValidHint(reply); };
  while (!valid) await retry();
  return JSON.parse(reply) as Hint;
}`, "hintFor.ts"),
        p("Before you change anything, collect the evidence and prove what is happening. On call, a fix you cannot explain is a guess, and the evidence also tells you how you will know the fix worked."),

        h2("2. The evidence pack"),
        p("Four pieces were collected in the first half hour. The quiz below refers to them by letter."),
        h3("A. Provider usage dashboard and the app's own metrics"),
        code("text", `
provider dashboard, project codedev-hints, per day (UTC)
date    requests  input tokens  output tokens
10-21      3,105     2,151,900        611,400
10-22      2,987     2,069,500        590,200
10-23      3,688    81,904,700      1,281,600     <- release 2026.10.23-1 at 09:00
10-24      3,702    82,377,900      1,296,400
Billing page: "Price list in effect since 2026-07-01. No price changes scheduled."

CodeDev app metrics, POST /hints (Hint button clicks), per day
10-21  3,044    10-22  2,961    10-23  3,018    10-24  2,990`, "provider dashboard + Grafana, Sunday 10:30"),
        h3("B. Hint service log, one hint request"),
        code("text", `
09:41:02.118 hint req=h_7f3a lesson=lab-cart-api attempt=1  status=200 input_tokens=118412 output_tokens=1024 finish=length validation=invalid_json
09:41:09.870 hint req=h_7f3a lesson=lab-cart-api attempt=2  status=200 input_tokens=118412 output_tokens=1024 finish=length validation=invalid_json
09:41:17.502 hint req=h_7f3a lesson=lab-cart-api attempt=3  status=200 input_tokens=118412 output_tokens=1024 finish=length validation=invalid_json
09:41:25.233 hint req=h_7f3a lesson=lab-cart-api attempt=4  status=200 input_tokens=118412 output_tokens=1024 finish=length validation=invalid_json
09:41:32.004 web  POST /hints req=h_7f3a client closed the connection after 30 s
...
09:44:31.044 hint req=h_7f3a lesson=lab-cart-api attempt=27 status=200 input_tokens=118412 output_tokens=1024 finish=length validation=invalid_json
09:44:38.611 hint req=h_7f3a lesson=lab-cart-api attempt=28 status=429 error=rate_limit_exceeded (tokens per minute)
09:44:38.613 hint req=h_7f3a -> 500 Internal Server Error`, "hint service, Friday, filtered by req=h_7f3a"),
        h3("C. Prompt log of one call"),
        code("text", `
request h_7f3a attempt=1 model=hint-default max_output_tokens=1024
system  "You are the CodeDev hint assistant..."      310 tokens
user    <file package-lock.json>                 41,200 tokens
user    <file dist/bundle.js>                    38,900 tokens
user    <file README.md>                          1,500 tokens
...     214 more <file ...> messages             35,604 tokens
user    <file tests/cart.test.ts>                   640 tokens
user    Failing test: cart total > applies...       258 tokens
total input: 118,412 tokens
output (stopped at 1024 tokens): {"level": 2, "hint": "Looking at package-lock.json, dist/bundle.js and src/catalog.ts, your cart depends on ...`, "prompt log (sampled 1%), learner code redacted"),
        h3("D. The release diff"),
        code("text", `
 export async function hintFor(submission: Submission, failure: Failure): Promise<Hint> {
-  const context = await repo.readFiles(submission.repoId, [failure.testFile, ...failure.imports]);
+  const context = await repo.readAllFiles(submission.repoId);   // more context, better hints
   const messages = hintMessages(failure, context);
-  const reply = await llm.complete(messages);
-  return parseHintOrFallback(reply);
+  let reply = await llm.complete(messages);
+  let valid = isValidHint(reply);
+  const retry = async () => { reply = await llm.complete(messages); valid = isValidHint(reply); };
+  while (!valid) await retry();
+  return JSON.parse(reply) as Hint;
 }`, "PR #611 \"hint: give the model the whole repo for better hints; retry until the JSON is valid\""),

        h2("3. Reading the evidence"),
        p("Read each piece for what it **shows**, and do the arithmetic before you form an opinion. Write one line per piece:"),
        bullets([
            "**A**: divide tokens by requests. Before the release, about 700 input tokens per provider request; after, about 22,000. Requests went up by about a quarter. The bill is mostly about **bigger** calls, plus some **extra** calls. Hint clicks on the platform did not change.",
            "**B**: one hint click became 27 successful calls and a 429, over three and a half minutes. Every call had the same input size, every answer stopped at the output limit (`finish=length`) and failed validation. The learner left after 30 s; the loop did not.",
            "**C**: the 118,412 tokens are the whole repository of a lab lesson. Two files that no hint ever needs, the lock file and the build output, are about 68% of it. The answer starts by talking about those files and runs out of output tokens before the JSON is closed.",
            "**D** changes two things at once: what goes into the context (every file instead of the failing test and its imports) and what happens after an invalid answer (ask the identical question again, with no limit, instead of the fallback).",
        ]),
        callout("info", "Most clicks were fine",
            "Single-file challenges have small repositories: their prompts stayed at a few thousand tokens and most answers were valid on the first call. The damage came from the minority of lab lessons with real repositories. That is why nothing looked broken: the average learner's hint worked, and the averages on the platform hid the expensive tail. Always look at the largest requests, not only at the mean."),

        h2("4. Hypothesis: a loop that multiplies the most expensive calls"),
        p("Put the facts in order and you get a chain:"),
        numbered([
            "PR #611 sends the whole repository. For a lab lesson that is about 118k input tokens instead of about 700.",
            "With that much unrelated text, the model's answer wanders into the lock file and the bundle and hits the output limit before the JSON is closed (C).",
            "The answer is invalid, so the while loop sends the **identical** messages again (D). Same input, same limit, same kind of truncated answer (B).",
            "Each turn pays for the whole repository again. The loop ends only when the provider's rate limit answers 429, or when an answer happens to be valid.",
        ]),
        p("A good hypothesis explains **all** the evidence: the jump in tokens per request and the smaller jump in requests (A), the repeated identical attempts (B), the size and content of the prompt (C) and the timing of the release (D). This one does, and it also says why both halves of the change are needed for the damage: the big context makes the answers invalid and each call expensive; the loop makes the expensive call happen dozens of times."),
        h3("Rule out the tempting wrong ones"),
        bullets([
            "**\"The provider raised its prices.\"** A counts tokens, and tokens grew about 40 times; the billing page says the price list is unchanged since July. A price change would make the same token counts cost more, not create more tokens.",
            "**\"A traffic spike: more learners clicked Hint.\"** POST /hints stayed at about 3,000 a day. More model calls than clicks means the extra calls come from inside the service.",
            "**\"The model got worse at JSON.\"** Single-file hints are still valid at the usual rate, and the invalid answers in B all stop at `finish=length`: they are cut off, not badly formatted.",
        ]),

        h2("5. Choose the fix"),
        p("Write down what the fix must guarantee, from the evidence and from what the feature is for, before you write code:"),
        bullets([
            "One hint click causes a **bounded** number of model calls, whatever the model answers.",
            "Each call has a **bounded** size: the context is limited by a token budget, not by the size of the learner's repository.",
            "The context still contains what a good hint needs: the failing test and the code it exercises.",
            "An invalid answer gets a cheap repair, then the fallback; the learner always gets something to read.",
        ]),
        p("Now test each candidate against the list, not only against \"the bill goes down\":"),
        bullets([
            "**Revert the release.** Restores the old cost at once. The right first move if the fix needs more than an hour, and it buys time: revert, then fix forward with a test.",
            "**Bound the loop to 3 retries, keep the context.** Removes the endless loop, but each lab hint still makes four calls of about 118k tokens, and the identical prompt keeps getting the same truncated answer, so they all end at the fallback. Fails requirements 2 and 4.",
            "**Keep the whole repository but cut it at the budget.** Better size, wrong content: the files come in repository order, so the budget fills with `package-lock.json` before the test file is reached. Fails requirement 3.",
            "**Raise the output limit so the JSON fits.** Treats one symptom: the answer may close, but every call still carries the whole repository. Fails requirement 2.",
            "**A spending cap or a budget alert at the provider.** Necessary as a safety net, not a fix: it turns the next incident into an outage of the feature instead of a bill.",
        ]),
        p("The fix that meets all four: a context builder that keeps only the failing test's file and the files it imports, within a token budget, and the bounded repair-and-fallback loop from lesson 2.1. You will make that change in the challenge below."),
        challenge("chal_quiz_nae_231"),

        h2("6. The challenge: fix the hint service on a fake model"),
        p("The challenge file contains the hint service as it shipped in PR #611 and a fake model. Nothing calls a real LLM:"),
        bullets([
            "**The repository is data.** Each file has a path, its size in tokens (as the provider's tokenizer counted it) and the paths it imports. The failing test names its test file.",
            "**The fake model** answers with the scripted texts and repeats the last one when the script runs out, the way the same prompt kept getting the same truncated answer in B. Like a spending cap, it refuses every call after the 50th.",
            "**The test runner** prints the files in the context, the calls made, the total tokens sent and the final result.",
        ]),
        p("Run the starter first and read its output for the large repository: you will see the incident as numbers, the same evidence as A and B. Then make the change and run it again."),
        challenge("chal_coding_nae_232"),

        h2("7. How to verify the fix"),
        p("\"The hint looks fine in staging\" is not verification: the shipped code also produced hints for most learners. Verify each requirement with something that counts:"),
        bullets([
            "**A regression test that counts calls and tokens.** A 300-file fixture repository, a fake model that always returns the truncated answer from C, and assertions on the number of calls, the tokens of the first call, the total tokens and the fallback result. It fails on PR #611, it fails on a fix that only bounds the loop, and it fails on a fix that only trims the context.",
            "**Replay h_7f3a in staging.** The same submission and failing test now produce a context of a few thousand tokens and at most three calls.",
            "**The dashboard after the deploy.** Input tokens per day back near 2 million, provider requests per day close to POST /hints per day (a few percent above, for repairs), and no hint request with more input tokens than the budget allows.",
            "**A cost alert that would have caught it on Friday.** The incident ran two days before anyone looked. See the self-practice below.",
        ]),
        code("typescript", `
// hintFor.test.ts (Vitest), with the fake model from lesson 4.3
test("a model that never returns valid JSON costs at most 3 small calls", async () => {
  const llm = fakeLlm({ script: [TRUNCATED_ANSWER] });          // repeats the last answer
  const result = await hintFor(labFixture.submission, labFixture.failure, { llm });

  expect(llm.calls).toHaveLength(3);                             // 1 hint + 2 repairs
  expect(llm.calls[0].inputTokens).toBeLessThanOrEqual(8_000 + 600);
  expect(llm.totalInputTokens()).toBeLessThan(10_000);
  expect(result.source).toBe("fallback");
});`, "hintFor.test.ts"),

        h2("8. Common mistakes in a cost incident"),
        bullets([
            "**Looking at the total and not at the ratio.** \"The bill is 40x\" does not tell you whether to look for more calls or bigger calls. Spot it: nobody has divided tokens by requests, or requests by user actions.",
            "**Blaming the vendor or the users first.** Prices and traffic are the first guesses in every cost incident. Spot it: the claim is not checked against the token counts and the app's own request metrics.",
            "**Fixing one half.** A bounded loop with a huge context, or a small context with an unbounded loop, both still fail. Spot it: the fix's test checks calls or tokens, not both.",
            "**Measuring the context in files or characters.** The budget is in tokens because that is what is billed and what fills the context window. Spot it: a limit like \"at most 20 files\" with no token count.",
            "**No alert on cost per action.** Spending caps catch the incident at the end of the month. Spot it: no metric of tokens per hint request, and no alert when it changes.",
        ]),

        h2("9. Summary"),
        numbered([
            "Read a cost incident with ratios: tokens per provider request, provider requests per user action. They separate bigger calls from more calls and rule out price changes and traffic spikes with the evidence you already have.",
            "Unbounded retries multiply the most expensive calls, and an unmeasured context makes every call expensive and the answers worse. The fix bounds both: a relevant context within a token budget, and a limited repair with a fallback.",
            "Prove it with a regression test that counts calls and tokens on a fake model, and keep a cost alert on tokens per action so the next one is caught in hours, not at the end of the month.",
        ]),

        h2("Sources"),
        bullets([
            "OWASP Top 10 for Large Language Model Applications: unbounded consumption - owasp.org/www-project-top-10-for-large-language-model-applications",
            "JSON Schema: Understanding JSON Schema - json-schema.org/understanding-json-schema",
            "Your provider's documentation on usage reporting, budgets and spending limits, and how it counts tokens (check the current version)",
        ]),
        callout("tip", "Self-practice (not graded): write the incident note and a cost alert rule",
            "Write the incident note as you would post it in the incident channel, in at most ten lines: what happened and for how long, the impact in tokens (and in money, using your own provider's current price list), the root cause in one sentence, why review and monitoring did not catch it, the fix, how it was verified, and two follow-ups. Every claim should point at one piece of evidence, A to D. Then write one cost alert rule that would have fired on Friday, for example on input tokens per hint request, on provider calls per POST /hints, or on input tokens per hour compared with the same hour last week, with its threshold and who gets paged."),
    ],
});
