// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Every key, token and password in this file is fake.
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-aad-4-2",
    title: "Keep secrets out of prompts: redact before you paste",
    slug: { _type: "slug", current: "keep-secrets-out-of-prompts-redact-before-paste" },
    description:
        "A developer pasted a failing job's log and the production .env into an AI chat, and the assistant's draft of a public GitHub issue carried the database password with it. Learn where prompt text goes, which secrets hide in logs, headers and URLs, why a list of variable names is not a redaction policy, how to redact by shape with typed placeholders that keep the text useful, how to keep a coding agent away from .env files, and what to do once a secret has left your machine.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "The nightly leaderboard job on https://api.codedev.test failed with \"password authentication failed\". To get help fast, a developer pasted the stack trace and the whole .env.production into a chat with an AI assistant, then asked it to draft a bug report for the connection-pool library. The developer posted the draft as a public GitHub issue. Two days later the database audit log showed a successful login as codedev_app from an address outside the company's network.",
    },

    content: [
        h2("1. The incident: a bug report that carried the password"),
        p("Nothing about the request looked dangerous. The developer wanted an answer and gave the assistant everything that might help:"),
        code("text", `
Why does this fail after the deploy? Log and config below.

Error: password authentication failed for user "codedev_app"
    at Pool.connect (node_modules/pg-pool/index.js:45:11)
    at refreshLeaderboard (jobs/leaderboard.ts:18:22)

# .env.production
NODE_ENV=production
DATABASE_URL=postgres://codedev_app:Fake-Passw0rd!@db.codedev.test:5432/codedev
JWT_SECRET=FAKE-jwt-secret-for-the-course
OPENAI_API_KEY=sk-codedev-FAKE-0000000000000000`, "the prompt (secrets replaced with fakes here)"),
        p("The assistant found the cause (the deploy had rotated the password in the secret manager but not in the job's environment) and, when asked, drafted a bug report \"with all the details maintainers need\". It did what it was asked: the draft included the configuration it had been given. The developer skimmed it, saw a well-written issue, and posted it."),
        p("Two separate leaks happened. The first was the paste itself: four production secrets sent to a third-party service, outside the company's approved tools. The second was the draft: **text you put into a prompt can come back in the output**, and output gets copied into issues, commit messages, pull request descriptions and documentation. The second leak was the one an attacker found."),

        h2("2. Read the evidence"),
        p("The database's audit log made the incident visible. Logins as `codedev_app` normally come from the job runners in one private network:"),
        code("text", `
2026-10-22 02:00:04 UTC  LOG: connection authorized: user=codedev_app database=codedev host=10.20.3.14
2026-10-23 02:00:03 UTC  LOG: connection authorized: user=codedev_app database=codedev host=10.20.3.14
2026-10-24 17:42:51 UTC  LOG: connection authorized: user=codedev_app database=codedev host=203.0.113.77
2026-10-24 17:43:09 UTC  LOG: statement: SELECT email, display_name FROM identity.users LIMIT 1000`, "database audit log"),
        p("The public issue had been created on 2026-10-22 at 09:40. Searching it for `codedev.test` found the full connection string within seconds, which is what automated scanners do all day on public repositories. The response that followed is the standard one for a leaked credential, and it does not depend on where the leak happened:"),
        numbered([
            "**Revoke and replace** every secret that was in the paste: the database password, `JWT_SECRET` (which also signs out every learner) and the OpenAI key. Deleting the issue or the chat does not un-leak anything.",
            "**Check usage** of each credential between the leak and the rotation: the database audit log, the API provider's usage page, sign-ins.",
            "**Find the path** the secret took, so the next one does not take it: here, a full `.env` pasted into a chat, and a draft posted without being read as a reviewer would.",
        ]),

        h2("3. Core idea: a prompt is a message to someone else"),
        p("Whatever you type into an assistant leaves your machine. Depending on the product and the plan, the text goes to the provider's servers, may be kept for some time under its retention policy, may be visible to browser extensions or plugins, may end up in a shared conversation link, and in a coding agent becomes part of the context the agent reuses in later steps. Your company may have approved one tool with data controls and not another. None of that is a reason not to use AI; it is a reason to treat a prompt like an email to an outside vendor: **send what they need, not what you have**."),
        h3("Secrets hide by shape, not only by name"),
        p("The first defence most people write is a list of \"secret-looking\" names: `apiKey`, `secret`, `token`. That catches `JWT_SECRET=...` and misses most of what is in a real log:"),
        bullets([
            "**Connection strings**: `postgres://user:password@host` carries a password with no key name at all. The host and the user are useful to the assistant; the password never is.",
            "**HTTP headers**: `Authorization: Bearer <token>`. The header name is not on anyone's list of secret words.",
            "**JWTs**: three base64url parts starting with `eyJ`, in cookies, query strings and logs. A session JWT is a working login until it expires.",
            "**Private keys**: a `-----BEGIN ... PRIVATE KEY-----` block from a deploy script or a config map.",
            "**Well-known prefixes**: providers make their keys recognisable on purpose so scanners can find them, for example `sk-` (several AI providers), `ghp_` (GitHub personal access tokens) and `AKIA` (AWS access key IDs).",
            "**.env lines** with a sensitive name: `*_SECRET`, `*_TOKEN`, `*_PASSWORD`, `*_KEY`.",
        ]),
        p("A redaction step therefore needs rules by **shape** as well as by name, applied in a sensible order: the specific shapes first (a JWT inside a `Bearer` header should be reported as a JWT), the generic `NAME=value` rule last."),
        h3("Typed placeholders keep the prompt useful"),
        p("Replacing a secret with `***` or deleting the line throws away information the assistant needs. `[REDACTED:password]` keeps the meaning: the assistant can still see that the URL had a password, that the header carried a bearer token, that `SESSION_TOKEN` held a JWT. Keeping every other character as it was matters too: line numbers, indentation and the exact error text are often the evidence."),
        code("text", `
DATABASE_URL=postgres://codedev_app:[REDACTED:password]@db.codedev.test:5432/codedev
JWT_SECRET=[REDACTED:env]
OPENAI_API_KEY=[REDACTED:api_key]`, "the same .env after redaction"),
        p("With this version the assistant can still answer the real question (\"is the job reading the new password?\") because the structure is intact."),
        h3("When redaction is the wrong tool"),
        bullets([
            "**Do not paste what you do not need.** The incident needed the stack trace and the name of the variable, not the whole `.env`. Removing the file from the paste beats redacting it.",
            "**Personal data is not solved by regexes.** Learners' names, emails and submissions in a database dump need a decision about whether they may leave at all, and usually synthetic data instead. The email rule in this lesson is a convenience, not a privacy policy.",
            "**Redaction is a safety net, not permission.** A missed secret is still leaked. Keep the rotation steps from section 2 ready.",
        ]),

        challenge("chal_quiz_aad_421"),

        h2("4. Worked example: redact on the way out, and fence the agent"),
        p("Make the safe path the easy one. A small command in the repository reads text from standard input, redacts it and prints a summary, so \"paste into the assistant\" becomes \"pipe through `paste-safe` first\":"),
        code("typescript", `
// scripts/paste-safe.ts - usage: some-command 2>&1 | npx tsx scripts/paste-safe.ts > safe.txt
import { readFileSync } from "node:fs";
import { redactSecrets } from "../lib/redactSecrets";

const raw = readFileSync(0, "utf8");
const { text, counts } = redactSecrets(raw, { redactEmails: true });

const found = Object.entries(counts).filter(([, n]) => n > 0).map(([type, n]) => \`\${type}: \${n}\`);
process.stderr.write(found.length ? \`redacted \${found.join(", ")}\\n\` : "no secrets found\\n");
process.stdout.write(text);`, "paste-safe.ts"),
        p("The summary goes to standard error so it never mixes with the text you paste, and it tells you what was found: if it says `password: 1` for a log that should not contain passwords, that is a bug worth knowing about on its own."),
        p("A coding agent needs a different fence, because it reads files by itself. Tell the tool which files it may never open. In Claude Code that is a deny rule in the project settings; Cursor has an ignore file and GitHub Copilot has content exclusion settings for the same purpose:"),
        code("json", `
{
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)"
    ]
  }
}`, ".claude/settings.json"),
        p("Keep real secrets out of the working tree where you can (a secret manager, environment variables injected at run time), and keep an `.env.example` with fake values for the agent to read instead. An agent that needs to know which variables exist can learn that from the example file."),

        h2("5. How to verify"),
        bullets([
            "**Test the redactor with fixtures**, like the challenge below: one fake secret of every type, lookalikes that must not be redacted (`task-...`, \"Bearer tokens are...\", a public key), CRLF line endings, and a check that the output differs from the input only inside the placeholders.",
            "**Read the summary before you paste.** Zero findings on a log you know contains a token means the redactor has a gap.",
            "**Run a secret scanner** on what leaves through Git: GitHub secret scanning with push protection, or a scanner such as gitleaks in CI. Scanners use the same idea (shapes and known prefixes) and catch what slips past people.",
            "**Read AI output as outgoing text.** Before an AI-drafted issue, commit message or pull request description is posted, search it for `://`, `Bearer`, `eyJ`, `BEGIN` and your own domain.",
            "**Test the agent fence.** Ask the agent to print `.env` in a test session and confirm the tool refuses.",
        ]),

        h2("6. Common mistakes, and how to spot them"),
        bullets([
            "**Redacting by variable name only.** Spot it: a redactor with a list of words and no rule for `://user:pass@`, `Bearer` or `eyJ`. The quiz shows what passes through.",
            "**Destroying the context.** Spot it: redacted pastes full of `***` where the assistant then asks which variable was which. Use typed placeholders and keep everything else byte for byte.",
            "**Over-matching.** Spot it: `task-0123...` or the sentence \"Bearer tokens are sent...\" turned into placeholders. Boundaries and minimum lengths keep the redactor honest, and a redactor that mangles normal text gets switched off.",
            "**Deleting instead of rotating.** Spot it: \"I deleted the message\" in an incident thread with no rotation ticket. A leaked secret is rotated, every time.",
            "**Letting the agent read `.env` \"just to understand the config\".** Spot it: agent transcripts that show `.env` contents. Deny the path and provide `.env.example`.",
        ]),

        h2("7. Build the redactor"),
        p("Write `redactSecrets(text, { redactEmails })`: private key blocks, passwords in connection strings (keep the host), JWTs, `sk-`/`ghp_`/`AKIA` keys, bearer tokens and sensitive `.env` values become typed placeholders, emails only when asked, every other character stays as it was, and the result reports how many secrets of each type it replaced. Every secret in the tests is fake."),
        challenge("chal_coding_aad_422"),

        h2("8. Summary"),
        bullets([
            "A prompt leaves your machine, and its content can come back in the assistant's output: paste what the assistant needs, never whole `.env` files, and read AI-drafted text as outgoing text.",
            "Redact by shape and by name, specific shapes first, with typed placeholders that keep the text useful and every other character unchanged; fence coding agents away from secret files.",
            "A secret that has left is leaked: revoke and replace it, then check its usage. Deleting the message does not undo it.",
        ]),

        h2("Sources"),
        bullets([
            "Claude Code documentation: settings and permissions (deny rules for file reads) - docs.anthropic.com/en/docs/claude-code",
            "GitHub Docs: secret scanning and push protection; GitHub Copilot content exclusion - docs.github.com",
            "OWASP Cheat Sheet Series: Secrets Management Cheat Sheet",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Take the last log or stack trace you pasted into an assistant and run it through your redactor. What did it find, and what should it have found? Then add a deny rule for .env files to the AI tool you use on your own project, create an .env.example with fake values, and check that the tool refuses to open the real file."),
    ],
});
