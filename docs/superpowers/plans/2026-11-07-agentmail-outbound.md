# AgentMail Outbound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `AGENTMAIL_API_KEY` is set, all user mail (verify email, reminders, account link, account notice) goes out through AgentMail SMTP instead of Gmail.

**Architecture:** `lib/mailConfig.mjs` gets a mode `agentmail`, checked before Gmail. It returns the same config shape that `lib/mail.js` already passes to nodemailer, so the transport, the auth outbox and every caller stay unchanged. Gmail and Mailpit keep working exactly as before when the key is not set.

**Tech Stack:** Next.js 16, nodemailer 10, vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-agentmail-outbound-design.md`

## Global Constraints

- Server: `smtp.agentmail.to`, port `465`, `secure: true`, a constant `AGENTMAIL_SERVER` in `lib/mailConfig.mjs` (next to `GMAIL_SERVER`).
- Mode name: `"agentmail"`.
- SMTP user is the `MAIL_FROM` address in lower case; SMTP password is `AGENTMAIL_API_KEY`.
- Order: `AGENTMAIL_API_KEY` → `MAIL_PASSWORD` (gmail / smtp) → Mailpit (dev, test) or `{ error }` (deployed).
- In mode `agentmail`, `MAIL_HOST`, `MAIL_PORT` and `MAIL_PASSWORD` are ignored.
- Missing `MAIL_FROM` with the key: `{ error: "MAIL_FROM (the AgentMail inbox address) is required with AGENTMAIL_API_KEY" }`.
- The key never appears in `describeMail`, in `checkEnvironment` output or in a thrown error.
- No new dependency, no `Idempotency-Key`, no change to `lib/mail.js` transport code or to any caller.
- `lib/mail.js` keeps relative imports (`scripts/mail-test.mjs` runs it with plain node).

## Review Focus

- A key pasted with a trailing newline or spaces (Vercel / `.env` copy) must still authenticate: trim it. Test in Task 1.
- `AGENTMAIL_API_KEY=` (empty, as in `.env.example`) must behave as unset, so development still goes to Mailpit. Test in Task 1.
- `MAIL_FROM` with a display name and upper-case address: the SMTP user is the lower-case address, `from` keeps the name. Test in Task 1.
- Production with no mail settings: the error names `AGENTMAIL_API_KEY` too, and the existing start-up check test (`/mail: MAIL_FROM \/ MAIL_PASSWORD/`) still matches. Test in Task 1.
- The key must not leak through `describeMail` or `checkEnvironment`. Test in Task 1.

---

### Task 1: `agentmail` mode in `mailConfig`

**Files:**
- Modify: `lib/mailConfig.mjs` (header comment lines 3-14, constants at 16-17, `mailConfig` at 29-62)
- Modify: `lib/mail.js:6-13` (comment only)
- Modify: `jobs/outbox.js:6-9` (comment only)
- Test: `__tests__/auth/oauthLinking.test.js` (`describe("mailConfig")`, lines 9-43)

**Interfaces:**
- Produces: `export const AGENTMAIL_SERVER = { host: "smtp.agentmail.to", port: 465 }`; `mailConfig(env)` may now return `{ mode: "agentmail", host, port, secure: true, auth: { user, pass }, from }`. `describeMail` is unchanged and prints `agentmail smtp.agentmail.to:465 from <from>`.

- [ ] **Step 1: Write the failing tests** in the `mailConfig` describe block:

```js
it("AGENTMAIL_API_KEY sends through AgentMail SMTP as the MAIL_FROM inbox", () => {
    expect(mailConfig({ APP_ENV: "production", MAIL_FROM: "CodeDev <CodeDev@AgentMail.to>", AGENTMAIL_API_KEY: " am_key123\n" })).toEqual({
        mode: "agentmail", host: "smtp.agentmail.to", port: 465, secure: true,
        auth: { user: "codedev@agentmail.to", pass: "am_key123" }, from: "CodeDev <codedev@agentmail.to>",
    });
});

it("AGENTMAIL_API_KEY wins over MAIL_PASSWORD / MAIL_HOST", () => {
    expect(mailConfig({ MAIL_FROM: "codedev@agentmail.to", AGENTMAIL_API_KEY: "am_key", MAIL_PASSWORD: "gmailpass", MAIL_HOST: "smtp.resend.com", MAIL_PORT: "587" }))
        .toMatchObject({ mode: "agentmail", host: "smtp.agentmail.to", port: 465, auth: { pass: "am_key" } });
});

it("an empty AGENTMAIL_API_KEY is unset; the key needs MAIL_FROM", () => {
    expect(mailConfig({ APP_ENV: "development", AGENTMAIL_API_KEY: "" })).toMatchObject({ mode: "mailpit" });
    expect(mailConfig({ APP_ENV: "production", AGENTMAIL_API_KEY: "am_key" }).error)
        .toBe("MAIL_FROM (the AgentMail inbox address) is required with AGENTMAIL_API_KEY");
    expect(mailConfig({ APP_ENV: "production" }).error).toMatch(/AGENTMAIL_API_KEY/);
});

it("never shows the AgentMail key", () => {
    const env = { APP_ENV: "production", MAIL_FROM: "codedev@agentmail.to", AGENTMAIL_API_KEY: "am_secret_key" };
    expect(describeMail(mailConfig(env))).toBe("agentmail smtp.agentmail.to:465 from CodeDev <codedev@agentmail.to>");
    expect(JSON.stringify(checkEnvironment(env))).not.toContain("am_secret_key");
});
```

Add `describeMail` to the existing import from `@/lib/mailConfig.mjs`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run __tests__/auth/oauthLinking.test.js -t mailConfig`
Expected: the 4 new tests FAIL (mode is `gmail` / `mailpit`, no `AGENTMAIL_API_KEY` in the error); the existing 5 pass.

- [ ] **Step 3: Implement the `agentmail` branch in `lib/mailConfig.mjs`**

- `AGENTMAIL_SERVER` constant per Global Constraints.
- At the top of `mailConfig`, after the `MAIL_FROM` parse error check: `const agentmailKey = String(env.AGENTMAIL_API_KEY || "").trim();` and, when non-empty, return the error from Global Constraints if `from` is null, else the config above (`from: \`${from.name} <${from.address}>\``).
- Production error at line 52 becomes `"MAIL_FROM / MAIL_PASSWORD (or AGENTMAIL_API_KEY) are not set: no email can be sent"`. Keep the `MAIL_FROM / MAIL_PASSWORD` prefix so the start-up check test still matches.
- JSDoc return type: `mode: "agentmail" | "gmail" | "smtp" | "mailpit"`.
- Header comment: add `AGENTMAIL_API_KEY` to the variable list and the three-step order; the `MAIL_HOST` line names "another SMTP provider" without Resend.

- [ ] **Step 4: Update the two comments**

- `lib/mail.js:7-8`: configuration is `AGENTMAIL_API_KEY` + `MAIL_FROM` (AgentMail), or `MAIL_FROM` + `MAIL_PASSWORD` (Gmail), or Mailpit in development.
- `jobs/outbox.js:8`: "Throttled per event type: the mail provider caps sends (AgentMail Free: 100 a day; Gmail: a few a minute)."

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `npx vitest run __tests__/auth/oauthLinking.test.js -t mailConfig`
Expected: 9 tests pass. Then `npx vitest run`: no new failures compared with `develop`.

- [ ] **Step 6: Commit**

```bash
git add lib/mailConfig.mjs lib/mail.js jobs/outbox.js __tests__/auth/oauthLinking.test.js
git commit -m "feat: send mail through AgentMail SMTP when AGENTMAIL_API_KEY is set"
```

### Task 2: Docs and live check

**Files:**
- Modify: `.env.example:44-51`
- Modify: `docs/auth.md` (line 46 "Mail transport", env table lines 84-86)
- Modify: `docs/environments.md:15`, `:129-130`, `:152-153`

**Interfaces:**
- Consumes: mode `agentmail` and the order from Task 1.

- [ ] **Step 1: `.env.example`** — under the Gmail lines add:

```
# AgentMail (production): set the API key and make MAIL_FROM the inbox address, e.g.
# MAIL_FROM=CodeDev <codedev@agentmail.to>. Takes priority over MAIL_PASSWORD / MAIL_HOST.
# AGENTMAIL_API_KEY=
```

- [ ] **Step 2: `docs/auth.md`**
  - Line 46: the transport order (AgentMail → Gmail / SMTP → Mailpit) and the start-up log line `mail: agentmail smtp.agentmail.to:465 from …`.
  - Env table: a new `AGENTMAIL_API_KEY` row ("AgentMail API key; set → `smtp.agentmail.to:465`, signed in as `MAIL_FROM`, which must be the inbox address; wins over `MAIL_PASSWORD`").
  - `MAIL_HOST` row: drop "(Resend later)".

- [ ] **Step 3: `docs/environments.md`**
  - Line 15 production cell: AgentMail `smtp.agentmail.to:465` (`AGENTMAIL_API_KEY` + `MAIL_FROM` = inbox); Gmail as fallback.
  - Lines 129-130: list `AGENTMAIL_API_KEY` and `MAIL_FROM` (the AgentMail inbox) among the production secrets; Gmail `MAIL_PASSWORD` only for the fallback.
  - Lines 152-153: `.env.local` leaves `AGENTMAIL_API_KEY` and `MAIL_PASSWORD` empty, so development mail goes to Mailpit.

- [ ] **Step 4: Check the docs agree with the code**

Run: `grep -n "AGENTMAIL_API_KEY" .env.example docs/auth.md docs/environments.md lib/mailConfig.mjs`
Expected: hits in all four files; no file still says production mail is Gmail only.

- [ ] **Step 5: Live check (needs the owner's AgentMail values; skip and say so if they are not available)**

Run: `npm run mail:test -- --env <file with AGENTMAIL_API_KEY and MAIL_FROM> --to <owner address>`
Expected: prints `agentmail smtp.agentmail.to:465 from CodeDev <…@agentmail.to>`, signs in, prints a message id; the mail arrives with sender "CodeDev".

- [ ] **Step 6: Commit**

```bash
git add .env.example docs/auth.md docs/environments.md
git commit -m "docs: AgentMail as the production mail provider, Gmail as fallback"
```

---

## Revision 2026-11-07: separate AgentMail variables, Gmail fallback

Tasks 1-2 are done (commits 9d2bdaf, 854a670, 27764b0). The spec's sections 2-3 were rewritten: AgentMail uses `AGENTMAIL_API_KEY` + `AGENTMAIL_FROM` (+ optional `AGENTMAIL_HOST`); Gmail (`MAIL_FROM` + `MAIL_PASSWORD`) is the fallback for any AgentMail send error. The spec carries the exact names, messages and test cases; this task applies them.

### Task 3: Routes with fallback

**Files:**
- Modify: `lib/mailConfig.mjs` (remove the agentmail branch from `mailConfig`; add `agentmailConfig`, `mailRoutes`, `describeRoutes`)
- Modify: `lib/mail.js` (`sendMail` / `verifyMail` over routes, transport cache per server)
- Modify: `lib/envCheck.mjs` (mail block, `mail` field)
- Modify: `scripts/mail-test.mjs`, `compose.yml:61-62` (comments), `.env.example`, `docs/auth.md`, `docs/environments.md`
- Test: `__tests__/auth/oauthLinking.test.js` (replace the 5 agentmail tests), Create: `__tests__/auth/mailFallback.test.js`

**Interfaces:**
- Produces: `agentmailConfig(env) -> config | null | { error }`; `mailRoutes(env) -> { routes: config[], errors: string[] }`; `describeRoutes({ routes, errors }) -> string`. `mailConfig` and `describeMail` keep their old shape.

- [ ] **Step 1:** Write the spec section 3 tests in both files; run `npx vitest run __tests__/auth/oauthLinking.test.js __tests__/auth/mailFallback.test.js`. Expected: the new tests FAIL (no `mailRoutes` export; `sendMail` has no fallback).
- [ ] **Step 2:** Implement `lib/mailConfig.mjs`, `lib/mail.js`, `lib/envCheck.mjs`, `scripts/mail-test.mjs` per spec section 2.
- [ ] **Step 3:** Run the same command. Expected: all pass. Then `npx vitest run`: no failures.
- [ ] **Step 4:** Docs and comments per spec section 3, last line; `grep -n "AGENTMAIL_FROM" .env.example docs/auth.md docs/environments.md lib/mailConfig.mjs` hits all four; no doc still says `MAIL_FROM` must be the AgentMail inbox.
- [ ] **Step 5:** Commit.
