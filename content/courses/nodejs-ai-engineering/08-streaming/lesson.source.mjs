// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-nae-3-2",
    title: "Streaming answers over SSE & handling a broken stream",
    slug: { _type: "slug", current: "streaming-sse-broken-stream" },
    description:
        "The AI tutor streamed its hints to the browser, and when a proxy closed the connection half-way, the learner was left with half a sentence that was saved as a finished hint, with Vietnamese characters turned into question marks on the way. Learn how Server-Sent Events are framed, why a stream must be parsed with a buffer across chunks and a streaming UTF-8 decoder, how to tell a complete answer from a truncated one, what to do with an error in the middle of a stream, and when not to stream at all.",
    estimatedTime: 25,

    scenario: {
        role: "Backend developer, CodeDev AI tutor",
        problem:
            "Support has three tickets about the AI tutor from the same afternoon. One learner's hint stops at \"To fix the off-by-one, change the loop condition to\" and the hint history shows it as a normal, finished hint. Two learners who use the Vietnamese interface see hints like \"G��i ý: hãy ki��m tra\" with replacement characters in the middle of words. The tutor streams answers from the AI gateway to the browser over Server-Sent Events; the browser code reads the response body chunk by chunk and stops when the reader is done.",
    },

    content: [
        h2("1. The incident: half a hint, saved as a whole one"),
        p("Streaming makes the tutor feel fast: the first words appear after a few hundred milliseconds instead of after the whole answer is written. The browser code that shipped with the feature was short:"),
        code("typescript", `
// web/tutor/stream.ts - the version that shipped
const response = await fetch("/api/tutor/hint", { method: "POST", body: JSON.stringify(request) });
const reader = response.body!.getReader();
let text = "";
while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = new TextDecoder().decode(value);            // a new decoder for every chunk
    for (const event of chunk.split("\\n\\n")) {               // assumes a chunk holds whole events
        if (event.startsWith("data: ") && event !== "data: [DONE]") {
            text += JSON.parse(event.slice(6)).delta;
            render(text);
        }
    }
}
await saveHint({ challengeId, text, status: "done" });        // the loop ended, so it must be done`, "stream.ts"),
        p("It worked on every developer laptop, because a local connection usually delivers each event in its own chunk. It failed in production in three different ways, and the code has one assumption behind each: that a chunk is a whole number of events, that a chunk is a whole number of characters, and that the end of the stream means the end of the answer."),

        h2("2. Read the evidence"),
        p("First, the saved hint. The row says `done`, but the text stops mid-sentence:"),
        code("sql", `
SELECT id, status, length(text) AS chars, right(text, 40) AS ending, created_at
FROM tutor_hints WHERE id = 'hint_77310';

 id         | status | chars | ending                                   | created_at
------------+--------+-------+------------------------------------------+---------------------
 hint_77310 | done   |    51 | ne, change the loop condition to         | 2026-10-22 15:04:31`, "psql"),
        p("Then the edge proxy, for the same request. The connection was closed by the proxy, not finished by the gateway:"),
        code("text", `
2026-10-22T15:04:31.208Z POST /api/tutor/hint 200 bytes_sent=412 duration=30001ms upstream_status=200 termination=idle_timeout`, "edge proxy log"),
        p("A `200` and a closed connection at the same time is normal for streaming: the status line and headers are sent before the first word of the answer, so the status can only ever say \"the stream started\". The gateway had paused for more than 30 seconds while the model was waiting in a queue, the proxy's idle timeout closed the connection, and `reader.read()` simply returned `done: true`. The browser could not tell this end from a real one, because it never looked for the marker that the gateway sends last."),
        p("You can watch the raw stream without a browser. `curl -N` turns off output buffering, so every event appears as it arrives:"),
        code("bash", `
curl -N -X POST https://api.codedev.test/tutor/hint \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"challengeId":"chal_ts_042","question":"why does my loop fail?"}'

data: {"delta":"To fix the off-by-one, "}

data: {"delta":"change the loop condition to"}

curl: (18) transfer closed with outstanding read data remaining`, "terminal"),
        p("The replacement characters have a different cause. In UTF-8, Vietnamese letters such as `ợ` and `ể` take three bytes. When the network splits a stream between the first and the second byte of `ợ`, a fresh `TextDecoder` sees an incomplete character at the end of one chunk and an orphan byte at the start of the next, and turns both into U+FFFD. The same split, one level up, breaks events: half of `data: {\"delta\":\"Gợi` in one chunk is not valid JSON."),

        h2("3. The core idea: a stream is a protocol, not a string"),
        p("Server-Sent Events (SSE) is a small text format defined in the HTML Living Standard and served as `text/event-stream`. Every model provider streams something similar, but the event names and payloads differ by provider and change between API versions, so the CodeDev gateway reads the provider's stream and sends the browser one stable format of its own. The rules the browser needs:"),
        bullets([
            "The stream is UTF-8 text made of **lines**. A line is a **field**: `data: ...`, `event: ...`, `id: ...` or `retry: ...`. The value starts after the colon, with one leading space removed. A line that starts with `:` is a comment; servers send them as keep-alives.",
            "An **empty line ends an event**. All `data` lines of one event are joined with a newline. `event:` names the event; an event without a name is a `message`.",
            "An event that has not received its empty line yet is **not finished**. If the connection ends first, that event is dropped, not delivered half-done.",
            "The gateway's own contract on top: each `message` carries `{\"delta\": \"...\"}`, the last one is `data: [DONE]`, and a failure is sent as `event: error` with a readable message. **No `[DONE]`, no complete answer.**",
        ]),
        p("Those rules lead directly to the parser's shape: decode bytes with **one** decoder for the whole stream (`decoder.decode(chunk, { stream: true })` keeps an incomplete character for the next call); keep the text after the last newline in a **buffer** for the next chunk; handle complete lines only; and decide the final status from what arrived, not from the fact that the reader finished."),
        callout("info", "Why not EventSource?",
            "The browser's built-in EventSource parses SSE for you, but it can only send GET requests without a body, and it reconnects automatically, which for an LLM answer means asking the model again and paying again. For a POST with the learner's question, the tutor uses fetch and reads the body itself. Keep the parser in one small module with its own tests, like the one in this lesson."),
        h3("Three ways a stream ends"),
        numbered([
            "**Complete**: the `[DONE]` event arrived. Save the hint, mark it done.",
            "**Error**: the gateway sent `event: error` (the provider failed, a rate limit, a safety stop). Keep the text received so far on screen, show the message, and offer Retry.",
            "**Truncated**: the bytes ended without either. Something between the gateway and the browser closed the connection. Show the partial text as interrupted, never save it as a finished hint, and offer Retry. Do not assume the provider can continue a stream where it stopped: in this course, a retry asks for the whole answer again, under the retry limits of lesson 2.1.",
        ]),
        h3("When not to stream"),
        bullets([
            "**Structured output.** A JSON object you must validate against a schema (lesson 1.3) cannot be validated until the last byte arrives. Stream only text a person reads.",
            "**Answers that need a check before anyone sees them.** If every hint must pass a solution-leak check (lesson 4.1), streaming shows words before the check has run. Either buffer server-side and release checked sentences, or do not stream that feature.",
            "**Short or background answers.** A two-line answer that takes under a second, or feedback that is emailed, gains nothing from streaming and pays for its complexity: proxy settings, a parser, three end states.",
        ]),

        challenge("chal_quiz_nae_321"),

        h2("4. Worked example: the server side"),
        p("The gateway's route sends the browser the stable format and does three things the incident showed were missing: it sends a keep-alive comment while the model is silent, so idle timeouts do not fire; it always ends with `[DONE]` or an `error` event; and it stops the upstream request when the learner leaves:"),
        code("typescript", `
// api/tutor/hint.ts - the gateway route (framework-neutral)
export async function streamHint(req: Request, session: Session): Promise<Response> {
    const upstream = new AbortController();
    req.signal.addEventListener("abort", () => upstream.abort());     // the learner closed the tab

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (text: string) => controller.enqueue(encoder.encode(text));
            const keepAlive = setInterval(() => send(": keep-alive\\n\\n"), 15_000);
            try {
                for await (const delta of llm.streamText(buildPrompt(req, session), { signal: upstream.signal })) {
                    send(\`data: \${JSON.stringify({ delta })}\\n\\n\`);
                }
                send("data: [DONE]\\n\\n");
            } catch (error) {
                if (!upstream.signal.aborted) send(\`event: error\\ndata: \${publicMessage(error)}\\n\\n\`);
            } finally {
                clearInterval(keepAlive);
                controller.close();
            }
        },
    });
    return new Response(body, {
        headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
    });
}`, "hint.ts"),
        bullets([
            "`llm.streamText` is the gateway's provider-neutral interface from lesson 1.1. In tests it is a fake that yields recorded deltas, then stops early or throws, so all three end states are covered without a real model.",
            "Aborting the upstream request when the learner leaves stops the model from writing an answer nobody will read. Whether a cancelled stream is still billed in full depends on the provider; check its documentation and measure it with the usage numbers from lesson 3.3.",
            "Pick the keep-alive interval from the shortest idle timeout on the path (load balancer, proxy, CDN). Look the values up in their configuration; do not guess them.",
            "`publicMessage` maps internal errors to text that is safe to show. A stack trace or a provider key never goes into the stream.",
            "Some reverse proxies buffer responses before sending them on, which turns a stream into one late block. If the first event arrives only at the end in the Network panel, check the proxy's buffering settings for this route.",
        ]),
        h3("The browser side"),
        p("With a parser that takes the bytes and returns a status, the browser code becomes a small state machine: render the text as it grows, then act on the status. The parser is the part worth testing hard, and it is your exercise. Here is how it is used:"),
        code("typescript", `
const result = await readHintStream(response.body!, (textSoFar) => render(textSoFar));

switch (result.status) {
    case "complete":
        await saveHint({ challengeId, text: result.text, status: "done" });
        break;
    case "error":
        showBanner(\`The tutor stopped: \${result.error}\`, { retry: true });
        break;
    case "truncated":
        showBanner("The answer was interrupted.", { retry: true });   // shown, never saved as done
        metrics.increment("tutor.stream.truncated");
        break;
}`, "web/tutor/useHint.ts"),

        h2("5. Your turn: assemble a recorded stream"),
        p("The exercise gives you the bytes of a recorded stream, already cut into chunks at the places the network cut it: in the middle of an event, between `\\r` and `\\n`, inside a three-byte Vietnamese letter, one byte at a time. Return the status, the text received and the error message, following the SSE rules above and the gateway's contract."),
        challenge("chal_coding_nae_322"),

        h2("6. How to verify"),
        bullets([
            "**Replay recordings with hostile cuts.** Save real streams with `curl -N ... > hint.sse`, then feed them to the parser cut at every byte offset, not just at event boundaries. A parser that passes for every single cut position is correct for any network.",
            "**Reproduce truncation in DevTools.** In the Network panel, open the hint request and watch the **EventStream** tab fill up; then switch throttling to **Offline** in the middle of an answer. The UI must show \"interrupted\", and the `tutor_hints` table must have no new `done` row.",
            "**Count end states.** A dashboard with `complete`, `error` and `truncated` per hour. Truncations that cluster at one duration (30 s in the incident) point at an idle timeout; truncations after a deploy point at the proxy configuration.",
            "**Check the data.** `SELECT count(*) FROM tutor_hints WHERE status = 'done' AND strpos(text, chr(65533)) > 0` finds hints that were saved with replacement characters. It must stay at zero after the fix.",
        ]),

        h2("7. Common mistakes"),
        bullets([
            "**`new TextDecoder().decode(chunk)` per chunk.** Breaks any character split between chunks. Spot it by the U+FFFD character in saved text, mostly in non-English answers.",
            "**`chunk.split(\"\\n\\n\")` per chunk.** Assumes events never cross chunk boundaries. Spot it with a test that cuts a recording in the middle of an event: deltas go missing or `JSON.parse` throws.",
            "**\"The reader finished, so the answer is done.\"** The incident itself. Spot it by searching for the code that runs after the read loop: it must check for the done marker, not just for the end.",
            "**Treating `200 OK` as success for a stream.** The status is sent before the body. Spot it when error tracking shows zero failures for an endpoint whose users report broken answers.",
            "**Caching or saving partial answers.** A truncated answer in a cache is served again to the next learner who asks (lesson 4.2). Spot it by checking that every write of an answer depends on the `complete` status.",
        ]),

        h2("8. Summary"),
        numbered([
            "SSE is a line-based protocol: decode the bytes with one streaming UTF-8 decoder, keep incomplete lines in a buffer across chunks, and end an event only at its empty line.",
            "The end of the bytes is not the end of the answer. Only the done marker means complete; an error event means stopped with a reason; anything else is truncated and must never be saved or cached as a finished answer.",
            "Make the server side robust too: keep-alive comments against idle timeouts, an explicit final event, and cancelling the upstream request when the learner leaves. Do not stream output that must be validated or checked before anyone reads it.",
        ]),

        h2("Sources"),
        bullets([
            "HTML Living Standard, Server-sent events: the event stream format and how to interpret it - html.spec.whatwg.org/multipage/server-sent-events.html",
            "Encoding Standard and MDN Web Docs: TextDecoder.decode() and its stream option",
            "Your provider's current streaming documentation, for its event names, payloads and final event",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Record three real streams from any LLM feature you can reach (or from the fake model of lesson 1.1): one complete, one where you kill the connection, one with an error. Write a test that feeds each one to your parser cut at every byte offset and checks the status and text. Then find the idle timeout of every proxy between your server and the browser and write it down next to your keep-alive interval."),
    ],
});
