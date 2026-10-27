// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nae-1-1",
    title: "How to put an LLM behind your API: keys on the server, a gateway & a fake model",
    slug: { _type: "slug", current: "llm-behind-your-api-gateway-fake-model" },
    description:
        "The first AI hint prototype called the model straight from the browser, with the API key in the JavaScript bundle, and someone used the key for their own app. Learn why every model call belongs on your server, how one gateway module owns timeouts, model choice, logging and cost, how a fake model behind the same interface makes the feature testable without a network, and what a log line about a model call may and may not contain.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "The AI hint prototype went live for 5% of learners behind the hints_beta flag. Three days later the LLM provider sent a usage alert: 41,800 requests since Monday, against about 600 expected. The provider's request log shows system prompts CodeDev never wrote (\"You are a friendly recipe assistant...\"). The prototype's HintButton component called the provider directly from the browser, and the API key was in the JavaScript bundle of the lesson page, which every visitor downloads, flag or no flag.",
    },

    content: [
        h2("1. The incident: a hint button that paid for someone else's app"),
        p("The prototype was built in an afternoon to see whether learners liked AI hints. It worked, which is exactly why it was dangerous. The whole feature lived in one client component:"),
        code("tsx", `
"use client";
// components/hints/HintButton.tsx - the prototype that shipped
const LLM_URL = "https://llm-provider.example/v1/chat";        // provider endpoint (placeholder)
const API_KEY = process.env.NEXT_PUBLIC_LLM_API_KEY;           // "so it is not in the source"

export function HintButton({ challenge, code }: { challenge: Challenge; code: string }) {
    async function askForHint() {
        const res = await fetch(LLM_URL, {
            method: "POST",
            headers: { Authorization: \`Bearer \${API_KEY}\`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "model-large",
                messages: [
                    { role: "system", content: "You are a programming tutor. Give a short hint, never the solution." },
                    { role: "user", content: \`Challenge: \${challenge.title}\\n\\nMy code:\\n\${code}\` },
                ],
            }),
        });
        setHint((await res.json()).text);
    }
    // ...
}`, "HintButton.tsx"),
        p("Read it from the point of view of a visitor. Everything this component knows, the browser knows: the provider URL, the model name, the system prompt and the key. The `hints_beta` flag only decided whether the button was **shown**; the code, and the key inside it, were part of the lesson page bundle for everyone."),

        h2("2. Read the evidence"),
        p("The provider's usage page (every provider has one; the exact layout differs) told most of the story:"),
        code("text", `
Requests per day (key "codedev-prototype")
  Mon   190
  Tue   214
  Wed  13,920
  Thu  27,476

Top system prompts, Thu
  27,102  "You are a friendly recipe assistant. Answer in the user's language..."
     374  "You are a programming tutor. Give a short hint, never the solution."`, "provider dashboard"),
        p("Our own prompt accounts for 374 requests. Everything else is someone else's product running on CodeDev's key. Finding the key took one minute in Chrome: open a lesson page, open DevTools, press **Ctrl+Shift+F** (search in all sources) and search for `Bearer` or for the first characters of the key. It sits in a file under `/_next/static/chunks/`. The same check from a terminal:"),
        code("bash", `
curl -s https://app.codedev.test/learn/c_17 | grep -o '/_next/static/chunks/[^"]*\\.js' | sort -u \\
  | while read f; do curl -s "https://app.codedev.test$f" | grep -l "llm-live-" >/dev/null && echo "key in $f"; done
key in /_next/static/chunks/app/learn/[id]/page-1a2b3c4d.js`, "terminal"),
        p("Why the environment variable did not help: in Next.js, a variable whose name starts with `NEXT_PUBLIC_` is **inlined into the client JavaScript at build time**. The prefix exists precisely so that a value can reach the browser. Vite's `VITE_` prefix and similar conventions in other bundlers do the same."),
        p("The first response was the boring, correct one: revoke the key in the provider console (a deleted key stops working everywhere at once, a rebuilt bundle does not, because old chunks stay cached in browsers and CDNs), create a new key that only the server knows, set a monthly spend limit and a usage alert in the provider console, and remove the prototype from the bundle."),

        h2("3. Core idea: the model is a dependency your server calls"),
        p("Treat a model API the way you treat a payment provider or an email service: an external, paid, sometimes slow, sometimes failing dependency that your **server** talks to on behalf of a user it has authenticated. The browser talks only to your API."),
        bullets([
            "**The key is money.** Anyone who has it can spend your quota on anything. Nothing that runs in a browser can keep a secret, obfuscated or not.",
            "**The prompt is part of your product.** In the browser it can be read and changed. On the server, the learner sends ids (`challengeId`, the code) and the server decides what the model sees.",
            "**Limits need an identity.** Per-user rate limits and token budgets (lesson 9) only work where you know who is asking: on the server, after authentication.",
            "**The answer needs checking.** Output validation (lesson 3), retries and fallbacks (module 2) and solution-leak checks (lesson 10) run before the learner sees anything. The browser cannot be trusted to run them.",
        ]),
        h3("One gateway module owns every model call"),
        p("Once calls move to the server, the next question is where on the server. If `HintService`, `ReviewService` and `ExplainErrorService` each import the provider SDK, you get three timeouts, three log formats, three ideas of which model to use, and nobody can answer \"what did we spend on hints yesterday?\" The simplest design that holds up is **one module that is the only code allowed to call a model**:"),
        bullets([
            "**Timeouts:** every call has one, set per feature (a hint can wait a few seconds; a background summary can wait longer).",
            "**Model choice:** features ask for a capability (`feature: \"hint\"`), configuration maps it to a model. Switching models or providers is a config change in one place.",
            "**Logging:** one structured line per call, with the same fields for every feature (section 5).",
            "**Cost:** the provider returns token usage with each response; the gateway turns it into an estimated cost with a price table from configuration and logs it per feature.",
            "**The key:** read from server-side configuration, used in exactly one file.",
        ]),
        p("Everything else in the course plugs into this module: versioned prompts (lesson 2), validation (lesson 3), retries and fallback (lessons 4-5), budgets (lesson 9) and caching (lesson 11)."),
        h3("When not to build more than this"),
        bullets([
            "**Not a separate service.** In a modular monolith (the NestJS course before this one) the gateway is a module with an exported interface. Split it out only when another deployable needs it and you can measure why.",
            "**Not a multi-provider framework on day one.** One adapter for the provider you use. The interface makes a second adapter possible later; do not write it before you need it.",
            "**Not a second gateway.** If your company already runs an LLM proxy for keys, quotas and audit logs, call it from this module instead of the provider. The module is still the single place in your code base.",
            "**Short-lived client tokens.** Some providers offer scoped, short-lived tokens for browser use cases such as realtime voice. Even then your server creates and limits them; check the provider's current docs. A text hint does not need one.",
        ]),

        h2("4. Worked example: the gateway in NestJS"),
        p("Start with the interface every feature depends on. It says nothing about any provider:"),
        code("typescript", `
// src/llm/llm-gateway.ts
export type LlmFeature = "hint" | "review";
export type StopReason = "end" | "max_tokens" | "refused" | "other";

export interface CompletionRequest {
    feature: LlmFeature;
    promptRef: string;                 // "hint-v3@3" - which template produced the prompt (lesson 2)
    system: string;
    user: string;
    maxOutputTokens: number;
    userRef: string;                   // internal user id, for logs and budgets - never an email
}

export interface CompletionResult {
    text: string;
    model: string;
    stopReason: StopReason;
    usage: { inputTokens: number; outputTokens: number };
    latencyMs: number;
}

export interface LlmGateway {
    complete(request: CompletionRequest): Promise<CompletionResult>;
}

export const LLM_GATEWAY = Symbol("LLM_GATEWAY");

export class LlmError extends Error {
    constructor(readonly kind: "timeout" | "rate_limited" | "provider_error" | "bad_response") {
        super(\`LLM call failed: \${kind}\`);
    }
}`, "src/llm/llm-gateway.ts"),
        p("The real implementation is the only file that knows the URL, the key and the provider's request format. The two adapter functions are where provider details live; their field names differ between providers and change over time, so write them from the provider's current API reference, not from memory or from this lesson:"),
        code("typescript", `
// src/llm/http-llm.gateway.ts
@Injectable()
export class HttpLlmGateway implements LlmGateway {
    private readonly logger = new Logger("llm");

    constructor(private readonly config: LlmConfig) {}       // url, apiKey, models, timeouts, prices: server-side only

    async complete(req: CompletionRequest): Promise<CompletionResult> {
        const model = this.config.models[req.feature];        // e.g. { hint: "model-small", review: "model-large" }
        const started = Date.now();
        try {
            const res = await fetch(this.config.url, {
                method: "POST",
                headers: { Authorization: \`Bearer \${this.config.apiKey}\`, "Content-Type": "application/json" },
                body: JSON.stringify(toProviderBody(model, req)),          // provider format: see its API reference
                signal: AbortSignal.timeout(this.config.timeoutMs[req.feature]),
            });
            if (res.status === 429) throw new LlmError("rate_limited");
            if (!res.ok) throw new LlmError("provider_error");
            // text, stop reason and usage; throws LlmError("bad_response") when the body has another shape
            const result = { ...fromProviderBody(await res.json(), model), latencyMs: Date.now() - started };
            this.logCall(req, "ok", result);
            return result;
        } catch (error) {
            const failure = error instanceof LlmError ? error
                : new LlmError(error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "provider_error");
            this.logCall(req, failure.kind, null, Date.now() - started);
            throw failure;                                            // features see one error type, never a raw fetch error
        }
    }
    // logCall(req, outcome, result, latencyMs?): one structured line, section 5
}`, "src/llm/http-llm.gateway.ts"),
        p("The module binds the interface to this class and exports only the token. Features import `LlmModule` and never see `HttpLlmGateway`:"),
        code("typescript", `
// src/llm/llm.module.ts
@Module({
    providers: [LlmConfig, { provide: LLM_GATEWAY, useClass: HttpLlmGateway }],
    exports: [LLM_GATEWAY],
})
export class LlmModule {}

// src/hints/hint.service.ts
@Injectable()
export class HintService {
    constructor(@Inject(LLM_GATEWAY) private readonly llm: LlmGateway, private readonly challenges: ChallengeReader) {}

    async requestHint(userRef: string, challengeId: string, code: string): Promise<HintResult> {
        const challenge = await this.challenges.byId(challengeId);      // the server decides what the model sees
        try {
            const result = await this.llm.complete({
                feature: "hint", promptRef: "hint-v3@3", userRef, maxOutputTokens: 300,
                system: HINT_SYSTEM_PROMPT, user: \`Challenge: \${challenge.title}\\n\\nLearner code:\\n\${code}\`,
            });
            return { ok: true, text: result.text };          // lesson 3 validates this before it is returned
        } catch (error) {
            if (error instanceof LlmError) return { ok: false, error: "hint_unavailable" };
            throw error;
        }
    }
}`, "src/hints/hint.service.ts"),
        p("The browser now sends `POST https://api.codedev.test/challenges/c_17/hints` with the learner's session cookie and the code, and nothing else. The controller behind it is guarded by authentication, so every model call has a known `userRef`."),
        h3("A fake model behind the same interface"),
        p("The payoff of the interface is in the tests. A fake that `implements LlmGateway` replays a script of answers and failures, records every request, and never touches the network:"),
        code("typescript", `
// src/llm/fake-llm.gateway.ts
type Scripted = { text: string; stopReason?: StopReason } | { error: LlmError["kind"] };

export class FakeLlmGateway implements LlmGateway {
    readonly calls: CompletionRequest[] = [];
    constructor(private readonly script: Scripted[]) {}

    async complete(req: CompletionRequest): Promise<CompletionResult> {
        this.calls.push(req);
        const next = this.script.shift();
        if (!next) throw new Error("FakeLlmGateway: no scripted answer left");   // a test bug, not an LLM error
        if ("error" in next) throw new LlmError(next.error);
        return { text: next.text, model: "fake", stopReason: next.stopReason ?? "end",
                 usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 };
    }
}`, "src/llm/fake-llm.gateway.ts"),
        p("Scripted texts can be written by hand or copied from **recorded fixtures**: real responses saved once (with personal data removed) and replayed forever. Lesson 12 builds a full test suite on this; for now the point is that the hint feature can be tested on day one, and that a timeout, a rate limit and a cut-off answer are as easy to script as a good answer."),

        challenge("chal_quiz_nae_111"),

        h2("5. Logging a model call without personal data"),
        p("You will need logs to answer three questions: what did a feature cost, how slow was it, and which prompt version produced a bad answer. None of them needs the learner's code or name. One line per call, with a fixed set of fields:"),
        code("json", `
{"event":"llm.call","requestId":"req_7f3a91","feature":"hint","promptRef":"hint-v3@3",
 "model":"model-small","outcome":"ok","stopReason":"end","inputTokens":812,"outputTokens":96,
 "latencyMs":1840,"estCost":0.00031,"userRef":"u_1042"}`, "one log line"),
        bullets([
            "**Ids, not content.** `userRef` is an internal id, not an email. The prompt and the answer are not in this log: learner code often contains names, emails or tokens in comments and test data.",
            "**An id still points to a person.** Treat these logs as personal data for access rights and retention, even without names in them.",
            "**Debugging samples are a separate, deliberate store.** If you need real prompts to investigate bad answers, keep a small sample, redact it, restrict access and delete it after a short period. Do not turn on full-text logging \"for a week\" in the normal log pipeline.",
            "**Cost is an estimate.** Compute it from the usage numbers the provider returns and a price table in configuration. Prices change and differ per model; check the provider's current pricing page and compare your estimate with the invoice every month.",
        ]),
        p("Write the allowlist once in `logCall` and test it: a unit test that renders a log line from a request whose code contains `lan.nguyen@example.com` and asserts that the string `@` does not appear in the output catches the day someone adds `prompt` to the log \"temporarily\"."),

        h2("6. How to verify"),
        bullets([
            "**The bundle contains no key.** In CI, after `next build`, search the client output for the key's value from the secret store: `grep -rF \"$LLM_API_KEY\" .next/static && exit 1`. Add a lint rule that rejects `NEXT_PUBLIC_` names containing `KEY`, `SECRET` or `TOKEN`.",
            "**The browser talks only to your API.** In DevTools, **Network** tab, click Get a hint: you see one request to `api.codedev.test` and no request to the provider's domain.",
            "**Only one module calls a model.** `grep -rln \"llm-provider.example\\|@provider/sdk\" src | grep -v \"^src/llm/\"` must print nothing, or enforce it with ESLint `no-restricted-imports`.",
            "**Tests cannot reach the network.** In the test setup, replace `globalThis.fetch` with a function that throws `\"network disabled in tests\"`. A test that forgot to use the fake fails loudly instead of spending money.",
            "**The log has no content.** The `@` test above, plus a look at a day of real `llm.call` lines: every line has the same fields, and `estCost` summed by `feature` matches the provider's usage page within a few percent.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**A public prefix on a secret.** `NEXT_PUBLIC_LLM_API_KEY`, `VITE_OPENAI_KEY`: the prefix ships the value to every browser. Spot it by searching the built client files for the key, and the code for public env names that end in `KEY`.",
            "**An open relay.** `POST /api/llm` that takes `messages` and `model` from the browser and forwards them with the server's key. The key is hidden, but anyone can still use it for anything. Spot it when an endpoint accepts a prompt or a model name from the client; the server should accept ids and build the prompt itself.",
            "**The SDK in every service.** Each feature calls the provider directly, with its own timeout (or none). Spot it with a search for the SDK import or the provider URL outside `src/llm/`.",
            "**Logging the prompt and the answer at info level.** It feels useful until the log contains learner emails and pasted tokens. Spot it by searching a day of logs for `@` or for `\"prompt\"`.",
            "**A fake that cannot fail.** A fake that always returns a good answer, or returns parsed objects while the real gateway returns text, makes every test pass and teaches nothing about production. Spot it when the fake does not `implements LlmGateway`, or when no test scripts a timeout.",
        ]),

        h2("8. Summary"),
        numbered([
            "Model calls belong on your server: the browser sends ids and code to your API, and only the server knows the key, builds the prompt and checks the answer. A public env prefix puts the key in the bundle.",
            "One gateway module is the only code that calls a model. It owns timeouts, model choice per feature, one structured log line per call and the cost estimate, behind an interface that features inject.",
            "A fake that implements the same interface replays scripted answers and failures, so the feature is tested without a network, and the log line about a call carries ids, tokens and timings, never the learner's code.",
        ]),

        h2("Sources"),
        bullets([
            "OWASP Top 10 for Large Language Model Applications - owasp.org/www-project-top-10-for-large-language-model-applications/ (sensitive information disclosure, unbounded consumption)",
            "Next.js documentation: Environment Variables (bundling variables for the browser with the NEXT_PUBLIC_ prefix)",
            "NestJS documentation: Custom providers (useClass, injection tokens) and Testing (overrideProvider)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "In a NestJS project of your own, create an LlmModule with the LlmGateway interface, a FakeLlmGateway and an HttpLlmGateway for a provider you have access to (write its adapter from the provider's current API reference). Write one service test that scripts a timeout and one that scripts a good answer, run them with fetch disabled, and add the CI check that searches your client bundle for the key."),
    ],
});
