// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nae-4-2",
    title: "Caching LLM responses: when it's safe and when it isn't",
    slug: { _type: "slug", current: "caching-llm-responses-when-safe" },
    description:
        "A response cache cut the cost of AI hints, then served hints written by the previous prompt for a day and showed one learner a hint addressed to another. Learn when a cached LLM answer is still the right answer (same prompt version, same model and parameters, same normalized input, a deterministic task, no personal data in the key or the value), how provider prompt caching differs from your own response cache, how to design the key, and why a version in the key is the simplest invalidation.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev AI hint feature",
        problem:
            "After the bill incident, the team put a 24-hour response cache in front of the hint model. Costs fell, but two tickets arrived on the day hint-v5 was deployed: learners still got the long hints with code blocks that v5 had removed, and a learner was greeted with \"Hi Lan\" although that is not her name. The hint log of https://api.codedev.test shows source=cache for both.",
    },

    content: [
        h2("1. The incident: a cache that remembered too much"),
        p("Module 2 ended with a bill that exploded. One of the follow-ups was a cache: many learners get stuck on the same mistake in the same challenge, so the same hint request arrives again and again. A developer added it in an afternoon:"),
        code("typescript", `
// services/hints/cache.ts (first version)
export async function cachedHint(req: HintRequest, deps: Deps): Promise<string> {
  const key = \`hint:\${req.challengeSlug}:\${sha256(req.learnerCode + "\\n" + req.failingTest)}\`;
  const cached = await deps.cache.get(key);
  if (cached) return cached;

  const hint = await createHint(req, deps);          // renders the current prompt, calls the model
  await deps.cache.set(key, hint, { ttlSeconds: 86_400 });
  return hint;
}`, "cache.ts (first version)"),
        p("The dashboard looked good for a week. Then the team deployed **hint-v5**, a prompt that writes shorter hints without code blocks, and two tickets came in the same afternoon:"),
        code("text", `
#4127  15:30  "I still get the long hints with code blocks on Top words."
#4131  16:05  "The hint says 'Hi Lan' - my name is Mai."`, "support tickets, 2026-10-20"),

        h2("2. Reproduce it and read the evidence"),
        p("The hint log records where each hint came from. Filter it by the challenge from the first ticket:"),
        code("text", `
10:00  deploy  hint-v4 -> hint-v5
15:29  user=u_3381  key=hint:top-words:51ab...  source=cache  promptVersion=hint-v4  len=812
15:31  user=u_0907  key=hint:top-words:77d0...  source=model  promptVersion=hint-v5  len=240
16:04  user=u_2210  key=hint:top-words:9c1e...  source=cache  promptVersion=hint-v4  text="Hi Lan, ..."
       (stored at 09:12 for user=u_1042)`, "hint log, challenge top-words"),
        p("Two different failures, both visible in four lines:"),
        bullets([
            "**Stale answers.** Five hours after the deploy, `u_3381` gets a hint written by hint-v4, because the key has nothing in it that changed when the prompt changed. Only learners with code nobody had sent before reach v5.",
            "**Someone else's answer.** `u_2210` and `u_1042` sent the same code for the same failing test. The prompt at that time started with \"You are a tutor helping {{learnerName}}\", so the stored answer contains Lan's name, and the cache handed it to Mai.",
        ]),
        p("A third number came from the dashboard: the hit rate was 31% on easy challenges and 4% on hard ones, where learners' code rarely matches byte for byte. That one is not a bug, but it decides whether a cache is worth having at all."),

        h2("3. Core idea: a cached answer is a promise that the answer would be the same"),
        p("A cache returns an old result instead of computing a new one. For a database query that is a question of freshness. For an LLM it is a stronger claim: **if I called the model again with this request, an answer like the stored one would be correct and acceptable.** That claim holds only when all of these are true:"),
        numbered([
            "**The task has one right kind of answer.** Classifying a request, extracting fields, a hint for exactly this code and this failing test. Run such tasks at temperature 0 so the cached answer is the one the model would most likely give anyway. (Temperature 0 reduces variation but providers do not promise identical output; the cache is what makes the answer repeatable.) Do not cache tasks where variety is the point, or answers that depend on time or live data, such as \"your rank this week\".",
            "**The key contains everything that changes the answer.** The prompt version, the model (the exact snapshot, not an alias such as \"latest\"), the parameters (temperature, maximum output tokens, output schema version), the version of any reference data in the prompt, and the normalized input.",
            "**Neither the key nor the value contains personal data.** The key ends up in logs and metrics; hash the input. The value is shown to whoever matches the key; if the answer can contain a name, an email or anything about one learner, it cannot be shared between learners.",
            "**Only good answers are stored.** Cache the output after schema validation and after the leak filter of lesson 4.1, never an error, a timeout or a fallback hint. A cached fallback turns a five-second outage into a day of useless hints.",
        ]),
        callout("info", "When not to cache at all",
            "Measure the repeat rate first: log the key you would use for a week without caching, and count how many requests have a key seen before within the TTL. If that is a few percent, a cache adds a privacy risk, an invalidation problem and a new failure mode for almost no saving. Cheaper prompts, smaller context and token budgets (module 3) usually save more."),

        h2("4. Provider prompt caching is not a response cache"),
        p("Two different things are both called \"caching\", and they solve different problems. Mixing them up leads to wrong cost estimates and to wrong assumptions about what the learner sees."),
        h3("Prompt caching at the provider"),
        bullets([
            "The provider keeps the processed form of a **prompt prefix** it has just seen. When the next request starts with exactly the same tokens, that part is not processed again.",
            "The model still reads the rest of the input and **generates a new answer**. Output tokens are billed as usual; cached input tokens are billed at a lower rate, and time to first token drops.",
            "It only works when the prefix is identical, token for token. Put the stable parts first (system instructions, examples, the challenge text) and the variable parts last (the learner's code, the failing test). A timestamp or a request id at the top of the prompt makes every prefix unique.",
            "Whether it is automatic or needs explicit markers, the minimum prefix length, how long entries live and the discount all differ between providers and change over time. Read your provider's documentation and check the usage numbers in the response, which usually report cached input tokens separately.",
        ]),
        h3("A response cache in your own code"),
        bullets([
            "You store the final answer and return it for an identical key. The model is **not called**: no input tokens, no output tokens, latency of a cache read.",
            "You own correctness: the key, the invalidation, what the answer may contain and who may receive it.",
        ]),
        p("They work well together: the response cache answers repeated requests, and prompt caching makes the remaining calls cheaper because they share the same long prefix."),
        code("text", `
                          provider prompt cache          your response cache
model called?             yes, every request             no, on a hit
answer                    new every time                 the stored one
saves                     part of input cost, latency    the whole call
correctness risk          none (same answer quality)     stale or someone else's answer
you design                prompt order (stable first)    key, TTL, invalidation, privacy`, "two kinds of caching"),

        challenge("chal_quiz_nae_421"),

        h2("5. Worked example: a key that tells the truth"),
        p("The fixed key names every input that changes the answer. The prompt template already has a version (lesson 1.2), so the cache reads it from the template instead of a hand-typed string that someone forgets to update:"),
        code("typescript", `
// services/hints/cacheKey.ts
import { createHash } from "node:crypto";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function hintCacheKey(req: HintRequest, prompt: PromptTemplate, model: ModelConfig): string {
  const input = [
    req.challengeSlug,
    req.challengeRevision,                 // the reference solution and tests the prompt saw
    normalizeCode(req.learnerCode),
    req.failingTest,
  ].join("\\n");
  return [
    "hint",
    prompt.version,                        // hint-v5: a new prompt never reads v4 answers
    model.id,                              // the exact snapshot, e.g. model-a-2026-08
    \`t\${model.temperature}\`,
    \`max\${model.maxOutputTokens}\`,
    sha256(input),                         // no raw code or personal data in the key
  ].join(":");
}

// Conservative: only changes that cannot change the right hint.
function normalizeCode(code: string): string {
  return code.replace(/\\r\\n/g, "\\n").replace(/[ \\t]+$/gm, "").trim();
}`, "cacheKey.ts"),
        p("`normalizeCode` is deliberately small. Line endings and trailing spaces never change what a hint should say. Comments might: a learner who writes `// why does this skip the last word?` is asking a question. Renaming variables changes the hint too, because a good hint uses the learner's own names. Normalize only what you can prove does not change the right answer, and accept a lower hit rate for the rest."),
        p("The cache wrapper stores only answers that passed every check, and takes the clock as a parameter so the TTL can be tested without waiting:"),
        code("typescript", `
// services/hints/cachedHint.ts
export async function cachedHint(req: HintRequest, deps: Deps): Promise<HintResponse> {
  const prompt = deps.prompts.get("hint");               // current version, e.g. hint-v5
  const key = hintCacheKey(req, prompt, deps.model);

  const hit = deps.cache.get(key, deps.now());
  if (hit) {
    deps.log.info("hint", { requestId: req.id, source: "cache", promptVersion: prompt.version });
    return hit;
  }

  const response = await createHint(req, deps);          // schema validation + leak filter inside
  if (!response.fallback) {                               // never cache a fallback or an error
    deps.cache.set(key, response, deps.now() + 24 * 3600 * 1000);
  }
  deps.log.info("hint", { requestId: req.id, source: "model", promptVersion: prompt.version });
  return response;
}`, "cachedHint.ts"),
        p("And the prompt itself no longer contains the learner's name. A hint does not need it, and without it every stored answer is safe to share between learners who send the same code. If a feature really needs personal data in the answer, scope the key to the user (`hint:...:u_1042:...`) or do not cache it."),

        h2("6. Invalidation: change the key, not the data"),
        p("\"How do we delete the old entries when the prompt changes?\" is the wrong question. With the prompt version, the model and the challenge revision in the key, a change makes every old key unreachable at the moment of the deploy. Nothing has to be deleted; old entries simply expire with their TTL."),
        bullets([
            "**Prompt change.** hint-v5 builds keys that start with `hint:hint-v5:`; no request reads `hint:hint-v4:` again.",
            "**Model change.** A new snapshot id in the config gives new keys, so answers from the old model are not mixed with the new one in an A/B comparison.",
            "**Reference change.** An author fixes the reference solution; the challenge revision goes up and old hints that pointed at the old approach stop being served.",
            "**Rollback.** Going back from v5 to v4 reads v4 entries that are still alive. If v4 was rolled back because its answers were wrong, deploy the fix as a new version (v4.1) instead, so the wrong entries are never read again.",
            "**A bad entry right now.** Keep one manual lever: a global cache generation number in the config, part of every key, that an operator can increment to make the whole cache unreachable at once.",
        ]),

        h2("7. How to verify"),
        bullets([
            "**A unit test with a fake gateway.** Send the same request twice and assert one model call; change the prompt version and assert a second call; make the fake return a fallback and assert nothing was stored. No model, no network.",
            "**A TTL test with a fake clock.** Store at t, read at t + 23 h (hit) and at t + 25 h (miss).",
            "**Hit rate and cost per challenge.** Log `source=cache|model` with the prompt version. Compare cost per 1,000 hints before and after, per challenge: the cache may help easy challenges and do nothing for hard ones.",
            "**A personal data check on stored values.** Sample cached values and search them for names, emails and user ids from your user table. Any match means the value is not shareable.",
            "**After every prompt deploy.** In the next hour, every `source=cache` line must carry the new `promptVersion`.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**A key without the prompt version or the model.** Spot it: after a deploy, `source=cache` lines still show the old version, as in the incident.",
            "**Personal data in the value.** The key is hashed, but the prompt puts a name, an email or a learner's history into the answer. Spot it: search cached values for names from the user table.",
            "**Caching fallbacks and errors.** Spot it: the same fallback hint keeps coming from the cache long after the provider recovered.",
            "**Expecting prompt caching to return the same answer.** Spot it: cost estimates that count cached requests as free, while the usage log still shows output tokens for every call.",
            "**Normalizing away meaning.** Removing comments or renaming identifiers before hashing raises the hit rate and returns hints that answer someone else's question or use someone else's variable names. Spot it: hints that mention names the learner never wrote.",
        ]),

        h2("9. Summary"),
        numbered([
            "Cache an LLM answer only when calling again would give an equally right answer: a deterministic task at temperature 0, a key that holds the prompt version, the model, its parameters and the normalized input, and no personal data in the key or the value.",
            "Provider prompt caching reuses a stable prompt prefix and still generates a new answer; your response cache skips the call. Order prompts stable-first for the first, design keys and privacy for the second.",
            "Invalidate by changing the key: versions in the key make a deploy, a model change or a reference fix take effect at once, and only validated, filtered answers are ever stored.",
        ]),

        h2("Sources"),
        bullets([
            "Your LLM provider's documentation on prompt caching (whether it is automatic, the minimum prefix, lifetime and pricing differ between providers; check the current version)",
            "OWASP Top 10 for Large Language Model Applications: sensitive information disclosure - owasp.org/www-project-top-10-for-large-language-model-applications/",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Before you add a response cache to a feature, log the key you would use for a week without caching, and compute the repeat rate within your planned TTL. Then call your provider with two requests that share a long prefix and read the usage numbers in the responses: how many input tokens were cached, and what did the second call cost compared with the first?"),
    ],
});
