// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-whf-2-3",
    title: "Cookies, sessions & when to answer 401 or 403",
    slug: { _type: "slug", current: "cookies-sessions-when-to-answer-401-or-403" },
    description:
        "Login answers 200, yet the next request is 401; a learner who opens a teacher page loops between two URLs forever; and the API logs contain live session cookies. Learn how Set-Cookie and Cookie work, what HttpOnly, Secure, SameSite, Domain and Path really do, how a session cookie differs from a bearer token, and when to answer 401, 403 or 404 - and what never to log.",
    estimatedTime: 20,

    scenario: {
        role: "Junior full-stack developer, CodeDev learning platform",
        problem:
            "CodeDev used to serve the web app and the API from one origin. After the API moved to https://api.codedev.test, learners log in at https://app.codedev.test, see \"Welcome back\", and are sent back to the login page on the next click. A teammate added SameSite=None to the session cookie; nothing improved, and DevTools now shows a warning next to the cookie. On the same day, a learner who opened a teacher-only page got stuck in an endless redirect between /admin/courses and /login, and a security review found full session cookies in the API's request logs.",
    },

    content: [
        h2("1. The incident: logged in, and logged out one click later"),
        p("Until last week, the CodeDev web app called its API on the same origin, `https://codedev.test/api`. Then the API moved to its own origin, `https://api.codedev.test`, and three tickets arrived:"),
        bullets([
            "**\"I log in, it says Welcome back, I click a lesson and I'm on the login page again.\"** A teammate tried `SameSite=None` on the session cookie. Nothing improved, and DevTools now shows a warning next to the cookie.",
            "**\"I'm stuck in a loop.\"** A learner clicked an old bookmark to the teacher page `/admin/courses`. The page flickered between `/admin/courses` and `/login` and never stopped.",
            "**The security review** found lines like `cookie=\"session=s%3A9f2c...\"` in the API's request log - live session identifiers, readable by everyone with log access.",
        ]),
        p("Three tickets, one topic: how the browser stores and sends credentials, and what the server should answer when they are missing or not enough."),

        h2("2. Reproduce it: follow the cookie"),
        p("Open the web app with DevTools on the **Network** tab and log in. Select the login request and look at its response headers:"),
        code("text", `
POST https://api.codedev.test/auth/login                  200 OK

Response headers
set-cookie: session=s%3A9f2c...; Path=/; HttpOnly; SameSite=None`, "DevTools, Network > Headers"),
        p("Now open **Application > Cookies** (Chrome; **Storage** in Firefox): there is no `session` cookie for `api.codedev.test`. In the Network tab, the **Cookies** sub-tab of the login request shows the `Set-Cookie` line with a warning that the browser blocked it. Click a lesson: `GET /me` goes out **without** a `Cookie` header and comes back `401`."),
        p("The server set the cookie, and the browser refused to store it. Before the teammate's change, the cookie was not stored either, for a different reason. To see both, you need the rules the browser applies."),

        h2("3. How cookies work"),
        p("A cookie is a small name-value pair that a server asks the browser to store, and that the browser sends back on later requests:"),
        code("text", `
HTTP/1.1 200 OK                                    <- response from the server
Set-Cookie: session=s%3A9f2c...; Path=/; Secure; HttpOnly; SameSite=Lax

GET /me HTTP/1.1                                   <- every later matching request
Host: api.codedev.test
Cookie: session=s%3A9f2c...`, "Set-Cookie, then Cookie"),
        bullets([
            "`Set-Cookie` is a **response** header, one per cookie. Everything after the first `;` is an attribute that tells the browser how to store and when to send the cookie.",
            "`Cookie` is a **request** header. It carries only `name=value` pairs; the attributes are never sent back, so the server cannot see them later.",
            "Without `Expires` or `Max-Age`, the cookie is a **session cookie** in the browser's sense: it is deleted when the browser session ends. With them, it is a persistent cookie.",
            "A **server-side session** keeps the user's data on the server and puts only a long, random, unguessable identifier in the cookie. Logging out deletes the session on the server, so a stolen identifier stops working.",
        ]),

        h2("4. The attributes, one by one"),
        bullets([
            "`HttpOnly` - JavaScript cannot read the cookie through `document.cookie`. If an attacker manages to run script on your page (XSS), they cannot copy the session identifier out. It does not stop the XSS itself, and it does not stop requests made from the page.",
            "`Secure` - the cookie is only sent over HTTPS, never over plain HTTP.",
            "`SameSite` - decides whether the cookie is sent on requests that come from **another site**. `Strict`: never cross-site. `Lax`: cross-site only on top-level navigations with safe methods, such as clicking a link. `None`: on all requests, and **only valid together with `Secure`** - browsers reject a `SameSite=None` cookie without `Secure`.",
            "`Domain` - without it, the cookie is **host-only**: sent only to the exact host that set it. `Domain=codedev.test` widens it to every subdomain, including ones you do not control well. Leave it out unless you need it.",
            "`Path` - limits the cookie to URLs under a path. It is for organising cookies, not for security.",
            "`Max-Age` / `Expires` - how long the browser keeps the cookie.",
        ]),
        callout("info", "The default for SameSite",
            "Chrome and Edge treat a cookie without a SameSite attribute as Lax. Not every browser has adopted that default, so always write the attribute you mean. The cookie name prefix __Host- is a useful extra: the browser only accepts such a cookie if it is Secure, has Path=/ and has no Domain attribute."),
        h3("Site is not origin"),
        p("`SameSite` talks about **sites**, not origins. A site is the scheme plus the registrable domain: `https://app.codedev.test` and `https://api.codedev.test` are **different origins** (CORS applies, previous lesson) but the **same site** (`https` + `codedev.test`). Requests from the web app to the API are same-site, so a `SameSite=Lax` cookie is sent on them. `SameSite=None` was never needed."),
        image("auth-401-403-404", {
            alt: "Decision diagram for a CodeDev API request. On the left, the incident: the API answers 401 for every failure, so a logged-in learner without the teacher role is redirected to /login, which redirects back to /admin/courses, forever. On the right, the fix as three questions: no valid session means 401 Unauthorized with WWW-Authenticate, and the client goes to login; a valid session without permission means 403 Forbidden, and the client shows an access-denied page; a resource whose existence is private, such as another learner's submission, answers 404 Not Found. A bottom row lists what to log: request id, user id, route, status and reason, never cookies or tokens.",
            caption: "401 asks \"who are you?\". 403 says \"I know who you are, and the answer is no\". 404 can hide that there was anything to refuse.",
        }),

        h2("5. Cookies on a cross-origin fetch"),
        p("So why did login fail **before** `SameSite=None`? Because of `fetch`, not the cookie. The web app logged in like this:"),
        code("javascript", `
// app.codedev.test - before
await fetch("https://api.codedev.test/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
});`, "login.js"),
        p("The default `credentials` mode of `fetch` is `\"same-origin\"`. On a cross-origin request, the browser then neither sends cookies **nor stores** cookies from the response's `Set-Cookie`. The login answered 200 and the page said \"Welcome back\", but the session cookie was dropped on arrival. The fix has three parts, and each one is checkable:"),
        numbered([
            "Every call to the API uses `credentials: \"include\"` - login included.",
            "The API answers those calls with the exact origin and `Access-Control-Allow-Credentials: true` (the CORS rules from the previous lesson).",
            "The cookie goes back to `Path=/; Secure; HttpOnly; SameSite=Lax`, because the web app and the API are same-site.",
        ]),
        p("Verify it the same way you found it: after logging in, **Application > Cookies** lists `session` for `api.codedev.test`, and the next `GET /me` in the Network tab carries a `Cookie` header and returns 200."),

        h2("6. Session cookie or token in a header?"),
        p("Many APIs use a token sent by JavaScript in the `Authorization` header instead of a cookie. At a glance:"),
        bullets([
            "**Session cookie**: the browser attaches it automatically. With `HttpOnly`, page scripts cannot read it. Because it is automatic, cross-site requests are a risk (CSRF); `SameSite` and CSRF tokens are the defence.",
            "**Bearer token** (`Authorization: Bearer <token>`): your code attaches it to each request, so it is never sent by accident from another site. But your code must store it somewhere JavaScript can read, so a successful XSS can steal it. The `Authorization` header also makes cross-origin requests preflighted.",
            "Neither is \"more secure\" in general. Browser apps that talk to their own API usually do well with an `HttpOnly`, `Secure`, `SameSite=Lax` session cookie; tokens fit mobile apps and server-to-server calls.",
        ]),

        h2("7. 401, 403 or 404?"),
        p("Now the redirect loop. The API answered `401` to every problem, and the web app did what a 401 asks for: it sent the learner to log in. The login page saw a valid session and sent the learner back to `/admin/courses`, which answered 401 again. HTTP has separate answers for these cases (RFC 9110):"),
        bullets([
            "**401 Unauthorized** - the request has **no valid credentials**: no session cookie, an expired session, a bad token. The client should authenticate and retry. RFC 9110 requires a 401 response to include a `WWW-Authenticate` header with at least one challenge, for example `WWW-Authenticate: Bearer` for token APIs. Cookie sessions have no standard scheme, so teams document their own; clients rely on the status code.",
            "**403 Forbidden** - the server **knows who you are** and refuses: a learner calling a teacher-only endpoint. Logging in again with the same account will not change the answer, so the client should show an access-denied message, not a login form.",
            "**404 Not Found** - may be used instead of 403 when the **existence** of the resource is itself private. RFC 9110 allows an origin server to answer 404 to hide a forbidden resource. Learner 23 asking for learner 17's submission `/submissions/981` should not learn that submission 981 exists.",
        ]),
        code("javascript", `
// API: decide in this order
function authorize(req, { role, ownerId }) {
    if (!req.session) return { status: 401 };                       // who are you?
    if (ownerId !== undefined && ownerId !== req.session.userId
        && req.session.role !== "teacher") return { status: 404 };   // don't reveal it exists
    if (role && req.session.role !== role) return { status: 403 };   // known, not allowed
    return { status: 200 };
}

// Web app: react to each status differently
if (res.status === 401) redirectToLogin({ returnTo: location.pathname });
else if (res.status === 403) showAccessDenied();
else if (res.status === 404) showNotFound();`, "auth.js"),
        callout("tip", "How to verify the status codes",
            "Run the same request three times with curl -i: without a cookie (expect 401 and a WWW-Authenticate header), with a learner's test session on a teacher endpoint (expect 403), and with that session on another learner's submission (expect 404). Put the three cases in an API test so they stay that way."),
        challenge("chal_quiz_whf_231"),

        h2("8. What to log, and what never to log"),
        p("Authentication problems are hard to debug without logs, and dangerous to debug with the wrong ones. A session identifier in a log file is as good as a password for as long as the session lives, and log files are copied to more places, and kept longer, than anyone remembers."),
        bullets([
            "**Log**: a request id, the user id (after authentication), the method and route, the status, the duration, and a **reason** for each 401/403 - `session_expired`, `no_session`, `missing_role:teacher`.",
            "**Never log**: the `Cookie` and `Set-Cookie` headers, the `Authorization` header, tokens, session identifiers, passwords, password-reset and magic-link URLs, or full request bodies of login forms.",
            "If you must correlate a session, log a short, non-reversible fingerprint (for example the first characters of a hash of the identifier), never the identifier itself.",
            "**`HttpOnly` does not make a cookie safe to log.** It only hides the cookie from page scripts; anyone who reads the log can paste it into a request.",
        ]),
        code("javascript", `
const SECRET_HEADERS = new Set(["cookie", "set-cookie", "authorization", "proxy-authorization"]);

function safeHeaders(headers) {
    const out = {};
    for (const [name, value] of Object.entries(headers)) {
        out[name] = SECRET_HEADERS.has(name.toLowerCase()) ? "[REDACTED]" : value;
    }
    return out;
}

logger.info({ requestId, userId, route: "GET /admin/courses", status: 403,
              reason: "missing_role:teacher", headers: safeHeaders(req.headers) });`, "logging.js"),
        p("After removing the cookies from the logging code, the leaked identifiers are still valid. Invalidate the sessions that appeared in the logs (or all sessions, if you cannot tell), and delete or restrict the old log files."),

        h2("9. Pitfalls to recognise in code review"),
        bullets([
            "**\"Login returns 200, so login works.\"** Check that the cookie was stored (Application > Cookies) and that the next request carries it.",
            "**`SameSite=None` as a reflex for any cross-origin setup.** It requires `Secure`, and same-site subdomains do not need it at all.",
            "**`Domain=codedev.test` on the session cookie** \"to be safe\". It sends the session to every subdomain, including a forgotten marketing site.",
            "**401 for \"not allowed\".** It sends logged-in users to the login page, and with an automatic redirect back you get a loop.",
            "**Error messages that differ for \"no such user\" and \"wrong password\".** They let anyone test which emails have accounts; answer both the same way.",
        ]),

        h2("10. Checklist"),
        bullets([
            "The session cookie is `Secure`, `HttpOnly`, has an explicit `SameSite` (`Lax` unless you have a measured reason), and no `Domain` unless subdomains truly need it.",
            "Every cross-origin call that needs the session uses `credentials: \"include\"`, and the API's CORS headers allow exactly those origins with credentials.",
            "No session or wrong credentials -> 401 with `WWW-Authenticate`; known user without permission -> 403; private resources of others -> 404.",
            "The client handles 401 (log in), 403 (access denied) and 404 (not found) differently, and never redirects automatically after a 403.",
            "Logs carry request id, user id, route, status and reason; cookies, tokens and `Authorization` headers are redacted by default.",
            "You verified each case with DevTools (Set-Cookie warnings, Application > Cookies, the Cookie request header) and with `curl -i`.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 6265bis, \"Cookies: HTTP State Management Mechanism\" (the IETF update of RFC 6265) - datatracker.ietf.org",
            "RFC 9110, \"HTTP Semantics\", sections 15.5.2 (401), 15.5.4 (403) and 15.5.5 (404) - rfc-editor.org",
            "MDN Web Docs, \"Using HTTP cookies\" and \"Set-Cookie\" - developer.mozilla.org",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Log in to a site you use and open Application > Cookies. For each cookie, write down HttpOnly, Secure, SameSite, Domain and Path, and guess its purpose. Then sketch the status-code table for five CodeDev endpoints (/me, /me/progress, /admin/courses, /submissions/:id, /leaderboard): what a guest, a learner and a teacher each receive, and why."),
    ],
});
