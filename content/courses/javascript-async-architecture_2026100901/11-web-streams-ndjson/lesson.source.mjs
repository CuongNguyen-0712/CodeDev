// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-4-2",
    title: "Web Streams: parsing data as it arrives",
    slug: { _type: "slug", current: "web-streams-parsing-data-as-it-arrives" },
    description:
        "An analytics export preview freezes the tab on a 380 MB response, and the streaming rewrite silently drops rows and mangles names. Read fetch bodies as ReadableStreams, decode UTF-8 safely across chunks, build an NDJSON TransformStream, and let backpressure and cancellation keep memory flat.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend engineer, product analytics dashboard",
        problem:
            "Thursday, 16:30. A key account opens the preview of their 2-million-event export. The dashboard calls await res.json() on a 380 MB response: the tab freezes for a minute and crashes. Last sprint's \"streaming\" rewrite fixed the crash, but support now has two new tickets: about 0.3% of rows are missing from every large preview, and in exports from the Vietnam region customer names show up as \"Nguy��n\" instead of \"Nguyễn\". Small exports look perfect, so nobody caught it in QA.",
    },

    content: [
        h2("1. The incident"),
        p("The first version waited for the complete body and parsed it in one go. With 2 million rows, that means 380 MB of text, then a much larger object graph, all before the first row is shown. The rewrite read the body chunk by chunk - a good idea, implemented with two classic mistakes:"),
        code("javascript", `
const res = await fetch(\`/api/exports/\${exportId}.ndjson\`);
const reader = res.body.getReader();

while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const text = new TextDecoder().decode(value);   // mistake 1: decodes each chunk in isolation
    for (const line of text.split("\\n")) {         // mistake 2: assumes a chunk ends at a line break
        if (line) {
            try { preview.addRow(JSON.parse(line)); } catch { /* "bad row", skipped */ }
        }
    }
}`, "exportPreview.js"),
        p("Neither mistake shows up on a 20-row test export, which usually arrives as a single chunk. On a large export every chunk boundary is a coin toss: it can fall inside a row (two broken halves, both swallowed by the `catch`) or inside a multi-byte character (replacement characters in the name)."),
        callout("warning", "Silent data loss",
            "The empty catch turned a parsing bug into missing rows that nobody noticed. A streaming parser must report malformed rows, not swallow them - otherwise the bug you just introduced is invisible."),

        h2("2. response.body is a ReadableStream"),
        p("`fetch` resolves as soon as the response **headers** arrive. The body is exposed as a `ReadableStream<Uint8Array>` that fills up while the download continues. You read it through a reader:"),
        code("javascript", `
const res = await fetch(url);
if (!res.ok) throw new Error(\`HTTP \${res.status}\`);

const reader = res.body.getReader();     // locks the stream to this reader
let received = 0;
try {
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;                 // value is undefined here
        received += value.byteLength;    // value is a Uint8Array chunk
        progress.update(received);
    }
} finally {
    reader.releaseLock();                // unlock, even on error
}`),
        bullets([
            "A **chunk** is whatever the network stack and the buffers in between deliver. Its size has nothing to do with your rows, lines or characters.",
            "`getReader()` **locks** the stream. While locked, nothing else can read, pipe or tee it. Release the lock in `finally`, or let a pipe manage it for you.",
            "`res.json()`, `res.text()` and `res.arrayBuffer()` are convenience readers that consume the whole stream into memory first. They are fine for small responses only.",
        ]),
        challenge("chal_quiz_js_421"),

        h2("3. Bytes to text: TextDecoder in streaming mode"),
        p("UTF-8 uses 1 to 4 bytes per character: `é` is 2 bytes, `ễ` and `€` are 3, an emoji is 4. If a chunk ends after the first byte of `é`, that chunk alone is not valid UTF-8. A decoder used in **streaming mode** keeps the incomplete bytes and finishes the character with the next chunk:"),
        code("javascript", `
const decoder = new TextDecoder("utf-8");

decoder.decode(bytes, { stream: true });  // "more input will follow": keep a trailing partial character
decoder.decode();                         // end of input: flush whatever is left`),
        p("Two rules follow:"),
        numbered([
            "Create **one** decoder per stream and reuse it for every chunk - a new decoder per chunk has no memory of the previous one.",
            "Call `decode()` without arguments once at the end. If the download was cut off mid-character, this produces a visible `U+FFFD` instead of silently dropping bytes.",
        ]),
        callout("tip", "Let the platform do it",
            "TextDecoderStream is a TransformStream that applies exactly these rules: res.body.pipeThrough(new TextDecoderStream()) yields strings with every character intact. Use new TextDecoder('utf-8', { fatal: true }) when invalid bytes must fail loudly instead of becoming replacement characters - for example when importing data into a database."),
        challenge("chal_fix_js_422", "One decoder for the whole stream, told that more chunks will follow - and told when they stop."),

        h2("4. Text to rows: a TransformStream for NDJSON"),
        p("NDJSON (newline-delimited JSON) puts one JSON value per line. It is the friendliest streaming format: unlike one giant JSON array, every complete line can be parsed on its own, as soon as it arrives. The hard part is the line that is still incomplete when a chunk ends - it has to wait in a buffer for the rest."),
        p("Keep the parsing logic in a small, synchronous object that knows nothing about streams, then adapt it to a `TransformStream`. The object is trivial to unit test; the adapter is three lines:"),
        code("javascript", `
function ndjsonStream() {
    const parser = createNdjsonParser();       // { push(text) -> rows[], flush() -> rows[] }
    return new TransformStream({
        transform(chunk, controller) {
            for (const row of parser.push(chunk)) controller.enqueue(row);
        },
        flush(controller) {                     // the source closed: emit a last line without "\\n"
            for (const row of parser.flush()) controller.enqueue(row);
        },
    });
}

const rows = res.body
    .pipeThrough(new TextDecoderStream())       // Uint8Array -> string
    .pipeThrough(ndjsonStream());               // string -> row objects`, "ndjsonStream.js"),
        image("ndjson-stream-pipeline", {
            alt: "Pipeline from Export API through response.body, TextDecoderStream and an NDJSON transform to the consumer, with a backpressure arrow pointing back. Below, three raw chunks split inside the é character and inside rows, and the clean rows produced after decoding and line buffering.",
            caption: "Chunks split anywhere. The decoder holds incomplete bytes and the parser holds the incomplete line, so every row comes out whole - as soon as its newline arrives.",
        }),
        p("A production-grade parser also has to cope with what real files contain:"),
        bullets([
            "**CRLF** line endings from exports generated on Windows or by some CSV-to-NDJSON tools.",
            "**Blank lines**, often a trailing one, which must not count as malformed rows.",
            "A **last line without a newline**: it only becomes complete when the stream closes, which is what `flush` is for.",
            "**Malformed rows**: report them with their line number and keep going, so one bad row does not abort a 2-million-row preview.",
        ]),
        challenge("chal_coding_js_423", "Only the text after the last newline is unfinished. Count every physical line, including blank ones, so the reported line numbers match the file."),

        h2("5. Backpressure: the pull model"),
        p("Each stream keeps a small internal queue. Its **highWaterMark** says how much it wants to hold; `controller.desiredSize` is how much room is left. A `ReadableStream` calls its source's `pull()` only while there is room - so a consumer that reads slowly automatically slows down everything upstream, all the way to the TCP connection and the server."),
        code("javascript", `
// A custom source over a paginated event API: pull() is only called when the queue has room.
function eventStream(api) {
    let cursor = null;
    return new ReadableStream({
        async pull(controller) {
            let page;
            do {
                page = await api.events({ cursor });
                cursor = page.nextCursor;
            } while (page.items.length === 0 && cursor !== null);   // enqueue or close before returning

            for (const event of page.items) controller.enqueue(event);
            if (cursor === null) controller.close();
        },
        cancel(reason) {
            api.abortPending(reason);           // the consumer gave up - stop producing
        },
    }, new CountQueuingStrategy({ highWaterMark: 200 }));
}`),
        p("The consumer controls the pace simply by not reading. Rendering in batches and yielding a frame between them keeps the UI responsive **and** applies backpressure:"),
        code("javascript", `
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const reader = rows.getReader();
let batch = [];

while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    batch.push(value);
    if (batch.length === 500) {
        table.appendRows(batch);
        batch = [];
        await nextFrame();                       // no read() while we wait -> upstream pauses
    }
}
table.appendRows(batch);`),
        callout("error", "enqueue() does not wait",
            "A push-style source that calls controller.enqueue() in a loop or from every socket message ignores backpressure: the queue just keeps growing. Either produce from pull(), or check controller.desiredSize and pause the underlying source when it drops to 0 or below."),

        h2("6. Cancelling a stream"),
        p("A user who closes the preview after 300 rows should not keep downloading 380 MB in the background. There are three ways to stop, and they all propagate **upstream** through every `pipeThrough`:"),
        bullets([
            "`reader.cancel(reason)` - discard queued chunks and tell the source to stop. For a fetch body, this aborts the download.",
            "An `AbortController` passed to `fetch({ signal })` - aborting rejects pending reads with an `AbortError`. `pipeTo(dest, { signal })` accepts a signal too.",
            "Leaving a `for await (const chunk of stream)` loop early - async iteration cancels the stream on `break` unless you ask for `stream.values({ preventCancel: true })`.",
        ]),
        code("javascript", `
const controller = new AbortController();
preview.onClose(() => controller.abort());

try {
    const res = await fetch(url, { signal: controller.signal });
    const rows = res.body.pipeThrough(new TextDecoderStream()).pipeThrough(ndjsonStream());
    for await (const row of rows) {
        if (row.error) preview.reportBadRow(row.line);
        else preview.addRow(row);
    }
} catch (error) {
    if (error.name !== "AbortError") throw error;
}`),
        callout("info", "Browser support",
            "Async iteration over a ReadableStream is newer than getReader(). Check it against your browser support matrix, or keep the getReader() loop, which works everywhere. The same code runs unchanged in Node.js 18+, where fetch also returns Web Streams."),

        h2("7. Checklist"),
        bullets([
            "Never `res.json()` or `res.text()` an unbounded response; read `res.body` as a stream.",
            "Treat chunk boundaries as random: they split rows and multi-byte characters.",
            "Decode with one `TextDecoder` and `{ stream: true }`, flush with a final `decode()` - or use `TextDecoderStream`.",
            "Buffer the incomplete last line between chunks; emit complete rows immediately and the final line in `flush`.",
            "Report malformed rows with a line number instead of swallowing them.",
            "Let the consumer's pace drive the producer: produce in `pull()`, respect `desiredSize`, render in batches.",
            "Wire cancellation end to end: `AbortController` on `fetch`, `reader.cancel()` or leaving `for await`, `cancel()` in custom sources.",
        ]),
    ],
});
