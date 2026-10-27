// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-acp-4-2",
    title: "Move the API key out of the frontend",
    slug: { _type: "slug", current: "move-the-api-key-out-of-the-frontend" },
    description:
        "The vibe-coded course studio calls an AI vendor straight from the browser, with the API key in a NEXT_PUBLIC_ variable, and the vendor reports the key in use from hundreds of unknown addresses. Learn why everything in the client bundle is public, what the NEXT_PUBLIC_ prefix really does, why obfuscation and CORS do not help, and how to move the call behind a server route that holds the key, authenticates the caller and limits each user - then prove that no key ships to the browser.",
    estimatedTime: 25,

    scenario: {
        role: "Full-stack developer hardening a vibe-coded app, CodeDev learning platform",
        problem:
            "Tuesday 08:10. The AI vendor emails CodeDev: the key ending in ...93e1 made 18,400 requests in the last 24 hours from 312 IP addresses, and the account is close to its monthly spending limit. The key belongs to the course studio's \"Suggest an outline\" button, built with a coding agent over the weekend. The studio has 14 instructors, who clicked the button 61 times yesterday.",
    },

    content: [
        h2("1. The incident: a button that anyone can press"),
        p("The \"Suggest an outline\" button sends a course title to an AI vendor and fills the course plan with three section titles. The agent's first version was right in shape: a server route, `POST /api/outline`, that called the vendor. In the demo the route answered 401, because Minh opened the studio on a preview URL where he was not logged in. The conversation that followed is short:"),
        code("text", `
[23:05] Minh: the outline button says 401. just make it work, demo is monday
[23:07] agent: The route rejects requests without a session. I removed the session check from
        app/api/outline/route.ts. To avoid the extra round trip, OutlineButton now calls the AI vendor
        directly from the browser. The key is read from NEXT_PUBLIC_AI_API_KEY, which I added to .env.local
        because client components can only read variables with the NEXT_PUBLIC_ prefix.
[23:08] Minh: works now, thanks`, "agent conversation, Friday night"),
        code("tsx", `
// app/studio/OutlineButton.tsx
"use client";
export function OutlineButton({ title, onOutline }: Props) {
  async function suggest() {
    const res = await fetch("https://api.ai-vendor.test/v1/outline", {
      method: "POST",
      headers: { authorization: \`Bearer \${process.env.NEXT_PUBLIC_AI_API_KEY}\` },
      body: JSON.stringify({ topic: title, sections: 3 }),
    });
    onOutline((await res.json()).sections);
  }
  return <button onClick={suggest}>Suggest an outline</button>;
}`, "OutlineButton.tsx (as shipped)"),
        p("The agent's explanation is accurate, and it even names the mechanism that caused the leak: client components can only read `NEXT_PUBLIC_` variables *because* those are the variables Next.js copies into the browser bundle. Two mistakes are stacked here, and the fix has to remove both: the key now ships to every browser, and the server route that could have protected it was turned into an open door."),

        h2("2. Reproduce it and read the evidence"),
        p("You do not need the vendor's email to find this. Three checks, each takes a minute:"),
        code("bash", `
# 1. Build like production and search the files that are served to browsers.
npm run build
grep -rl "sk-fake-4f9a" .next/static
# .next/static/chunks/app/studio/page-8c41d2.js

# 2. The vendor's usage log, filtered by key (export from the vendor dashboard).
# 2026-10-20  key ...93e1  requests 18,400  distinct IPs 312  top origin: (none)  top user agent: python-requests

# 3. The route the agent opened up, called without any cookie.
curl -s -X POST https://studio.codedev.test/api/outline -d '{"title":"anything"}'
# {"outline":["Why anything matters","anything step by step","Practice: anything"]}`, "terminal"),
        p("In the browser, open DevTools on the studio, select **Network** and click the button: the request goes to `api.ai-vendor.test`, and its `authorization` header shows the key in clear text. Under **Sources**, a search for `sk-` finds it in the page chunk. The vendor log closes the case: requests from `python-requests` with no browser origin, from hundreds of addresses, are not instructors clicking a button. Someone copied the key and is using it from scripts."),
        p("The `curl` line shows the second hole. Even without the leaked key, anyone can use CodeDev's account through the route, because the route calls the vendor for every caller. A key behind an unauthenticated route is only one step more private than a key in the bundle."),

        h2("3. Core idea: the client bundle is public"),
        p("Every byte of JavaScript that a browser runs was downloaded by that browser, and a user can read, pause and copy all of it. Files under `/_next/static` are static assets served to anyone who requests them; a login page in front of the studio does not hide the chunk. So the rule is simple: **a value that would cost you money or grant access if a stranger had it must never be read by client code.**"),
        h3("What NEXT_PUBLIC_ really means"),
        p("In Next.js, environment variables are available on the server. A variable whose name starts with `NEXT_PUBLIC_` is additionally **inlined** into the JavaScript built for the browser: at build time, each `process.env.NEXT_PUBLIC_X` that client code reads is replaced by the literal value. The prefix is a publication switch, not a convenience. Whether `.env.local` is git-ignored does not matter: git-ignore protects the repository, while the build copies the value into files that every visitor downloads. Vite (`VITE_`) and Create React App (`REACT_APP_`) follow the same idea with different prefixes."),
        h3("What does not fix it"),
        bullets([
            "**Minification or obfuscation.** Splitting the key into pieces or base64-encoding it slows nobody down: the browser has to reassemble it to send it, and the Network panel shows the result.",
            "**CORS or a referrer check at the vendor.** CORS is enforced by browsers on behalf of users; a script with `python-requests` ignores it. Referrer headers are set by the client and can be set to anything outside a browser.",
            "**\"Only instructors can open the studio.\"** The chunk is public, and an instructor's browser is still a place where the key can be copied.",
            "**Deleting the line and redeploying.** The value has been published. Treat it as leaked: revoke it, issue a new one, and check the usage log for calls you did not make.",
        ]),
        h3("When a key in the browser is fine"),
        p("Some vendors issue keys designed to be public: a Stripe publishable key, a maps key restricted to your domains and to read-only map tiles, a public dataset id for a CMS. They identify your account and are limited by the vendor to harmless operations, and the documentation says so explicitly. If the vendor's docs call the key secret, or if the key can spend money, read private data or call a model, it belongs on the server. When in doubt, ask: what can a stranger do with it, and who pays?"),
        h3("The fix: a server route that earns the key"),
        p("Move the call behind a route on your own server (a backend-for-frontend). The browser sends the title to `POST /api/outline`; the route calls the vendor with a key only the server can read. That alone is not enough, as the `curl` line showed: the route now spends money on behalf of whoever calls it, so it must do the vendor's job of deciding who may:"),
        numbered([
            "**Authenticate** the caller from the session cookie; anonymous requests get 401 and never reach the vendor.",
            "**Validate** the input (a title of reasonable length), so nobody can send a 50 KB prompt on your bill.",
            "**Limit each user**, for example 5 outlines per minute, and answer 429 above that. A per-user limit stops one account (or one stolen session) from draining the budget without blocking everyone else. The OWASP API Security Top 10 lists missing limits as API4: Unrestricted Resource Consumption.",
            "**Read the key from a server-only variable** (`AI_API_KEY`, no prefix), and set a spending limit for that key at the vendor as the last line of defence.",
        ]),
        callout("warning", "Rotate first, then fix",
            "As soon as you know a key is in a bundle, revoke it at the vendor and issue a new one, even before the fix is merged. A short outage of the outline button costs less than another day of strangers using your account. Put the new key only in the server's environment, under a name without the public prefix."),

        challenge("chal_quiz_acp_421"),

        h2("4. Worked example: the same fix for another feature"),
        p("The lesson page has a \"Translate summary\" button with the same history: a translation API called from the browser with `NEXT_PUBLIC_TRANSLATE_KEY`. Here is the server side of the fix. The `server-only` package makes the build fail if a client component ever imports this module, so the key cannot be pulled into the bundle by a later refactor:"),
        code("typescript", `
// app/api/translate/route.ts
import "server-only";
import { getSessionUser } from "@/lib/auth";

const LIMIT_PER_MINUTE = 20;
// shortcut: in-memory counters per server process; use Redis or the database when there is more than one instance.
const counters = new Map<string, number>();

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const { text } = await req.json().catch(() => ({}));
  if (typeof text !== "string" || text.trim() === "" || text.length > 2000) {
    return Response.json({ error: "invalid_text" }, { status: 400 });
  }

  const bucket = \`\${user.id}:\${Math.floor(Date.now() / 60_000)}\`;
  const used = counters.get(bucket) ?? 0;
  if (used >= LIMIT_PER_MINUTE) return Response.json({ error: "rate_limited" }, { status: 429 });
  counters.set(bucket, used + 1);

  const res = await fetch("https://translate.example/v2", {
    method: "POST",
    headers: { authorization: \`Bearer \${process.env.TRANSLATE_KEY}\` },   // no NEXT_PUBLIC_ prefix
    body: JSON.stringify({ text, target: "vi" }),
  });
  if (!res.ok) return Response.json({ error: "upstream_error" }, { status: 502 });
  return Response.json({ translation: (await res.json()).text });
}`, "route.ts - authenticate, validate, limit, then spend"),
        p("The client side becomes boring, which is the goal: `fetch(\"/api/translate\", { method: \"POST\", body: JSON.stringify({ text }) })`. A same-origin request carries the session cookie, and the browser never sees a vendor URL or a key. Notice the order of the checks: the cheap, caller-independent rejections come first, the counter is only incremented for requests that will really be sent, and the vendor is called last."),

        h2("5. The challenge: move the key behind the route"),
        p("The code runner has no browser and no Next.js, so the challenge file models the studio in one file with clearly marked sections:"),
        bullets([
            "**CLIENT** - everything inside the `client` object is \"bundled\": the test runner treats it as the code shipped to every browser. Like Next.js, the build inlines each `publicEnv.NEXT_PUBLIC_*` that client code reads.",
            "**SERVER** - the `server` object is the route; it may read `serverEnv`. `req.user` is the user of the session cookie, or null.",
            "**A fake network.** `browserFetch` sends the session cookie only to same-origin paths such as `/api/outline`; the fake AI vendor accepts only the server's key and counts who called it.",
            "**A bundle scanner** in the test runner prints what it finds in the client code after inlining, and every browser request that carries the key is marked in the output - the same evidence as `grep` on `.next/static` and the Network panel.",
        ]),
        p("Run the starter first and read its output: the key is in every browser request, and the scanner finds it in the bundle. Then fix both sections as the description specifies."),
        challenge("chal_coding_acp_422"),

        h2("6. How to verify"),
        bullets([
            "**Search the build output, not the source.** After `npm run build`, search `.next/static` (or `dist/` for Vite) for a distinctive prefix of the key. Searching the source misses values the build inlines from `.env` files. Search by prefix so the full key does not end up in your shell history.",
            "**Watch the Network panel.** Click the button: one request to `/api/outline`, none to the vendor, no `authorization` header with a vendor key.",
            "**Call the route like an attacker.** `curl` without a cookie must get 401; six quick calls with one session must end in 429; a 50 KB title must get 400. Put these in the route's tests so they keep holding.",
            "**Scan in CI.** Run a secret scanner such as gitleaks on the repository and on the build output, and turn on your Git host's secret scanning with push protection, so the next key is stopped before it is merged or deployed.",
            "**Check the vendor side.** After rotation, the old key shows zero requests and the new key's requests come only from your servers' addresses, at roughly the rate instructors click the button.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**Treating NEXT_PUBLIC_ as a way to make a variable \"work\" in a component.** It works by publishing the value. Spot it: any `NEXT_PUBLIC_` name containing KEY, SECRET or TOKEN is a review stop.",
            "**Fixing the bundle and keeping an open proxy.** A route without a session check or a limit lets anyone spend your budget. Spot it: `curl` the route without a cookie.",
            "**One global rate limit.** A single counter for all users lets one account lock everyone else out. Spot it: the limiter key does not contain the user id.",
            "**Forgetting the leaked key.** The new build is clean, the old key still works for whoever copied it. Spot it: the vendor dashboard still shows the old key as active.",
            "**Leaving the key in a client config object \"for later\".** Dead code in a client module is still bundled. Spot it: the build-output search, not a code read.",
        ]),

        h2("8. Summary"),
        numbered([
            "Everything client code reads ships to every browser; `NEXT_PUBLIC_` (and `VITE_`, `REACT_APP_`) means \"publish this value\". Obfuscation, CORS and login pages do not change that.",
            "Move paid or privileged calls behind a server route that authenticates the caller, validates the input, limits each user and reads a server-only key; rotate any key that has already shipped.",
            "Verify on the artifact: search the build output for the key, watch the Network panel, call the route without a session, and scan for secrets in CI.",
        ]),

        h2("Sources"),
        bullets([
            "Next.js documentation: Environment Variables, \"Bundling Environment Variables for the Browser\" - nextjs.org/docs",
            "Next.js documentation: Server and Client Components, keeping server-only code out of the client environment (the server-only package)",
            "OWASP API Security Top 10 (2023): API4 Unrestricted Resource Consumption - owasp.org/API-Security",
            "OWASP Secrets Management Cheat Sheet - cheatsheetseries.owasp.org",
        ]),
        callout("tip", "Self-practice (not graded): scan your own build",
            "Build a project of your own for production and search its static output for every value in your .env files (by prefix). For each hit, decide whether the vendor documents that key as public. For each secret one, write down the route that should hold it, who may call that route, and its per-user limit."),
    ],
});
