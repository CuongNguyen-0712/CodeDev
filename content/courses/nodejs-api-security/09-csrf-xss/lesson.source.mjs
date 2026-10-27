// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nas-3-3",
    title: "CSRF & XSS: what cookies and tokens do and don't protect",
    slug: { _type: "slug", current: "csrf-xss-what-cookies-and-tokens-protect" },
    description:
        "A penetration test of the CodeDev web app found two ways to change a learner's email: a form on another site that the browser sent with the session cookie, and a script hidden in a lesson comment. The team's first answer was \"our cookies are HttpOnly\". Learn what SameSite does and does not stop, how CSRF tokens, double-submit cookies and Origin checks protect cookie-authenticated POSTs, why HttpOnly does not stop XSS from acting as the user, the real trade-offs of a token in localStorage versus a cookie, and the Content-Security-Policy basics that limit an injected script.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer on the sign-in team, CodeDev learning platform",
        problem:
            "The external penetration test report for https://app.codedev.test lists two high findings. F-1: a page on another site changes a signed-in learner's email through POST /settings/email. F-2: a lesson comment containing HTML runs a script that does the same. With the email changed, the tester used \"Forgot password\" and took over the account. In the triage thread, F-2 was first marked \"low: our session cookie is HttpOnly, a script cannot steal it\". You own the fix for both.",
    },

    content: [
        h2("1. The incident: two findings, one email change"),
        p("The settings pages of the web app are server-rendered and authenticated by the `sid` session cookie (lesson 1.1). Changing the email is one POST. Here is how the cookie was set when the test ran, and why:"),
        code("text", `
Set-Cookie: sid=9f2c...; Path=/; HttpOnly; Secure; SameSite=None

# changed from SameSite=Lax in September (PR #1290 "keep learners signed in inside
# the code editor embedded on partner sites")`, "app.codedev.test response header"),
        p("Both findings ended in the same request. F-1 sent it from another site; F-2 sent it from CodeDev's own page. They need different defences, and the fix for one does nothing for the other. That is the point of this lesson: know exactly which attack each header and each token stops."),

        h2("2. Read the evidence"),
        p("The tester attached the two requests as the server logged them. Compare the headers that the browser adds by itself, which a script cannot forge:"),
        code("text", `
# F-1: auto-submitting form on https://free-certs.example
POST /settings/email HTTP/1.1
Host: app.codedev.test
Origin: https://free-certs.example
Sec-Fetch-Site: cross-site
Sec-Fetch-Mode: navigate
Content-Type: application/x-www-form-urlencoded
Cookie: sid=9f2c...

email=owner%40free-certs.example                       -> 302 Found, email changed

# F-2: fetch() from a script in a lesson comment on https://app.codedev.test
POST /settings/email HTTP/1.1
Host: app.codedev.test
Origin: https://app.codedev.test
Sec-Fetch-Site: same-origin
Sec-Fetch-Mode: cors
Content-Type: application/json
Cookie: sid=9f2c...

{"email":"owner@free-certs.example"}                   -> 200 OK, email changed`, "api access log with request headers, staging"),
        bullets([
            "**F-1 is cross-site request forgery (CSRF).** The learner's browser sent the cookie because the request went **to** app.codedev.test. Who started the request did not matter. `Origin` and `Sec-Fetch-Site` say clearly that another site started it, and the server never looked.",
            "**F-2 is cross-site scripting (XSS).** The request is indistinguishable from the app's own: same origin, same cookie. The comment's HTML was inserted with `innerHTML`, so its `onerror` attribute ran as code inside CodeDev's page.",
        ]),

        h2("3. CSRF: cookies follow the destination"),
        p("A browser attaches cookies to a request based on where the request goes, not on which page sent it. Any site can make the learner's browser send a form POST or load an image from app.codedev.test. If the server treats \"the cookie is present\" as \"the learner meant to do this\", any site can act as the learner. CSRF only concerns credentials that the browser adds by itself: cookies and HTTP authentication. An API that only accepts `Authorization: Bearer ...` set by JavaScript is not exposed to CSRF, because another site cannot make the browser add that header."),
        h3("What SameSite does"),
        bullets([
            "**`SameSite=Strict`**: the cookie is sent only when the request comes from the same site. Even following a link from an email to app.codedev.test arrives without it, so the first page looks signed out.",
            "**`SameSite=Lax`**: also sent on top-level navigations with a safe method, such as clicking a link (GET). Not sent on cross-site POSTs, iframes, images or fetch. A good default for a session cookie.",
            "**`SameSite=None`** (requires `Secure`): sent on every cross-site request. Needed for a cookie that must work inside a cross-site iframe, as in PR #1290, and it brings CSRF back in full.",
        ]),
        h3("What SameSite does not do"),
        bullets([
            "**It does not know about subdomains.** A \"site\" is the scheme plus the registrable domain, so `https://blog.codedev.test` and `https://app.codedev.test` are the **same site**. A page on any subdomain that serves user content, or that an attacker takes over, can send same-site requests with every `Lax` and `Strict` cookie.",
            "**It does not protect GET.** `Lax` sends the cookie on a top-level GET navigation. A GET that changes state (`/settings/email/confirm?email=...`) is open to any link.",
            "**It is not universal.** Older browsers and some embedded webviews ignore it, and Chrome sends cookies **without** a SameSite attribute on cross-site POSTs for two minutes after they are set. An explicit attribute avoids that exception, and a server-side check does not depend on the browser at all.",
        ]),
        h3("Defences on the server for cookie-authenticated POSTs"),
        p("Use SameSite as the first layer, and add at least one check that the server controls, on every state-changing method (POST, PUT, PATCH, DELETE):"),
        numbered([
            "**Check `Origin`** (and `Sec-Fetch-Site`). Browsers send `Origin` on cross-origin requests and on same-origin POSTs; a page cannot change it. Compare it with an exact allowlist, such as `https://app.codedev.test`, and reject anything else. If `Origin` is missing, accept only `Sec-Fetch-Site: same-origin`, and reject the request otherwise.",
            "**A CSRF token.** A synchronizer token is a random value stored with the session and included in every form or request header; the server compares them. A stateless variant signs the token with a server key and binds it to the session id, so a value planted by another subdomain cannot match. A plain \"double-submit\" cookie that only compares a cookie with a header, without that binding, can be defeated by an attacker who can set cookies for codedev.test.",
            "**A custom header on JSON APIs.** A cross-site `fetch` that adds `X-CSRF-Token` or sends `Content-Type: application/json` needs a CORS preflight, and the server does not approve it. HTML forms cannot add headers at all.",
        ]),

        h2("4. XSS: HttpOnly hides the cookie, not the user"),
        p("Once an attacker's script runs inside https://app.codedev.test, it is part of the app. The browser cannot tell its requests apart from the app's, because they are the app's requests. The triage comment on F-2 was right about one thing and wrong about what follows from it:"),
        bullets([
            "**HttpOnly stops `document.cookie` from returning the cookie.** The script cannot copy `sid` and use it later from the attacker's own machine.",
            "**HttpOnly does not stop the browser from attaching the cookie** to the script's same-origin `fetch`. SameSite does not apply either, because the request is same-site.",
            "**The script can read everything the page can read**: the CSRF token in a meta tag or a form, the access token held in the app's memory (by calling the app's own API client), anything in `localStorage`, and what the learner types.",
        ]),
        p("So HttpOnly limits XSS in time, not in capability: the attacker acts while the page is open instead of whenever they like. Changing the email takes one request, so for F-2 that was enough. CSRF defences do not help against XSS at all; they exist to tell your page apart from **other** sites, and an injected script is your page."),
        h3("Token in localStorage or in a cookie?"),
        p("Teams often move tokens to `localStorage` \"because cookies have CSRF\", or into cookies \"because of XSS\". Look at what each choice actually changes:"),
        bullets([
            "**`localStorage`**: no CSRF, because nothing is sent automatically. Any script on the origin can read the token and send it to the attacker, who can then use it from anywhere until it expires. For a refresh token that means weeks.",
            "**JavaScript memory only**: no CSRF, and gone on reload, so an injected script must use it while the page is open. It still cannot survive a reload without something else, usually a refresh cookie.",
            "**HttpOnly cookie**: scripts cannot read it, so an XSS cannot take it away for later. The browser sends it automatically, so it needs SameSite plus a server-side CSRF check.",
            "**The split used in this course**: the refresh token in an `HttpOnly; Secure; SameSite=Strict; Path=/auth` cookie (lesson 1.2), the 15-minute access token in memory. The other common option is a backend-for-frontend (BFF) that keeps all tokens on the server and gives the browser only a session cookie.",
        ]),
        p("None of these stop XSS. They decide how much an attacker keeps after the page closes. Preventing XSS is a separate job: escape output, avoid `innerHTML` with untrusted data, and add a Content-Security-Policy."),

        h2("5. Content-Security-Policy basics"),
        p("A Content-Security-Policy (CSP) header tells the browser which scripts it may run on a page. A strict policy turns most injected HTML into harmless markup, because the injected code has no allowed source:"),
        code("text", `
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-r4nd0mPerResponse';
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'self' https://partner.example;
  connect-src 'self' https://api.codedev.test`, "app.codedev.test response header (one line in practice)"),
        bullets([
            "**`script-src`** without `'unsafe-inline'` blocks inline `<script>` blocks, `onerror=`-style handlers and `javascript:` URLs. Inline scripts that the app itself needs carry a nonce that is new for every response.",
            "**`object-src 'none'` and `base-uri 'none'`** close two classic bypasses: plugins and a `<base>` tag that redirects relative script URLs.",
            "**`connect-src`** limits where `fetch` can send data, which makes exfiltration harder; it does not stop requests to your own API.",
            "**`frame-ancestors`** controls which sites may show the page in a frame, so the code editor embed can list its partners instead of being embeddable everywhere.",
            "**Roll out with `Content-Security-Policy-Report-Only`** first, read the violation reports for a week, then enforce. A policy that breaks the app gets removed; one that is only reported teaches you what the app loads.",
        ]),
        p("CSP is a second line of defence. It is no excuse to keep rendering comments with `innerHTML`. Fix the injection at the source: render untrusted text with `textContent`, or sanitise the HTML of rendered markdown with a maintained sanitizer such as DOMPurify."),

        challenge("chal_quiz_nas_331"),

        h2("6. Worked example: an Origin check and a signed CSRF token in NestJS"),
        p("The guard below protects every state-changing route of the cookie-authenticated settings pages. It checks the origin first (cheap, and enough on its own for modern browsers) and then a CSRF token signed with a server key and bound to the session id, which also holds when a request comes from a same-site subdomain:"),
        code("typescript", `
// security/csrf.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALLOWED_ORIGINS = new Set(["https://app.codedev.test"]);

export function csrfTokenFor(sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(\`csrf:\${sessionId}\`).digest("base64url");
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = req.get("origin");
    const sameOrigin = origin ? ALLOWED_ORIGINS.has(origin) : req.get("sec-fetch-site") === "same-origin";
    if (!sameOrigin) throw new ForbiddenException("csrf_origin");

    const sent = Buffer.from(req.get("x-csrf-token") ?? "");
    const expected = Buffer.from(csrfTokenFor(req.cookies?.sid ?? "", this.config.getOrThrow("CSRF_SECRET")));
    if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) throw new ForbiddenException("csrf_token");
    return true;
  }
}`, "csrf.guard.ts"),
        p("The page gets the token when it is rendered (for example in `<meta name=\"csrf\">`) and the app's API client sends it as `X-CSRF-Token`. Note what this guard does **not** do: an injected script on app.codedev.test passes both checks. For F-2, the fix is in the comment renderer and the CSP; for F-1, it is this guard plus moving `sid` back to `SameSite=Lax` and giving the partner embed its own narrowly scoped cookie."),

        h2("7. How to verify"),
        bullets([
            "**curl against staging**, one request per rule. The cross-site and missing-token requests must be refused, and the app's own request must still work:",
        ]),
        code("bash", `
# another site: refused by the Origin check
curl -i -X POST https://app.codedev.test/settings/email \\
  -H "Cookie: sid=$SID" -H "Origin: https://free-certs.example" \\
  -H "Content-Type: application/json" -d '{"email":"x@free-certs.example"}'
HTTP/1.1 403 Forbidden            {"message":"csrf_origin"}

# right origin, no token: refused by the token check
curl -i -X POST https://app.codedev.test/settings/email \\
  -H "Cookie: sid=$SID" -H "Origin: https://app.codedev.test" \\
  -H "Content-Type: application/json" -d '{"email":"x@free-certs.example"}'
HTTP/1.1 403 Forbidden            {"message":"csrf_token"}`, "terminal"),
        bullets([
            "**The tester's page in a real browser.** Open the F-1 page while signed in on staging. In DevTools > Network, select the POST: with `SameSite=Lax` the Cookies tab shows `sid` filtered out with a SameSite reason; with the guard the response is 403 either way.",
            "**The F-2 payload as a comment on staging.** It must show up as text. Then remove the sanitizer locally on purpose: with the CSP enforced, the Console shows \"Refused to execute inline event handler\" and the Network tab shows no POST.",
            "**Headers on every response.** `curl -sI https://app.codedev.test/settings | grep -i -E 'set-cookie|content-security-policy'` in CI catches a later PR that weakens the cookie or drops the policy.",
        ]),

        h2("8. Common mistakes"),
        bullets([
            "**Treating SameSite as the CSRF fix.** It does not cover subdomains, GET or old clients, and a later change to `None` removes it silently, as PR #1290 did. Spot it: a state-changing route with no Origin or token check.",
            "**State changes on GET.** `Lax` sends cookies on cross-site GET navigations. Spot it: a GET route that writes to the database or sends an email.",
            "**Origin checks with `startsWith` or `includes`.** `https://app.codedev.test.free-certs.example` starts with the right text. Spot it: any comparison that is not exact equality against an allowlist.",
            "**\"HttpOnly, so XSS is low risk.\"** The script acts as the learner through the cookie it cannot read. Spot it: a triage note that rates XSS by whether tokens can be stolen instead of by what one same-origin request can do.",
            "**A CSP with `'unsafe-inline'`** in `script-src`. It allows exactly the inline handlers that injected HTML uses. Spot it: read the header; if inline scripts are needed, use nonces.",
        ]),

        h2("9. Summary"),
        numbered([
            "CSRF works because browsers attach cookies by destination. SameSite=Lax or Strict is a good first layer; protect every cookie-authenticated state change with an exact Origin check and a CSRF token bound to the session.",
            "XSS runs as your page. HttpOnly stops a script from copying a cookie, not from using it, and CSRF defences do not apply; fix injections at the source and limit scripts with a CSP.",
            "localStorage, memory and cookies trade CSRF exposure against how long a stolen token stays useful; none of them prevents XSS.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 6265, HTTP State Management Mechanism - datatracker.ietf.org/doc/html/rfc6265, and the SameSite attribute in its successor draft (RFC 6265bis)",
            "OWASP Cross-Site Request Forgery Prevention Cheat Sheet and Cross Site Scripting Prevention Cheat Sheet - cheatsheetseries.owasp.org",
            "MDN Web Docs: Content-Security-Policy, Sec-Fetch-Site and Set-Cookie SameSite",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "List every route of the CodeDev web app that changes state, and for each one write how it is authenticated (cookie or Authorization header), whether it is reachable with GET, and which CSRF check protects it. Then write a Content-Security-Policy-Report-Only header for the lesson page, deploy it to staging, and read the violation reports: every script the page loads should be explained by a line of your policy."),
    ],
});
