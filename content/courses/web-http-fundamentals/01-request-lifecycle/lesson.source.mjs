// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-whf-1-1",
    title: "How a web request travels: URL, DNS, TLS & the response",
    slug: { _type: "slug", current: "how-a-web-request-travels" },
    description:
        "The CodeDev progress page takes seconds on the first visit of the day and a fraction of a second afterwards, while the API logs say every request took under 100 ms. Follow one request from the URL to the last byte - DNS, TCP, TLS, the HTTP message, connection reuse, HTTP/2 and HTTP/3 - and learn to read the DevTools Timing tab so you can prove where the time goes.",
    estimatedTime: 20,

    scenario: {
        role: "Frontend developer, CodeDev platform team",
        problem:
            "Learners keep reporting that the My Progress page at https://app.codedev.test/progress \"hangs for a few seconds every morning\". After the first load it opens almost instantly for the rest of the session. The API team checked their logs: every GET /v1/progress on https://api.codedev.test finished in 80-100 ms, morning or not. The frontend team thinks the API is slow, the API team thinks the frontend is slow, and nobody has looked at the request itself.",
    },

    content: [
        h2("1. The incident: a fast API behind a slow page"),
        p("The progress page loads its JavaScript from `app.codedev.test`, then calls the API on a different host, `api.codedev.test`, to fetch the learner's progress. You open the page in a fresh browser profile, open DevTools, select the `progress` request in the **Network** tab and click its **Timing** tab. Then you reload the page and look again:"),
        code("text", `
GET https://api.codedev.test/v1/progress          (first visit of the day)
  Queueing                      2 ms
  Stalled                       3 ms
  DNS Lookup                  610 ms
  Initial connection          420 ms
    SSL                       290 ms
  Request sent                0.2 ms
  Waiting for server response  92 ms
  Content Download              4 ms
  Total                     1,131 ms

GET https://api.codedev.test/v1/progress          (reload, a minute later)
  Queueing                      1 ms
  Stalled                       2 ms
  Request sent                0.1 ms
  Waiting for server response  88 ms
  Content Download              3 ms
  Total                        94 ms`, "DevTools > Network > progress > Timing"),
        p("Both teams were right about their own part. The server really answers in about 90 ms. The extra second is spent **before the request reaches the server**: finding the server's address and opening a secure connection to it. On the reload, those rows are simply gone. To fix the page you need to know what each of those steps is, why it happens only sometimes, and which ones you can influence."),

        h2("2. Reproduce it from the terminal"),
        p("DevTools shows one browser's view. `curl` gives you the same breakdown from any machine, and it opens a brand-new connection on every run - exactly the cold path that the first visit pays. The `-w` option prints timing variables after the transfer:"),
        code("bash", `
curl -s -o /dev/null https://api.codedev.test/v1/progress \\
  -H "Authorization: Bearer $TOKEN" \\
  -w "dns %{time_namelookup}  tcp %{time_connect}  tls %{time_appconnect}  first byte %{time_starttransfer}  total %{time_total}\\n"

dns 0.604  tcp 0.735  tls 1.021  first byte 1.114  total 1.118`, "terminal"),
        p("Each number is **cumulative**, in seconds since the start: the TCP connection was ready at 0.735 s, TLS at 1.021 s, and the first byte of the answer arrived at 1.114 s. The server's own work is only the gap between `tls` and `first byte`. If you run the command twice and the `dns` value drops to almost zero, your operating system cached the DNS answer - which is the first clue about why only the first visit is slow."),

        h2("3. Step one: the URL says where to go"),
        p("Before anything is sent, the browser splits the URL into parts. Each part has a different job, and one of them never leaves the browser:"),
        code("text", `
https://app.codedev.test:443/courses/web-http/lessons?tab=notes&page=2#exercise-3
\\___/   \\______________/\\__/\\________________________/\\________________/\\_________/
scheme        host       port            path                query          fragment`),
        bullets([
            "**Scheme** (`https`) chooses the protocol and the default port: 443 for `https`, 80 for `http`. When the port is the default, it is normally left out of the URL.",
            "**Host** (`app.codedev.test`) is the name DNS will turn into an IP address. The browser also sends it in the `Host` header (or the `:authority` field in HTTP/2 and HTTP/3), so one server can serve many sites.",
            "**Path** (`/courses/web-http/lessons`) and **query** (`?tab=notes&page=2`) form the request target the server receives. Characters such as spaces must be percent-encoded (`%20`).",
            "**Fragment** (`#exercise-3`) is **never sent to the server**. The browser keeps it and uses it to scroll to an element or to let client-side code read `location.hash`. A server log will never contain it.",
        ]),
        callout("info", "Origin = scheme + host + port",
            "https://app.codedev.test and https://api.codedev.test are different origins because the hosts differ. That matters twice in this course: the browser needs a separate connection to each host (this lesson), and cross-origin requests follow the CORS rules (lesson 4)."),

        h2("4. Step two: DNS turns the name into an address"),
        p("Computers connect to IP addresses, not names. The browser asks a DNS resolver for the `A` (IPv4) and `AAAA` (IPv6) records of `api.codedev.test`. If nobody nearby knows the answer, the resolver walks the DNS hierarchy, which can take several network round trips."),
        p("Every answer carries a **TTL** (time to live, in seconds). The browser, the operating system and the resolver may cache the answer until the TTL runs out. That is why DNS shows up as a long row on a cold visit and disappears on the next one. You can see the TTL yourself:"),
        code("bash", `
dig +noall +answer api.codedev.test
api.codedev.test.   300   IN   A   203.0.113.10
#                   ^^^ seconds this answer may be cached

# Windows PowerShell: Resolve-DnsName api.codedev.test (the TTL column)`, "terminal"),
        p("A short TTL makes changes to the address take effect quickly, but it also means caches expire often and more visits pay for a lookup. Choosing a TTL is a trade-off for whoever runs the DNS zone; your job as a developer is to notice when a long DNS row is the real cause."),

        h2("5. Step three: TCP and TLS open a secure connection"),
        p("With an address in hand, the browser opens a **TCP** connection: a three-way handshake (SYN, SYN-ACK, ACK) that costs one round trip between the browser and the server. A round trip is limited by distance and by the network path, not by how fast the server is."),
        p("Over that connection, **TLS** sets up encryption. In TLS 1.3 the handshake adds one more round trip (TLS 1.2 needed two). During it the browser:"),
        bullets([
            "sends the host name it wants (SNI), so the server can pick the right certificate;",
            "checks that the certificate is valid for `api.codedev.test` and signed by an authority it trusts;",
            "agrees on the HTTP version to speak through ALPN, for example `h2` for HTTP/2.",
        ]),
        code("text", `
$ curl -v https://api.codedev.test/v1/progress -o /dev/null
*   Trying 203.0.113.10:443...
* Connected to api.codedev.test (203.0.113.10) port 443
* SSL connection using TLSv1.3 / TLS_AES_128_GCM_SHA256
* ALPN: server accepted h2
* Server certificate:
*  subject: CN=api.codedev.test
> GET /v1/progress HTTP/2
...`, "curl -v (abridged; exact wording varies by curl version)"),
        p("So before the first byte of the request is sent, a new HTTPS connection over TCP needs about two round trips. On a mobile network far from the server, that alone can be hundreds of milliseconds - which matches the `Initial connection` and `SSL` rows in the incident."),

        h2("6. Step four: the HTTP request and response"),
        p("Only now does HTTP itself start. In HTTP/1.1 the messages are plain text, which makes their structure easy to see. A request is a **request line**, **header fields**, an empty line and an optional **body**:"),
        code("http", `
GET /v1/progress?course=web-http HTTP/1.1
Host: api.codedev.test
Accept: application/json
Authorization: Bearer eyJhbGciOi...

`, "request"),
        p("The response has the same shape, starting with a **status line** - the protocol version, a three-digit status code and a reason phrase:"),
        code("http", `
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 60
Cache-Control: no-store

{"course":"web-http","completedLessons":4,"totalLessons":10}`, "response"),
        p("`curl -i URL` prints the status line and headers of a real response before its body. HTTP/2 and HTTP/3 send the same information in binary frames, and the request line becomes pseudo-header fields such as `:method`, `:path` and `:status`. The meaning - methods, status codes, headers - is identical in every version; it is defined once in RFC 9110. That is why the rest of this course works the same whatever version the Protocol column shows."),

        h2("7. Connection reuse, HTTP/2 and HTTP/3 at a glance"),
        p("Opening a connection is expensive, so browsers keep connections open and reuse them. That is the other half of the morning mystery: on the reload, the connection to `api.codedev.test` was still open, so the DNS, TCP and TLS rows vanished."),
        bullets([
            "**HTTP/1.1** connections are persistent by default, but carry one request at a time. Browsers open a few parallel connections per host to compensate (Chrome uses up to six). A response with `Connection: close` tells the browser not to reuse the connection.",
            "**HTTP/2** multiplexes many requests as independent streams over **one** TCP + TLS connection per origin, so later requests on the page start without any handshake.",
            "**HTTP/3** runs over **QUIC**, on UDP. QUIC combines the transport and TLS 1.3 handshakes into one round trip, and a lost packet only delays its own stream, not every stream on the connection. A browser usually learns that a server supports HTTP/3 from an `Alt-Svc` response header (or a DNS record), so the very first request often still uses HTTP/2.",
            "Idle connections do not live forever: servers and browsers close them after a period of inactivity. After a night away, the learner's browser has to start from step two again.",
        ]),
        p("You can watch reuse happen. Right-click the column headers of the Network table and enable **Protocol** and **Connection ID**. Requests that share a Connection ID went over the same connection; only the first request on each connection shows the DNS and connection rows in its Timing tab."),
        callout("warning", "Why not \"just switch to HTTP/3\"?",
            "Upgrading the protocol is a real infrastructure change, and it would not remove the first DNS lookup or the first visit's handshake. Measure first: here the Timing tab says the cost is connection setup on a cold visit, so the cheapest fix is to start that setup earlier, not to change servers."),

        h2("8. Reading the Timing tab"),
        image("request-lifecycle-timing", {
            alt: "Two timelines for the same GET /v1/progress request. The first visit, in red, spends 610 ms on DNS, 130 ms on TCP and 290 ms on TLS before the request is sent, then 92 ms waiting for the server and 4 ms downloading. The repeat visit, in green, reuses the open connection and only shows 88 ms of waiting and 3 ms of download. A bottom row lists what each phase usually means.",
            caption: "The server's work is the same on both visits. Only the first visit pays for finding the server and opening a secure connection.",
        }),
        p("Each row in Chrome's Timing tab answers a different question. Learn which team can do something about each one:"),
        bullets([
            "**Queueing / Stalled** - the request waited inside the browser: a higher-priority request went first, or all HTTP/1.1 connections to that host were busy. Long values point at the page (too many requests at once), not the server.",
            "**DNS Lookup** - resolving the host name. Present only when no cached answer was available.",
            "**Initial connection** - the TCP handshake (and for HTTP/3, the QUIC handshake). **SSL** is the TLS part of it. Both disappear when a connection is reused.",
            "**Request sent** - writing the request. Almost always tiny, unless you upload a large body.",
            "**Waiting for server response** - the time to first byte (TTFB): one round trip plus everything the server does before it answers. This is the row the API team's logs describe.",
            "**Content Download** - receiving the body. Large values mean a big response or a slow network.",
        ]),
        p("Now test yourself on the two pieces of evidence that confuse people most often: what actually reaches the server, and what the Timing rows prove."),
        challenge("chal_quiz_whf_111"),

        h2("9. The fix: start the connection early, then prove it"),
        p("Two fixes look tempting and would change nothing. Caching the progress response would not help, because the time is not spent producing it. Optimising the progress query would save a few milliseconds out of 92. The cost is the cold connection to a second host, and it sits on the critical path: the page only starts it after its JavaScript has downloaded and run."),
        p("A **preconnect** hint tells the browser, while it is still reading the HTML, to resolve the API host and open the connection in parallel with downloading the JavaScript:"),
        code("html", `
<head>
  <!-- Open the connection to the API while the app bundle downloads. -->
  <link rel="preconnect" href="https://api.codedev.test" crossorigin>
  <script src="/assets/app.js" defer></script>
</head>`, "index.html"),
        bullets([
            "`crossorigin` must match how the request is made. Browsers keep separate connections for anonymous requests (no cookies) and credentialed ones, and a `fetch()` to another origin is anonymous by default. If the request still shows a connection row after the fix, a mismatch here is the first thing to check.",
            "Preconnect only to the one or two origins the page will certainly use. Every preconnect opens a real connection, and an unused one is closed again after a short time, wasting work on slow devices.",
            "`<link rel=\"dns-prefetch\" href=\"https://api.codedev.test\">` only resolves the name. It is a lighter fallback when a full connection would be wasteful.",
        ]),
        p("Then prove the change with evidence, not with a feeling that \"it seems faster\":"),
        numbered([
            "Reproduce the cold path: open an incognito window, or in Chrome go to `chrome://net-internals/#dns` (Clear host cache) and `chrome://net-internals/#sockets` (Flush socket pools).",
            "Load the progress page with the Network tab open and the waterfall visible.",
            "Before the fix, the API request starts after `app.js` finishes and its Timing shows DNS, Initial connection and SSL rows. After the fix, those rows are gone or much shorter, because the connection was already open when the request started.",
            "Compare the total of the API request and the page's load time over a few runs, not one: network timings vary from run to run.",
        ]),
        callout("tip", "Also check that connections are reusable",
            "Run curl -sI https://api.codedev.test/v1/progress and look at the response headers. On HTTP/1.1, a Connection: close header (often added by a misconfigured proxy) forces a new handshake for every request, and the slow rows would appear on every visit, not only the first."),
        callout("info", "Practice on your own (not graded)",
            "Open any site you use daily with DevTools open, enable the Protocol and Connection ID columns, and find one request that paid for DNS, TCP and TLS. Then run the curl -w command from section 2 against the same URL and compare the numbers with the Timing tab."),

        h2("10. Pitfalls"),
        bullets([
            "**Blaming the server for the whole request time.** Total time includes DNS, connection setup and download. Only \"Waiting for server response\" overlaps with server logs, and even that includes one network round trip.",
            "**Testing only warm.** Developers reload the same page all day, so their connection is always open. Reproduce the first visit explicitly (incognito, flushed sockets, or `curl`, which always starts cold).",
            "**Expecting the fragment on the server.** `#exercise-3` never appears in the request. If the server needs the value, send it in the path or the query.",
            "**Treating \"Disable cache\" as a cold start.** That checkbox bypasses the HTTP cache for responses. It does not close open connections or clear the DNS cache.",
            "**Reading one sample.** A single slow request can be a busy Wi-Fi network. Look for the same row being slow across several runs before you change anything.",
        ]),

        h2("11. Checklist"),
        bullets([
            "I can name the parts of a URL and know that the fragment stays in the browser.",
            "For a slow request, I opened the Timing tab before blaming any team.",
            "I can tell connection setup (DNS, Initial connection, SSL) from server time (Waiting for server response) and download time.",
            "I reproduced the first visit cold, with an incognito window, flushed sockets or `curl -w`.",
            "Before changing infrastructure, I checked whether a cheaper fix such as `preconnect` removes the measured cost.",
            "After the fix, I compared the Timing tab before and after, over several runs.",
        ]),

        h2("Sources"),
        bullets([
            "RFC 3986 Uniform Resource Identifier (URI): Generic Syntax, section 3 (components; the fragment is resolved by the client).",
            "RFC 9110 HTTP Semantics (methods, status codes and fields, shared by HTTP/1.1, HTTP/2 and HTTP/3) and RFC 9112 HTTP/1.1, section 9 (connection management and persistence).",
            "Chrome DevTools documentation, Network features reference: \"Timing breakdown phases explained\".",
        ]),
    ],
});
