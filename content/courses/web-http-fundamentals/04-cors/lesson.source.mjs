// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-whf-2-1",
    title: "Why the browser blocks a response: CORS explained",
    slug: { _type: "slug", current: "why-the-browser-blocks-a-response-cors-explained" },
    description:
        "The API answers 200 to curl, yet the CodeDev web app and admin app both show \"blocked by CORS policy\". Learn what an origin is, what the same-origin policy protects, how simple and preflighted requests work, why cookies change the rules, why CORS is not server security, and how a \"CORS error\" can hide a 401 or a 500 - then fix an AI-generated CORS helper.",
    estimatedTime: 20,

    scenario: {
        role: "Junior full-stack developer, CodeDev learning platform",
        problem:
            "The admin app moved to https://admin.codedev.test and both it and the learner web app https://app.codedev.test call https://api.codedev.test with the session cookie. A teammate asked an AI assistant to \"allow our web app and the admin app to call the API with cookies\" and shipped the helper it wrote. Since the deploy, every logged-in screen in both apps fails with \"blocked by CORS policy\" in the console, while the backend developer insists the API is fine: curl -i returns 200 OK with the JSON.",
    },

    content: [
        h2("1. The incident: \"it works with curl\""),
        p("CodeDev has three front doors. Learners use the web app at `https://app.codedev.test`, teachers use the admin app at `https://admin.codedev.test`, and both talk to the API at `https://api.codedev.test`. The session lives in a cookie, so every request is sent with `credentials: \"include\"`."),
        p("When the admin app moved to its own subdomain, a teammate asked an AI assistant for help. This is the prompt, and the helper it produced:"),
        code("text", `
Prompt: "Our API is https://api.codedev.test. Allow our web app
(https://app.codedev.test) and the admin app (https://admin.codedev.test)
to call the API with cookies. Write the CORS headers function."`),
        code("javascript", `
// cors.js - generated, reviewed by nobody, merged on Friday
function corsHeaders(requestOrigin, allowlist) {
    if (!requestOrigin) {
        return {}; // same-origin request or a non-browser client: nothing to add
    }
    // Both apps need cookies, so allow credentials. "*" covers every app we have.
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": "true",
    };
}`, "cors.js"),
        p("On Monday, every logged-in screen is empty. The console of the admin app shows this (Chrome wording):"),
        code("text", `
Access to fetch at 'https://api.codedev.test/admin/courses' from origin
'https://admin.codedev.test' has been blocked by CORS policy: The value of the
'Access-Control-Allow-Origin' header in the response must not be the wildcard '*'
when the request's credentials mode is 'include'.

Uncaught (in promise) TypeError: Failed to fetch`, "DevTools console"),
        p("The backend developer copies the URL into a terminal and gets a perfectly good answer. Both observations are true at the same time, and by the end of this lesson you will know exactly why."),

        h2("2. Reproduce it: the server answered, the browser refused"),
        p("Open the admin app, open DevTools, and select the **Network** tab. Reload. The request to `/admin/courses` is red and its Status column says `CORS error`. Now right-click it, choose **Copy > Copy as cURL**, and run it with `-i` so curl prints the status line and the headers:"),
        code("bash", `
curl -i 'https://api.codedev.test/admin/courses' \\
  -H 'Origin: https://admin.codedev.test' \\
  -H 'Cookie: session=<your test session>'

HTTP/2 200
content-type: application/json
access-control-allow-origin: *
access-control-allow-credentials: true

[{"id":42,"title":"Web Application Fundamentals"}]`, "terminal"),
        p("The request reached the API, the API checked the cookie, ran the query and sent 200 with the data. Then the **browser** looked at the response headers, decided the page at `https://admin.codedev.test` is not allowed to read this response, and handed JavaScript a network error instead. curl has no such rule, so curl shows everything."),
        callout("info", "Two questions, two tools",
            "\"Did the server answer, and with what?\" - ask curl -i or the Network tab. \"Is this page allowed to read the answer?\" - only the browser decides that, and it explains its decision in the console. A CORS problem is always a mismatch between those two answers."),

        h2("3. Origins and the same-origin policy"),
        p("An **origin** is the triple **scheme + host + port** of a URL. Two URLs have the same origin only if all three are identical. The port is often implicit: 443 for `https`, 80 for `http`. Compared with `https://app.codedev.test`:"),
        bullets([
            "`https://app.codedev.test/lessons/7` - **same origin** (the path does not count).",
            "`https://app.codedev.test:443` - **same origin** (443 is the default port for https).",
            "`http://app.codedev.test` - different origin (scheme).",
            "`https://api.codedev.test` - different origin (host). Subdomains of the same company are still different origins.",
            "`https://app.codedev.test:8443` - different origin (port).",
        ]),
        p("The **same-origin policy** is the browser rule that keeps one origin's page from reading another origin's data. A page may still *send* many cross-origin requests - a form post, an `<img>`, a `<script>` - but JavaScript may not *read* a cross-origin response from `fetch` or `XMLHttpRequest` unless the other server says so. Without that rule, any website you visit could call your bank or your CodeDev account with your cookies and read the answer."),
        p("**CORS** (Cross-Origin Resource Sharing) is how a server says so. The browser adds an `Origin` request header naming the page's origin; the server answers with `Access-Control-Allow-*` headers; the browser compares them and either hands the response to JavaScript or blocks it. CORS never makes a server *more* protected - it is an opt-in that relaxes the same-origin policy for the origins you choose."),
        callout("tip", "When you do not need CORS at all",
            "If the web app and the API are served from one origin - for example a reverse proxy that maps https://app.codedev.test/api/ to the API service - every call is same-origin and there is nothing to configure. That is often the simplest design. Reach for CORS when separate origins are a real requirement, such as a separate admin app or a public API."),

        h2("4. Simple requests and preflighted requests"),
        p("For some requests, the browser sends the request straight away and only checks the response. These are called **simple requests** in most documentation (the Fetch standard does not use that name). A request stays simple only if all of these hold:"),
        bullets([
            "The method is `GET`, `HEAD` or `POST`.",
            "The only headers set by your code are CORS-safelisted ones such as `Accept`, `Accept-Language`, `Content-Language` and `Content-Type`.",
            "`Content-Type`, if set, is `application/x-www-form-urlencoded`, `multipart/form-data` or `text/plain`.",
        ]),
        p("Anything else - `PUT`, `PATCH`, `DELETE`, an `Authorization` header, or the everyday `Content-Type: application/json` - makes the browser ask permission first with a **preflight**: an `OPTIONS` request that describes the real request without sending it."),
        code("javascript", `
// https://app.codedev.test saves lesson progress
await fetch("https://api.codedev.test/progress/lesson-whf-2-1", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: true }),
});`, "progress.js"),
        code("text", `
OPTIONS /progress/lesson-whf-2-1 HTTP/1.1
Host: api.codedev.test
Origin: https://app.codedev.test
Access-Control-Request-Method: PUT
Access-Control-Request-Headers: content-type

HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://app.codedev.test
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, PUT, DELETE
Access-Control-Allow-Headers: content-type
Access-Control-Max-Age: 600
Vary: Origin`, "preflight, then the real PUT"),
        bullets([
            "`Access-Control-Request-Method` and `Access-Control-Request-Headers` are the question: \"may I send a PUT with a content-type header?\"",
            "`Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` are the answer. If the method or a header is missing from it, the real request is never sent.",
            "`Access-Control-Max-Age` lets the browser reuse the answer for that many seconds instead of preflighting every call. Browsers apply their own upper limit.",
            "The preflight must succeed with an OK status (2xx). A redirect, a 401 or a 404 on `OPTIONS` fails the whole call.",
            "**The preflight is sent without cookies.** An authentication middleware that rejects `OPTIONS` requests without a session breaks every preflighted call. Let `OPTIONS` through before authentication.",
        ]),
        p("In the Network tab, Chrome lists the preflight as a separate row (type `preflight`) next to the real request. Seeing only the `OPTIONS` row, and never the `PUT`, means the preflight answer said no."),

        h2("5. Cookies change the rules"),
        p("`fetch` does not send cookies to another origin unless you ask: the default `credentials` mode is `\"same-origin\"`. With `credentials: \"include\"`, the browser attaches cookies to the cross-origin request *and* applies a stricter check to the response:"),
        numbered([
            "`Access-Control-Allow-Origin` must be **exactly** the page's origin. The wildcard `*` is rejected.",
            "`Access-Control-Allow-Credentials` must be exactly `true`.",
            "In `Access-Control-Allow-Headers`, `Allow-Methods` and `Expose-Headers`, `*` loses its wildcard meaning and is treated as a literal name.",
        ]),
        p("This is the AI helper's mistake. `*` plus credentials is not \"allow everything with cookies\": the combination is invalid, so browsers block every credentialed call. The rule exists for a good reason. If `*` worked with cookies, any website a learner visited could read that learner's progress, submissions and email from the API."),
        image("cors-credentials-check", {
            alt: "Diagram comparing two API responses to a credentialed fetch from https://admin.codedev.test. On the left, the AI helper answers Access-Control-Allow-Origin: * with Access-Control-Allow-Credentials: true; the browser's check fails and JavaScript receives TypeError: Failed to fetch. On the right, the API compares the Origin header with an exact allowlist, echoes https://admin.codedev.test, adds Allow-Credentials: true and Vary: Origin, and the page can read the JSON. A bottom row lists the three rules: exact allowlist, exact origin with credentials, Vary: Origin.",
            caption: "The API answers either way. The response headers decide whether the browser lets the page read the answer.",
        }),
        callout("warning", "The \"fix\" that makes it worse",
            "The next suggestion in many threads is to reflect whatever arrives: Access-Control-Allow-Origin set to the request's Origin, with credentials. Browsers stop complaining - and now every website on the internet can read logged-in users' data. Echo an origin only after it matches your allowlist exactly."),

        h2("6. CORS is the browser's rule, not your API's security"),
        p("Everything above happens inside the browser. curl, Postman, a mobile app, a server-side script and an attacker's terminal all ignore CORS headers completely. Three consequences matter every day:"),
        bullets([
            "**CORS does not protect your data from non-browser clients.** Every endpoint still needs authentication and authorization on the server. A missing `Access-Control-Allow-Origin` header hides nothing from curl.",
            "**A blocked response was still processed.** For a simple `POST`, the server runs the handler and only the *reading* of the response is blocked. Protection against cross-site requests that change data comes from `SameSite` cookies and CSRF tokens (next lesson), not from CORS.",
            "**`mode: \"no-cors\"` is not a fix.** It returns an opaque response: status 0, no headers, no body your code can read. It exists for fire-and-forget requests, not for reading an API.",
        ]),
        p("Check your understanding of the incident before going on:"),
        challenge("chal_quiz_whf_211"),

        h2("7. A \"CORS error\" that is really a 401 or a 500"),
        p("A week later, a learner reports that the progress page shows a CORS error every morning. The CORS helper is fine by now. The real story is in the order of the middlewares:"),
        code("javascript", `
app.use(requireSession);   // expired session -> 401, sent right here
app.use(cors);             // never reached for the 401, so no CORS headers
app.use(routes);`, "server.js (before)"),
        p("The session expires overnight, the API answers `401 Unauthorized`, but that response has no `Access-Control-Allow-Origin` header. The browser cannot let the page read a response without it, so the page receives `TypeError: Failed to fetch` and the console says `No 'Access-Control-Allow-Origin' header is present on the requested resource`. The real status - 401, or a 500 from a crash, or a 502 page from a gateway - is invisible to your JavaScript."),
        p("How to verify, instead of guessing:"),
        numbered([
            "In the Network tab, find the failed request and use **Copy as cURL**. Run it with `-i`, keeping the `Origin` header.",
            "Read the status line first. A `401`, `403` or `5xx` there means the CORS message is a symptom, not the cause.",
            "Check whether that error response carries `Access-Control-Allow-Origin`. If successful responses have it and error responses do not, the CORS headers are added too late.",
        ]),
        code("javascript", `
app.use(cors);             // first: every response, including 401 and 500, gets the headers
app.use(requireSession);   // OPTIONS passes through; others may answer 401
app.use(routes);
app.use(errorHandler);     // runs after cors, so crash responses keep the headers`, "server.js (after)"),
        p("Now the page receives the 401, and the client can do the right thing: send the learner to the login page instead of showing a confusing network error."),

        h2("8. The fix: an exact allowlist"),
        p("Back to the AI helper. A correct CORS decision for a credentialed API follows four rules:"),
        bullets([
            "**Compare whole strings against an allowlist.** `https://app.codedev.test.evil.example` starts with `https://app.codedev.test`, and `https://evilcodedev.test` ends with `codedev.test`. Prefix, suffix, substring and unanchored regex checks all let them in.",
            "**Echo the request's origin, not `*`, when it matches**, together with `Access-Control-Allow-Credentials: true`.",
            "**Send no `Access-Control-Allow-*` headers for any other origin**, including the special origin `null` sent by sandboxed frames and local files. No header means the browser blocks the read, which is exactly what you want.",
            "**Always add `Vary: Origin`.** The response now depends on the `Origin` header. Without `Vary`, a shared cache or CDN could store the response made for the admin app and serve it, headers included, to the web app - or store a header-less response and serve it to an allowed origin. The Fetch standard recommends `Vary: Origin` on every response of such a resource, CORS or not.",
        ]),
        p("Preflight responses add `Allow-Methods`, `Allow-Headers` and `Max-Age` on top of the same decision, so the decision itself belongs in one small, well-tested function. Find the AI's mistake and fix it:"),
        challenge("chal_coding_whf_212"),

        h2("9. Pitfalls to recognise in code review"),
        bullets([
            "**\"It works in curl\" proves the server answers, nothing more.** Reproduce with the browser's `Origin` header and read the response headers.",
            "**Allowing `http://localhost:3000` in production config.** Development origins belong in the development allowlist only; anyone can run a page on their own localhost.",
            "**Origin checks with `includes`, `startsWith`, `endsWith` or a regex without `^...$`.** Write a test with a look-alike origin such as `https://app.codedev.test.evil.example`.",
            "**Authentication before CORS.** Preflights carry no cookies, and error responses lose their headers. Put the CORS step first.",
            "**Turning CORS off in the browser** (flags, extensions) to \"test\". It hides the bug on your machine and on no one else's.",
        ]),

        h2("10. Checklist"),
        bullets([
            "You can say which origins call the API, and they are listed exactly (scheme, host, port) per environment.",
            "Credentialed responses echo an allowlisted origin and send `Access-Control-Allow-Credentials: true`; they never send `*`.",
            "Unknown origins, including `null`, get no `Access-Control-Allow-*` headers.",
            "Every response whose CORS headers depend on `Origin` carries `Vary: Origin`.",
            "`OPTIONS` preflights succeed without a session and list the methods and headers the apps really use.",
            "401, 403 and 5xx responses carry the same CORS headers as successful ones.",
            "Authentication and authorization are enforced on the server for every request; CORS is never treated as access control.",
        ]),

        h2("Sources"),
        bullets([
            "WHATWG Fetch Standard, section \"CORS protocol\" - fetch.spec.whatwg.org",
            "MDN Web Docs, \"Cross-Origin Resource Sharing (CORS)\" - developer.mozilla.org",
            "RFC 6454, \"The Web Origin Concept\" - rfc-editor.org",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Open any web app you use that calls an API on another subdomain. In the Network tab, find an OPTIONS preflight, read its Access-Control-Request-* headers and the Access-Control-Allow-* answer, and check whether the API sends Vary: Origin. Then copy one request as cURL, change the Origin header to https://example.com, and see what the server sends back."),
    ],
});
