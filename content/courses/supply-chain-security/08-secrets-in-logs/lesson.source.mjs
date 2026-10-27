// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-ssc-3-2",
    title: "Fix it: a config loader that prints secrets",
    slug: { _type: "slug", current: "fix-config-loader-prints-secrets" },
    description:
        "A failed CI build printed the whole configuration, sandbox API key included, one line above the real error, and a preview deploy put a database password in its crash message. Learn why logs are a data store with many readers, why CI masking is only an exact-string find-and-replace, how to validate configuration at startup and report problems by name, how to log a summary from an explicit list of secrets instead of a name heuristic, and how to test that no secret reaches a log line or an error message.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "CI build #1187 of the CodeDev API failed on a pull request with \"Error: LOG_LEVEL invalid: verbose\". A content writer who opened the log to see why noticed that the line above the error was the whole configuration as JSON, including SANDBOX_API_KEY, the key the code runner uses to create sandboxes. The same week, a preview deploy crashed with \"DATABASE_URL invalid: postgres:/codedev_app:...\" - password included - in the hosting provider's log. Both lines come from src/config.ts, the first module every process loads.",
    },

    content: [
        h2("1. The incident: one line above the error"),
        p("The CI job builds the API with the preview environment's variables, which it downloads from the hosting provider at the start of the job. A pull request set `LOG_LEVEL=verbose` in that environment. This is the end of the build log:"),
        code("text", `
Run npx vercel env pull .env.local --environment=preview
Created .env.local
Run npm run build
> codedev-api@3.18.0 build
> next build
loading config {"NODE_ENV":"test","PORT":"8080","LOG_LEVEL":"verbose","PUBLIC_APP_URL":"https://app.codedev.test","DATABASE_URL":"postgres://codedev_app:FAKE-db-pass-0000@db.codedev.test:5432/codedev","JWT_SECRET":"FAKE-jwt-secret-for-tests-0000000000","SANDBOX_API_KEY":"sbx_FAKE_7f3a9c2e5b8d1046"}
Error: LOG_LEVEL invalid: verbose
    at loadConfig (src/config.ts:41:23)
Error: Process completed with exit code 1.`, "CI build #1187 (values replaced with fakes)"),
        p("Nothing in that log was masked. GitHub Actions masks the values of secrets it knows - the ones referenced as `secrets.*` in the workflow. These values came from a file the job downloaded, so the runner had no idea they were secret. The log is kept for 90 days and anyone with read access to the repository can open it: developers, the content team, contractors."),
        p("This is the code that wrote it. It was written quickly during an earlier outage and never revisited:"),
        code("typescript", `
// src/config.ts - before
function loadConfig(env: NodeJS.ProcessEnv): Config {
  const config = readSchema(env);
  console.log("loading config", JSON.stringify(config));   // "temporary", added during the preview outage

  for (const spec of SCHEMA) {
    const value = config[spec.name];
    if (value === undefined && spec.required) throw new Error(\`\${spec.name} is required\`);
    if (value !== undefined && !spec.valid(value)) throw new Error(\`\${spec.name} invalid: \${value}\`);
  }
  console.log("config ok:", summary(config));    // masks names matching /SECRET|PASSWORD/
  return config;
}`, "config.ts"),

        h2("2. Read the evidence: how many places leak?"),
        p("Before fixing anything, list every path from a secret to an output. Searching the logs for a recognisable piece of the value tells you where it already went:"),
        code("bash", `
# GitHub Actions logs of the last 100 runs of the build workflow
$ gh run list --workflow build.yml --limit 100 --json databaseId --jq '.[].databaseId' \\
    | xargs -I{} sh -c 'gh run view {} --log 2>/dev/null | grep -q "sbx_" && echo {}'
9187254410
9179931862
9164408127

# The preview deploy log, downloaded from the hosting provider
$ grep -o 'DATABASE_URL invalid: [^ ]*' preview-deploy-9c1e.log
DATABASE_URL invalid: postgres:/codedev_app:FAKE-db-pass-0000@db.codedev.test/codedev`, "terminal"),
        p("Three runs, not one: every failed build printed the dump. Reading the loader with that in mind gives three separate leaks:"),
        numbered([
            "**The startup dump.** It prints every value before any check, so it leaks on every start - successful or not.",
            "**The error message.** `invalid: ${value}` puts the bad value into the exception. The process's top-level handler prints it to stderr, and error trackers and CI annotations copy it further. A mistyped URL is still a real password: here `postgres:/` was missing one slash.",
            "**The summary's secret test.** `/SECRET|PASSWORD/` matches `JWT_SECRET` but not `DATABASE_URL` or `SANDBOX_API_KEY`, so even the \"safe\" success line printed both in clear text.",
        ]),
        callout("warning", "Clean up in the right order",
            "Rotate the sandbox API key and the database password first: the logs have been readable for days. Then delete the affected run logs (in the Actions UI, the run menu has Delete all logs) and the deploy logs. Deleting logs without rotating only hides the evidence of the leak."),

        h2("3. Core idea: a log is a data store with many readers"),
        p("Logs feel private because you write them for yourself. In practice they are copied to the CI provider, the hosting provider, the log aggregator, the error tracker and the support ticket where someone pasted them, each with its own access list and retention. Treat a log line like a database column that everyone in the company can read for months."),
        h3("Masking is a find-and-replace, not a guarantee"),
        p("CI masking replaces the exact string of each registered secret with `***`. It cannot know about values it was not given, and it does not recognise transformed values: base64, URL-encoding, JSON escaping, a substring, or a value split across two lines all pass straight through. Use it as a last net. If a job must work with a derived secret, register that too with `echo \"::add-mask::$DERIVED\"` before anything prints it."),
        h3("Allowlist what you log, from the schema"),
        p("The broken summary decided \"is this a secret?\" from the variable's name. Names are written by people on different days: `DATABASE_URL` contains a password and matches nothing; a future `STRIPE_RESTRICTED_KEY` would not match either. The decision belongs in one place, next to the variable's definition:"),
        code("typescript", `
type Spec = { name: string; required: boolean; secret: boolean; default?: string; valid: (v: string) => boolean };

// The schema says what is secret. Nothing else gets to decide.
const SCHEMA: Spec[] = [
  { name: "NODE_ENV",        required: true,  secret: false, valid: (v) => ["development", "test", "production"].includes(v) },
  { name: "DATABASE_URL",    required: true,  secret: true,  valid: (v) => /^postgres(ql)?:\\/\\/./.test(v) },
  { name: "SANDBOX_API_KEY", required: true,  secret: true,  valid: (v) => v.length >= 20 },
  // ...
];`, "config schema"),
        p("With the flag in the schema, a startup summary is safe by construction: it prints a non-secret's value, and for a secret only something that cannot be used to log in."),
        h3("What to show for a secret"),
        bullets([
            "**`***` plus the last 4 characters**, as card receipts do. After a rotation you can confirm which key a server loaded without seeing the key. It only works for long values: the last 4 characters of a 9-character password are almost half of it. CodeDev's rule is last 4 from 20 characters up, `***` alone below that.",
            "**A fingerprint**, such as the first 8 hex characters of the value's SHA-256. It identifies the value without revealing any of it, at the cost of one more step to compare.",
            "**Nothing at all** in production if nobody reads the summary. The best log line for a secret is the one you never write.",
        ]),
        h3("Validate at startup and report by name"),
        p("A configuration error should stop the process before it serves a request, and the message should let the person fixing it act in one go: every missing and every invalid variable, by name, together. Reporting one problem per run turns three mistakes into three failed deploys. The value is never needed to fix the problem: the person who can fix it can read the variable in the provider's settings, behind that provider's access control."),
        p("When not to bother: a one-off script that you run on your own machine with your own credentials does not need a schema and masking rules. Anything that runs in CI, in a deploy or on a shared server does."),
        challenge("chal_quiz_ssc_321"),

        h2("4. Worked example: the error path is a log too"),
        p("Here is the same mistake in a different service, the e-mail worker, and its fix. The worker reads three variables:"),
        code("typescript", `
// before: the message carries the value
if (!env.WEBHOOK_URL?.startsWith("https://")) {
  throw new Error(\`WEBHOOK_URL must be https, got \${env.WEBHOOK_URL}\`);
}

// after: the message carries the name and the rule, never the value
const problems: string[] = [];
if (!env.SMTP_PASSWORD) problems.push("SMTP_PASSWORD is missing");
if (env.WEBHOOK_URL && !env.WEBHOOK_URL.startsWith("https://")) problems.push("WEBHOOK_URL must start with https://");
if (problems.length > 0) throw new Error(\`Invalid worker configuration: \${problems.join("; ")}\`);`, "worker/config.ts"),
        p("The \"after\" version is just as useful to the person on call: the rule tells them what to look for, and they can open the variable in the provider's settings. Notice also that it keeps collecting problems instead of throwing at the first one."),
        p("In the exercise you apply the same idea to the API's loader: remove the dump, report missing and invalid variables by name in one error, and build the success line from the schema's `secret` flag with the 20-character rule. The test runner prints what your loader logged and threw, and adds a `leaked:` line whenever a secret's full value appears in that output."),
        challenge("chal_coding_ssc_322"),

        h2("5. How to verify"),
        bullets([
            "**Capture both outputs in tests.** Inject the logger (or spy on `console.log` and `console.error`), call the loader with canary secrets such as `sbx_FAKE_...`, and assert that no canary appears in the captured lines **or** in the thrown message. Test the failing paths: they are the ones that leak.",
            "**Test the message, not only that it throws.** `expect(() => loadConfig(env)).toThrow()` passes on the leaking version. Assert the exact text, for example `Invalid configuration: missing JWT_SECRET; invalid DATABASE_URL`.",
            "**A canary in CI.** Add a job step that runs the build with a deliberately broken environment containing a fake key, then greps its own log output for that key and fails if it finds it.",
            "**Search the real logs after the fix.** Repeat the `gh run view --log | grep` search from section 2 on runs after the merge: the count must be zero, and the next failed build should show only names.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**\"Temporary\" debug dumps of the whole config.** They survive because nothing fails. Spot them with a lint rule or a search for `JSON.stringify(config` and `console.log(process.env` in code review.",
            "**Values in exception messages.** `invalid: ${value}` is the most common leak because error paths are rarely tested. Spot it by searching `throw new Error(` lines that interpolate a variable read from the environment.",
            "**Deciding secrecy from the name.** A regex over names misses `DATABASE_URL`, `*_DSN` and new keys. Spot it when the masking code mentions variable names instead of reading a flag from one schema.",
            "**Masks that reveal too much.** Last 4 characters of a short password, the first 8 of a token (often a fixed prefix plus real entropy), or the length plus a prefix. Spot it by asking how many guesses are left for someone who sees the masked line.",
            "**Trusting CI masking.** It does not cover values loaded from files or providers, or any transformed form. Spot it by checking where each secret in the job comes from: only `secrets.*` references are masked automatically.",
        ]),

        h2("7. Summary"),
        numbered([
            "Every string that leaves the process - log lines, exception messages, crash reports - is a log with many readers and long retention; CI masking only replaces exact strings it was told about.",
            "Validate configuration at startup, report every missing and invalid variable by name in one error, and never put a value in the message.",
            "Build the startup summary from one schema with an explicit secret flag, mask secrets (last 4 only for long values), and test the captured log and the thrown message with canary values.",
        ]),

        h2("Sources"),
        bullets([
            "GitHub Docs: Using secrets in GitHub Actions (redaction of secrets in logs) and the add-mask workflow command",
            "OWASP Logging Cheat Sheet: data to exclude from logs",
            "The Twelve-Factor App: III. Config (configuration in the environment)",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Pick one of your services and list every place a configuration value can be printed: startup logs, error messages, health or debug endpoints, crash reporters. For each, write the test that would fail if a canary secret appeared there, and run it with a deliberately broken environment."),
    ],
});
