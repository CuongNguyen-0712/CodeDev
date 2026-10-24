// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-whf-1-3",
    title: "How to read a request in DevTools: headers, bodies & JSON",
    slug: { _type: "slug", current: "read-a-request-in-devtools" },
    description:
        "During a deploy, learners who submit a solution are told \"You are offline\" while their Wi-Fi works fine, and the error tracker fills with \"Unexpected token '<'\". Learn to read a request in the DevTools Network panel - filters, Preserve log, request and response headers, Payload, Preview vs Response, Copy as cURL - and to tell a network failure from an HTTP error before you parse any JSON.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer, CodeDev lesson player team",
        problem:
            "On Thursday evening the API was redeployed. For about ten minutes, learners who pressed Submit in the lesson player at https://app.codedev.test saw a red banner: \"You are offline. Check your connection.\" Several reloaded the page and lost the code they had not saved. The error tracker recorded the same message hundreds of times: SyntaxError: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON. None of those learners was offline.",
    },

    content: [
        h2("1. The incident: \"offline\" learners who were online"),
        p("This is the submit function in the lesson player. It is short, it works every time the API is healthy, and it turns every kind of failure into the same message:"),
        code("javascript", `
// submit.js (before)
async function submitSolution(lessonId, code) {
    try {
        const res = await fetch(\`https://api.codedev.test/v1/lessons/\${lessonId}/submissions\`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            credentials: "include",
            body: JSON.stringify({ code }),
        });
        const result = await res.json();
        showResult(result);
    } catch (err) {
        showBanner("You are offline. Check your connection.");
    }
}`, "submit.js"),
        p("The author assumed that the `catch` block only runs when the network is down. The error tracker says something else: the failure is a `SyntaxError` - a JSON parser that met a `<` where it expected `{`. Something answered with HTML. To find out what, you need the request itself, and the place to read it is the **Network** panel of DevTools."),

        h2("2. Reproduce it in the Network panel"),
        p("Open DevTools (F12, or Ctrl+Shift+I / Cmd+Option+I) and the **Network** panel before you click Submit. Then set it up so the request you care about is easy to find and does not disappear:"),
        numbered([
            "Click the **Fetch/XHR** filter. It hides scripts, images and fonts, and keeps the calls your JavaScript makes with `fetch()` or `XMLHttpRequest`.",
            "Tick **Preserve log**. Without it the list is cleared on every page load, so a request made just before a reload or a redirect to a login page vanishes before you can read it.",
            "Use the filter box to narrow further: `submissions` matches the URL, `method:POST` keeps only POST requests, `status-code:502` keeps only that status.",
            "Click Submit, then click the request's name to open its details.",
        ]),
        p("The Status column already says what the error tracker could not: `502`. The details tell the rest of the story:"),
        code("text", `
General
  Request URL:     https://api.codedev.test/v1/lessons/12/submissions
  Request Method:  POST
  Status Code:     502 Bad Gateway
  Remote Address:  203.0.113.10:443

Response Headers
  content-type:    text/html
  server:          codedev-edge

Response
  <!DOCTYPE html>
  <html><head><title>502 Bad Gateway</title></head>
  <body><h1>502 Bad Gateway</h1></body></html>`, "DevTools > Network > submissions > Headers / Response"),
        p("The browser reached `api.codedev.test` and got an answer. The answer came from the load balancer in front of the API, which could not reach the API servers while they restarted, so it sent its own HTML error page. Then `res.json()` tried to parse that HTML, threw a `SyntaxError`, and the `catch` block called it \"offline\"."),

        h2("3. Headers: the metadata of every request"),
        p("The **Headers** tab has three parts: **General** (URL, method, status, remote address), **Response Headers** and **Request Headers**. A handful of fields explain most bugs you will meet in this course:"),
        bullets([
            "`Content-Type` - the format of the body that follows. On a request, it tells the server how to read your body (`application/json`). On a response, it tells you how to read theirs. A response with `text/html` will never parse as JSON, whatever your code expects.",
            "`Accept` - the formats the client would like back. Many servers ignore it on error pages, as the load balancer did here; it is a preference, not a guarantee.",
            "`Authorization` - credentials for the API, usually `Bearer <token>`. Treat its value like a password.",
            "`Cookie` (request) and `Set-Cookie` (response) - session data the browser stores and sends back automatically. JavaScript cannot read `Set-Cookie` from a `fetch()` response; the **Cookies** tab of the request shows what was sent and received (lesson 6).",
            "`Cache-Control` - whether and how long the response may be reused from a cache (lesson 5). An unexpected cache hit shows up as \"(disk cache)\" or \"(memory cache)\" in the Size column.",
            "`Location` and `Retry-After` - where a redirect or a newly created resource lives, and how long to wait before trying again after a `429` or `503`.",
        ]),
        callout("info", "\"Provisional headers are shown\"",
            "When DevTools shows this warning above the request headers, it is displaying the headers the browser planned to send, not the ones that went over the network - for example because the response came from a cache or the request never completed. Do not conclude that a header was sent from that view alone."),

        h2("4. Bodies: Payload, Preview and Response"),
        p("Three tabs show the content of the exchange, and mixing them up is a common way to misread a bug:"),
        bullets([
            "**Payload** - what you sent: the query string parameters, and the request body (`{\"code\":\"...\"}`). Check it first when the server says your input is invalid. \"view source\" shows the exact bytes.",
            "**Preview** - the response **rendered** for humans: JSON as a collapsible tree, HTML drawn as a page, images displayed. It is convenient, and it hides details: the 502 page above shows up in Preview as a big \"502 Bad Gateway\" heading, which can look like a deliberate API message.",
            "**Response** - the response body as **raw text**, exactly as it arrived. This is what `res.json()` receives. When parsing fails, look here: a leading `<`, an empty body, or a stray character before the `{` explains the error at once.",
        ]),
        p("A JSON parse error always means the text was not valid JSON - not that the network failed. The common causes are easy to recognise in the Response tab:"),
        code("text", `
Response text                         why res.json() fails
<!DOCTYPE html>...                    an HTML page: "Unexpected token '<' ... is not valid JSON"
(empty body, for example a 204)       nothing to parse: "Unexpected end of JSON input"
{'ok': true}                          JSON strings and keys need double quotes
{"ok": true,}                         JSON does not allow a trailing comma`, "Response tab vs parser (error wording varies by browser)"),

        h2("5. What fetch() treats as a failure"),
        p("The second half of the bug is a wrong belief about `fetch()`. It does **not** reject the promise for HTTP errors:"),
        bullets([
            "If **any HTTP response arrives** - `200`, `404`, `502`, it does not matter - `fetch()` resolves with a `Response`. `res.ok` is `true` only for status `200`-`299`, and `res.status` holds the code.",
            "If **no usable response arrives** - the device is offline, DNS fails, the connection is refused or reset, or the browser blocks the response under CORS (lesson 4) - `fetch()` rejects with a `TypeError` (Chrome says \"Failed to fetch\"). An aborted request rejects with an `AbortError`.",
            "In DevTools, those failures show `(failed)` in the Status column, with a reason such as `net::ERR_INTERNET_DISCONNECTED` or `net::ERR_CONNECTION_REFUSED` when you hover or open the request. Older APIs such as `XMLHttpRequest`, and many HTTP libraries, report the same situation as status `0`.",
        ]),
        p("So \"did a response arrive?\" and \"what did the response say?\" are separate questions, with separate evidence. The submit function answered neither: it parsed first and guessed later. Check what you have learned so far against two pieces of evidence:"),
        challenge("chal_quiz_whf_131"),

        h2("6. Copy as cURL: replay the exact request"),
        p("Right-click a request in the Network table and choose **Copy > Copy as cURL** (DevTools on Windows offers a `cmd` and a `bash` variant). You get a command with the same URL, method, headers, cookies and body as the browser sent. Paste it into a terminal, add `-i` to see the status line and headers, and you can repeat the request as often as you like - or send it to a backend colleague who does not have your browser state."),
        code("bash", `
curl -i 'https://api.codedev.test/v1/lessons/12/submissions' \\
  -X POST \\
  -H 'accept: application/json' \\
  -H 'content-type: application/json' \\
  -b 'codedev_session=REDACTED' \\
  --data-raw '{"code":"function add(a, b) { return a + b; }"}'`, "Copy as cURL, with -i added and the cookie redacted"),
        callout("warning", "A copied request contains your credentials",
            "Copy as cURL includes your Cookie and Authorization headers. Anyone who has the command can act as you until the session expires. Replace those values with REDACTED before pasting the command into a ticket, a chat or an AI tool, and never commit it."),

        h2("7. The fix: classify before you parse"),
        image("devtools-read-a-failure", {
            alt: "Two flows for the same failed submission. Before, in red: fetch resolves with a 502 HTML page, res.json throws a SyntaxError, and the catch block shows \"You are offline\". After, in green: four questions in order - did a response arrive, what is the status code, what is the Content-Type, then parse the body - lead to the message \"CodeDev had a problem saving your submission\". A bottom row shows which DevTools tab answers each question.",
            caption: "Read the evidence in the order the browser received it: connection, status line, headers, body.",
        }),
        p("The repaired function separates the two questions. A rejected `fetch()` is the only case where nothing came back. Everything else is a response, and its status code - not the body - decides what kind of failure it is. The body is read according to its `Content-Type`, so an HTML error page can never crash the parser:"),
        code("javascript", `
// submit.js (after)
async function submitSolution(lessonId, code) {
    let res;
    try {
        res = await fetch(\`https://api.codedev.test/v1/lessons/\${lessonId}/submissions\`, { /* same options */ });
    } catch (err) {
        return showBanner("We could not reach CodeDev. Your code is still here - try again.");
    }
    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    const body = isJson ? await res.json().catch(() => null) : await res.text();

    const kind = classifyResponse({ status: res.status, body });
    showMessageFor(kind, body);   // a different message, and a different next step, per kind
}`, "submit.js"),
        p("The missing piece is `classifyResponse`: one small, pure function that turns a result into a kind of failure the UI can act on - try again later, fix a field, log in again, or report it. Pure functions like this are easy to test without a server, which is exactly how you will check it. Write it:"),
        code("javascript", `
classifyResponse({ status: 502, body: "<!DOCTYPE html>..." });   // -> which kind?
classifyResponse({ networkError: "offline" });                    // -> which kind?`),
        challenge("chal_coding_whf_132"),
        p("Then verify the fix the same way you found the bug:"),
        numbered([
            "No response: tick **Offline** in the throttling menu of the Network panel (or right-click the request and choose **Block request URL**) and submit again. The request must not show a status code, and the banner must say that CodeDev could not be reached.",
            "Error page: you do not need to wait for a deploy. In a unit test, give `submitSolution` a fake `fetch` that resolves with `new Response(\"<!DOCTYPE html>...\", { status: 502, headers: { \"content-type\": \"text/html\" } })` and assert that the server-error message is shown, not the offline one.",
            "In both cases, check that the learner's code is still in the editor.",
        ]),
        callout("info", "Practice on your own (not graded)",
            "Open any web app you use, filter the Network panel by Fetch/XHR, tick Preserve log, and find one request whose Preview and Response tabs look different. Then copy it as cURL, redact the credentials, and replay it with curl -i."),

        h2("8. Pitfalls"),
        bullets([
            "**One catch for everything.** A `try` around `fetch()` and `res.json()` together cannot tell \"no response\" from \"bad response\". Keep them apart.",
            "**Trusting `res.json()` blindly.** Check `res.ok` or the status first, and the `Content-Type` before parsing. Error pages from proxies, CDNs and login redirects are usually HTML.",
            "**Reading only Preview.** Preview renders and reformats. When parsing fails, the raw Response tab is the evidence.",
            "**Losing the request.** Without Preserve log, a reload or a redirect clears the list. Tick it before you reproduce the bug.",
            "**Pasting secrets.** Copy as cURL and HAR exports contain cookies and tokens. Redact them before sharing.",
        ]),

        h2("9. Checklist"),
        bullets([
            "I filter by Fetch/XHR and tick Preserve log before reproducing a bug.",
            "I read the status code and the response `Content-Type` before I read the body.",
            "When JSON parsing fails, I check the raw Response tab, not only Preview.",
            "My code tells \"no response\" (rejected `fetch()`) apart from \"error response\" (`res.ok` is false).",
            "Error messages tell the learner what happened and what to do next, and never discard their work.",
            "I redact cookies and tokens from any copied request I share.",
        ]),

        h2("Sources"),
        bullets([
            "WHATWG Fetch Standard: the fetch() method, Response.ok and network errors.",
            "RFC 9110 HTTP Semantics, section 8.3 (Content-Type) and section 15 (status codes).",
            "Chrome DevTools documentation: Network features reference (filters, Preserve log, Copy as cURL).",
        ]),
    ],
});
