// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nae-2-2",
    title: "Streaming responses: assemble the chunks, survive a cut stream",
    slug: { _type: "slug", current: "streaming-responses-cut-stream" },
    description:
        "Learners stared at a spinner for seconds before a level-3 hint appeared, so the Hint Service started to stream. The first week brought JSON errors that only happened behind the CDN and a hint cut in the middle of a sentence that was cached for a day. Learn what streaming buys and what it does not, how server-sent events are framed, how to assemble chunks that split anywhere, and how to treat a stream that never says it is done.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev Hint Service",
        problem:
            "The Hint Service answered POST /challenges/:id/hints only when the model had written the whole hint. For level-3 hints with a worked example the learner saw a spinner for several seconds, and the logs showed many learners clicking Get hint a second time, which doubled the model calls. The team switched to a streaming endpoint. In its first week the browser threw SyntaxError on JSON that looked fine, but only in production, and one hint that stopped at \"the first\" was cached and served to every learner with the same failing test for 24 hours.",
    },

    content: [
        h2("1. The incident: fast on localhost, broken behind the CDN"),
        p("The non-streaming Hint Service from the earlier lessons is simple: render the prompt, call `llm.complete(...)`, validate the JSON, return it. Its weakness is waiting. The model writes the hint token by token, and the learner sees nothing until the last token is written. The team measured the gap between the click and the first visible word, saw that learners were clicking again, and moved the level-2 and level-3 hints to a streaming endpoint."),
        p("The first browser parser was written in ten minutes and tested on localhost, where every read from the response body happened to contain exactly one frame. In production, behind the CDN, two things went wrong:"),
        bullets([
            "**JSON errors that only happened in production.** The browser logged `SyntaxError: Unterminated string in JSON` on hints that the server had sent correctly. The parser called `JSON.parse` on each piece the network delivered, and those pieces did not line up with frames.",
            "**A cut hint was cached.** A provider connection dropped after 23 frames. The server took the end of the body as the end of the hint, cached \"Look at what your loop does when the array is empty: the first\" and served it for a day.",
        ]),
        p("Both bugs come from the same wrong belief: that the network delivers messages. It delivers bytes. Framing - where one message ends and the next starts, and whether the last one arrived - is your code's job."),

        h2("2. What streaming buys, and when not to stream"),
        p("Two numbers describe the wait. **Time to first token (TTFT)** is the time from the request to the first piece of output. **Total time** is the time until the last piece. Without streaming the learner waits for the total time before seeing anything; with streaming they see text after TTFT and read while the rest is generated. Streaming does not make the model faster and does not make the call cheaper: the same tokens are generated and billed. It changes what the learner experiences while they wait."),
        p("Stream when a person reads the output as it arrives and the output is long enough for the wait to matter: chat answers, explanations, the worked example of a level-3 hint. Do **not** stream when:"),
        bullets([
            "**A program needs the whole output before it can use it.** A JSON object for your code (lesson 3) or the arguments of a tool call (lesson 5) cannot be validated half way. Streaming them adds parsing work and gives no one anything to read.",
            "**You must check the output before anyone sees it.** In lesson 10 you check that a hint does not leak the reference solution. With streaming, words reach the learner before the check has seen the whole hint. You can run the check on the growing text and stop the stream when it fires, but a few words may already be on screen. For content that must never be shown, buffer it.",
            "**The output is short.** A one-sentence level-1 hint arrives almost as fast whole as in pieces, and the non-streaming path is simpler to cache, validate and test.",
        ]),
        p("That is why the Hint Service streams only the human-readable hint text. The `level` is chosen by the request and the `references` are added by the server after the stream, so the final object still follows the same contract as before - `{ level, hint, references }` with a hint of 1 to 400 characters - and is validated once, at the end, before it is cached."),

        h2("3. The wire format: server-sent events"),
        p("Server-sent events (SSE) are a plain-text format for a response that keeps arriving, served as `Content-Type: text/event-stream`. The rules you need fit on one screen:"),
        bullets([
            "The body is a sequence of lines. A line ends with `\\n`, `\\r\\n` or `\\r` (the Hint Service only uses the first two).",
            "A line `field: value` sets a field of the current event. The fields are `data`, `event` (the event name), `id` and `retry`. One space after the colon is removed.",
            "A line that starts with `:` is a comment. Servers send one every few seconds (`: keep-alive`) so that proxies do not close a quiet connection.",
            "**An empty line ends the event.** Only then is the event dispatched. Several `data` lines in one event are joined with `\\n`.",
        ]),
        p("SSE itself has no \"end of stream\" event: the body simply stops. That is why the Hint Service, like most LLM APIs, adds its own end marker. Its protocol on top of SSE is three kinds of events:"),
        code("text", `
data: {"delta":"Look at what your loop "}

data: {"delta":"does when the array is empty."}

: keep-alive

event: error
data: {"message":"provider unavailable"}

data: [DONE]
`, "Hint Service stream (each event ends with an empty line)"),
        bullets([
            "**Delta frames** carry the next piece of text as JSON. JSON is not decoration here: `JSON.stringify` escapes a newline inside the delta as `\\n`, so a hint with line breaks can never produce an accidental empty line that ends the event early.",
            "**`event: error`** means the server gave up: the provider failed or the request was refused mid-way. The text so far is all there will be.",
            "**`data: [DONE]`** is the sentinel. It is the **only** proof that the server finished. A body that ends without it was cut, however good the last frame looked.",
        ]),

        h2("4. The server: forward deltas, cap the length, stop paying when the learner leaves"),
        p("The gateway from lesson 1 has a streaming twin of `llm.complete`. `llm.stream({ model, messages, temperature, maxTokens, signal })` takes the same arguments and returns an async iterable: `{ type: \"delta\", text }` events while the model writes, then one `{ type: \"done\", usage }` when the provider's own stream finished properly. If the provider connection drops, the iteration simply ends, with no `done`. The gateway parses the provider's stream with the same kind of parser you will write in this lesson."),
        code("javascript", `
// POST /challenges/:id/hints/stream  - Node, plain http-style response object
async function streamHint(req, res, { llm, cache, buildMessages, referencesFor }) {
    const { challengeId, level, failingTest } = req.body;     // validated earlier
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",          // ask an nginx proxy not to buffer the stream
    });

    const upstream = new AbortController();
    res.on("close", () => { if (!res.writableEnded) upstream.abort(); });   // learner left
    const keepAlive = setInterval(() => res.write(": keep-alive\\n\\n"), 15000);

    let text = "";
    let finished = false;
    try {
        for await (const event of llm.stream({
            model: "model-large", messages: buildMessages(req.body),
            temperature: 0.2, maxTokens: 300, signal: upstream.signal,
        })) {
            if (event.type === "done") { finished = true; break; }
            text += event.text;
            if (text.length > 400) { upstream.abort(); break; }     // contract: 1-400 chars
            res.write(\`data: \${JSON.stringify({ delta: event.text })}\\n\\n\`);
        }
    } catch (error) {
        if (!upstream.signal.aborted) console.error("hint.stream failed", error.name);
    } finally {
        clearInterval(keepAlive);
    }

    if (finished) {
        const hint = { level, hint: text.trim(), references: referencesFor(challengeId) };
        // validate with the lesson 3 validator before caching (omitted here)
        await cache.set(\`\${challengeId}:\${failingTest}:level\${level}\`, hint, { ttlSeconds: 86400 });
        res.end("data: [DONE]\\n\\n");
    } else if (!res.writableEnded) {
        res.end('event: error\\ndata: {"message":"hint interrupted"}\\n\\n');
    }
}`, "streamHint.js"),
        p("Four details carry the lesson:"),
        bullets([
            "**`finished` comes from the provider's `done`, not from the loop ending.** A loop that ends because the iterator ran out is a cut stream. Only a finished hint is cached.",
            "**The length cap is enforced while streaming.** The contract says at most 400 characters; aborting at 401 stops the generation and the billing at once, instead of reading 300 tokens and throwing them away. The learner already saw up to 400 characters, so the server sends `event: error` and does not cache.",
            "**A closed connection aborts the provider call.** When the learner closes the tab, `res` emits `close` before the response was ended. Without the abort, the model keeps generating tokens nobody will read, and you pay for every one of them.",
            "**Buffering kills streaming silently.** A proxy or a compression middleware that collects the whole body before sending it turns your stream back into one late response. `Cache-Control: no-cache` and, for nginx, `X-Accel-Buffering: no` ask them not to; check it from outside, as in section 7.",
        ]),

        h2("5. The client: chunks are not frames"),
        p("In the browser, the obvious tool would be `EventSource`, the built-in SSE client. It cannot be used here: it only sends `GET` requests and cannot carry a request body, and the Hint Service needs the learner's code and failing test output in a `POST`. So the client uses `fetch` and reads the body itself:"),
        code("javascript", `
async function* readText(response) {
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        yield value;            // a piece of text of ANY length, cut ANYWHERE
    }
}

const response = await fetch(\`/api/challenges/\${challengeId}/hints/stream\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level: 2, code, failingTest }),
    signal: controller.signal,          // Cancel button / leaving the page
});
const result = await assembleStream(readText(response));`, "hintClient.js"),
        p("Every `reader.read()` returns whatever bytes have arrived. On localhost that is often exactly one frame, because the server writes one frame at a time and nothing in between regroups them. Across the internet, TCP segments, TLS records, proxies and CDNs regroup bytes freely. One read can hold half a frame; the next can hold the other half and three more frames. Your parser has to produce the same result whichever way the text is cut."),
        h3("Decode bytes as a stream, too"),
        p("The same problem exists one level down. A Vietnamese hint such as \"Kiểm tra vòng lặp\" contains characters that take two or three bytes in UTF-8, and a read can end in the middle of one. `TextDecoderStream` (or `new TextDecoder()` with `decode(bytes, { stream: true })`) keeps the incomplete bytes for the next read. Calling `new TextDecoder().decode(bytes)` on each read separately turns split characters into replacement characters (`\\uFFFD`)."),
        h3("Assemble with a buffer"),
        p("The fix for the production bug is a buffer that outlives each read. Append every chunk, cut off the complete lines, keep the incomplete tail for the next chunk, and act on an event only when its empty line arrives:"),
        code("javascript", `
async function assembleStream(chunks) {
    // state that survives between chunks:
    //   buffer   - text received but not yet cut into complete lines
    //   event    - the name and the data values of the event being read
    //   text, frames
    // for await (const chunk of chunks):
    //   1. append chunk to the buffer
    //   2. while the buffer holds a "\\n": cut one line off (drop a trailing "\\r")
    //   3. empty line -> the event is complete: error? [DONE]? delta? then reset the event
    //      comment    -> ignore
    //      otherwise  -> record the data / event field
    // the loop ended without a stop -> the stream was cut
}`),
        image("sse-chunk-assembly", {
            alt: "Diagram in two halves. On the left, in red, the first client: three network chunks whose boundaries fall inside a frame are each passed to JSON.parse, which throws Unterminated string, and a stream that ended after 23 frames without the DONE marker is cached for 24 hours. On the right, in green, the fixed client: the same chunks are appended to a buffer, cut into complete lines, grouped into events at each empty line and applied as deltas; only an event containing DONE marks the stream complete. A bottom strip lists the three outcomes: complete means validate and cache, cut means show the partial text marked as interrupted and do not cache, error means show the partial text and fall back.",
            caption: "The network delivers bytes, not frames: buffer, cut into lines, act on complete events, and trust only [DONE].",
        }),
        p("Now write it. The tests replay recorded chunk sequences - cut inside lines, inside JSON strings and between `\\r` and `\\n` - and include streams that end early, stop with an error, or carry malformed frames:"),
        challenge("chal_coding_nae_222"),

        h2("6. A cut stream is a result, not an exception"),
        p("Streams get cut: the learner's train enters a tunnel, the provider restarts, a proxy closes a connection that ran longer than its timeout. Your parser should not throw in that case; it should tell the caller clearly what it has. That is why `assembleStream` returns `complete: false` with a reason instead of failing:"),
        bullets([
            "**complete** - validate the full hint (lesson 3) and cache it. Record that the learner opened this hint level.",
            "**cut** - keep the partial text on screen, mark it (\"The hint was interrupted.\") and offer Try again. Do not cache it and do not log it as a delivered hint. The tokens were generated and billed anyway, which is exactly why lesson 8 settles a call with the actual usage instead of assuming nothing was spent.",
            "**error** - the server reported a failure mid-stream. Show what arrived and fall back, for example to the static hint of that level (lesson 7).",
            "**bad_frame** - the server sent something outside the protocol. That is a bug in your own service, not in the learner's network: log it with the request id and treat the hint as failed.",
        ]),
        p("Can the client resume a cut stream where it stopped? SSE has a mechanism for it (`id` fields and the `Last-Event-ID` header), but resuming an LLM answer requires the server to keep the generated text for each request, which most services, including this one, do not do. For a hint of a few hundred characters, asking again is simpler and the result is easier to reason about."),
        challenge("chal_quiz_nae_221"),

        h2("7. How to verify"),
        bullets([
            "**See the raw frames from outside.** `curl -N` disables curl's own buffering, so frames print as they arrive. If they all appear at once after a pause, something between you and the server is buffering the response.",
            "**Test every split position.** Take one recorded stream as a single string, cut it into two chunks at every index from 0 to its length, and assert that `assembleStream` returns the same result for every cut. Then do the same with chunks of 1, 2, 3 and 7 characters. A parser that passes this has no chunk-boundary bugs left.",
            "**Test the endings explicitly.** A recorded stream with `[DONE]`, the same stream with `[DONE]` removed, one with `[DONE]` but no final empty line, and one with an `event: error` in the middle. Each must give a different, documented result.",
            "**Log what the user experienced.** Per request: time to first delta, total time, frame count, `done_received`, and whether the client disconnected. A rising share of `done_received=false` is the first sign of a proxy timeout or a provider problem.",
        ]),
        code("bash", `
curl -N -X POST https://api.codedev.test/challenges/c_17/hints/stream \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"level":2,"failingTest":"test_3","code":"..."}'

data: {"delta":"Look at what your loop "}

data: {"delta":"does when the array is empty."}

data: [DONE]
`, "terminal"),

        h2("8. Common mistakes"),
        bullets([
            "**One read = one frame.** `JSON.parse(value.slice(6))` on each chunk. Spot it: errors like `Unterminated string in JSON` that appear only in production, or only on slow networks. Fix: buffer and split on lines.",
            "**The end of the body is the end of the answer.** No check for the end marker, so a cut stream looks finished. Spot it: cached or stored hints that stop mid-sentence; `done_received=false` next to `cache.set` in the log.",
            "**Not aborting upstream when the client leaves.** The provider call keeps running after the learner closed the tab. Spot it: provider usage that is higher than what your service delivered; streams in the provider dashboard that finish long after your access log shows the client disconnected.",
            "**A buffering hop.** Compression or a proxy collects the whole body. Spot it: `curl -N` shows every frame at the same instant, and time to first delta equals total time.",
            "**Decoding each read on its own.** Spot it: `\\uFFFD` characters in hints written in Vietnamese or with emoji in the learner's code, at random positions.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Stream only text a person reads while it arrives; keep structured output and tool arguments non-streaming.",
            "Frames carry JSON deltas, the stream ends with an explicit `[DONE]`, and failures are sent as `event: error`.",
            "The parser keeps a buffer across chunks, acts on an event only at its empty line, and ignores comments and unknown fields.",
            "A stream without `[DONE]` is reported as cut: the partial text is shown and marked, never cached or counted as delivered.",
            "A closed client connection aborts the provider call; the server enforces the output length cap while streaming.",
            "Tests replay recorded chunks split at every position, plus cut, error and malformed streams.",
        ]),

        h2("Sources"),
        bullets([
            "WHATWG HTML Living Standard, Server-sent events (event stream format and parsing) - https://html.spec.whatwg.org/multipage/server-sent-events.html",
            "MDN Web Docs: Using readable streams, and TextDecoderStream",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "With your own API key, call the streaming endpoint of a real model provider (or a local model served by Ollama) and log every raw chunk with its length and a timestamp. Count how many chunks contained more than one event or less than one, measure time to first token against total time for a short and a long answer, and then cut the connection half way to see what your client reports. Keep the key in an environment variable on your machine, never in browser code."),
    ],
});
