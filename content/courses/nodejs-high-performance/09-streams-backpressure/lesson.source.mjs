// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-nodejs-hp-3-3",
    title: "Streams & backpressure",
    slug: { _type: "slug", current: "streams-backpressure" },
    description:
        "The month-end ledger export loads a million rows into memory and the pod is OOM-killed. Stream the rows from a database cursor to the client instead, understand highWaterMark, write() returning false and the 'drain' event, and use pipeline() and for await so errors and disconnects clean everything up.",
    estimatedTime: 25,

    scenario: {
        role: "Backend engineer, finance platform of an e-wallet",
        problem:
            "Month-end close, 09:00. The finance team clicks \"Export ledger (CSV)\" for October: 1.2 million transactions. The export pod's memory climbs from 180 MB to 2 GB in forty seconds and Kubernetes OOM-kills it - taking down the other API routes served by the same pod. A first fix that streams rows from the database still dies, just more slowly, whenever the export is downloaded over a slow VPN.",
    },

    content: [
        h2("1. The incident"),
        p("The original export handler was written for a few thousand rows and never revisited:"),
        code("javascript", `
app.get("/exports/ledger.csv", async (req, res) => {
    const rows = await db.query("SELECT id, wallet_id, amount, created_at FROM ledger WHERE month = $1", [req.query.month]);
    const csv = rows.map(toCsvLine).join("");           // 1.2M rows -> one huge string
    res.type("text/csv").send(HEADER + csv);
});`, "exports.js"),
        p("Everything is materialized at once: the full result set as JavaScript objects, then the whole CSV as one string, then the response body. Peak memory is several times the size of the export, and it grows with every month of business."),
        p("The answer is to process the data **as a stream**: read a page of rows, turn it into CSV lines, hand them to the socket, and only then read the next page. Memory then depends on the buffer sizes, not on the number of rows."),
        callout("info", "Streams are the default for big data in Node.js",
            "HTTP requests and responses, files, sockets, zlib, child process stdio and most database drivers' cursors are all streams. If a payload can be large or unbounded, design the code path around a stream from the start."),

        h2("2. Readable, Writable and highWaterMark"),
        p("Node.js streams come in four flavours, and an export uses all of them:"),
        bullets([
            "**Readable** - a source you consume: a database cursor, `fs.createReadStream`, an incoming request.",
            "**Writable** - a destination you write to: the HTTP response, a file, an S3 upload.",
            "**Transform** - both at once, changing data on the way: CSV formatting, gzip.",
            "**Duplex** - independent read and write sides, like a TCP socket.",
        ]),
        p("Every stream has an internal buffer, and `highWaterMark` is how full that buffer is allowed to get before the stream asks for a pause: 16 KB by default for byte streams, 16 objects for object-mode streams. It is a **threshold, not a hard limit** - nothing stops you from writing past it, which is exactly the problem in the next section."),
        code("javascript", `
import { Readable } from "node:stream";

// An async generator becomes a Readable; each yielded row is one object-mode chunk.
async function* ledgerRows(month) {
    let lastId = 0;
    while (true) {
        const page = await db.query(
            "SELECT id, wallet_id, amount, created_at FROM ledger WHERE month = $1 AND id > $2 ORDER BY id LIMIT 1000",
            [month, lastId]
        );
        if (page.length === 0) return;
        yield* page;
        lastId = page[page.length - 1].id;
    }
}

const source = Readable.from(ledgerRows("2026-10"));   // objectMode, highWaterMark 16 rows`, "ledgerRows.js"),
        p("Keyset pagination (`id > $2 ORDER BY id`) keeps each page cheap no matter how deep into the table you are - unlike `OFFSET`, which rescans everything it skips."),

        h2("3. Backpressure: write() returning false"),
        p("A database on the same network can produce rows far faster than a finance analyst on a hotel VPN can download them. When the consumer is slower than the producer, something has to give: either the producer slows down, or the difference piles up in memory. **Backpressure** is the mechanism that makes the producer slow down."),
        p("For a Writable it is a tiny protocol built on the return value of `write()`:"),
        challenge("chal_quiz_nhp_321"),
        p("In code, the protocol looks like this - the important part is that the loop actually **waits**:"),
        code("javascript", `
import { once } from "node:events";

for (const chunk of chunks) {
    if (!dest.write(chunk)) {
        await once(dest, "drain");    // buffer is full: wait until it has been flushed
    }
}
dest.end();`),
        image("backpressure-pipeline", {
            alt: "A database cursor, a CSV transform, gzip and the HTTP response connected left to right. The response buffer is full at 16 KB, write() returns false, and a dashed arrow carries backpressure back to the cursor until 'drain' fires.",
            caption: "Data flows right, backpressure flows left. The slow client sets the pace and memory stays at a few buffers.",
        }),
        callout("error", "Ignoring the return value is a memory leak with extra steps",
            "If you keep calling write() after it returned false, every chunk is still accepted and queued. The process does not crash at the point of the bug; it slowly grows until the container is OOM-killed - usually only for the biggest export and the slowest client, which is why it passes every test on localhost."),
        p("This is exactly what the \"streaming\" version of the export from the scenario did. Fix it:"),
        challenge("chal_fix_nhp_322", "write() has already accepted the chunk when it returns false - do not write it again. Turn the 'drain' event into a promise and await it before the next write."),

        h2("4. pipeline() and for await"),
        h3("Let pipeline() wire the stages"),
        p("Hand-written write/drain loops are fine for one destination. For a chain of streams, `pipeline()` from `node:stream/promises` connects them with backpressure between every pair - and handles the part people forget: what happens when something fails halfway."),
        code("javascript", `
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { createGzip } from "node:zlib";

app.get("/exports/ledger.csv.gz", async (req, res) => {
    res.type("text/csv").set("Content-Encoding", "gzip");

    const toCsv = new Transform({
        writableObjectMode: true,
        transform(row, _enc, callback) {
            callback(null, \`\${row.id},\${row.wallet_id},\${row.amount},\${row.created_at.toISOString()}\\n\`);
        },
    });

    try {
        await pipeline(Readable.from(ledgerRows(req.query.month)), toCsv, createGzip(), res);
    } catch (err) {
        // Client went away (ERR_STREAM_PREMATURE_CLOSE) or the DB failed: every stream is already destroyed.
        req.log.warn({ err }, "ledger export aborted");
    }
});`, "exports.js"),
        challenge("chal_quiz_nhp_323"),
        callout("warning", "Headers are sent with the first byte",
            "Once streaming has started, you can no longer change the status code to 500. Validate input and open the cursor before the first write, and for exports that must be all-or-nothing, write to object storage first and give the user a download link."),

        h3("Consume streams with for await"),
        p("Every Readable is an async iterable. `for await` pulls one chunk at a time, so a slow loop body is natural backpressure on the source - and breaking out of the loop or throwing destroys the stream for you:"),
        code("javascript", `
// Reconcile an uploaded bank statement line by line, without loading the file.
import { createInterface } from "node:readline";

const lines = createInterface({ input: req, crlfDelay: Infinity });
let lineNumber = 0;
for await (const line of lines) {
    lineNumber++;
    if (lineNumber === 1) continue;                // header
    await reconcile(parseStatementLine(line));     // the next line is read only after this resolves
}`),
        p("An async generator can also be a stage inside `pipeline()`: `pipeline(source, async function* (rows) { for await (const row of rows) yield toCsvLine(row); }, res)` - a Transform without the boilerplate."),

        h2("5. Choosing buffer sizes and spotting problems"),
        numbered([
            "**Leave the defaults first.** 16 KB / 16 objects is a good starting point; raise `highWaterMark` (for example to 64 KB for file copies) only when profiling shows throughput limited by too many small writes.",
            "**Batch at the source, stream at the edge.** Fetch 500-5,000 rows per database round trip, but emit them one by one into the stream so backpressure still works.",
            "**Watch the right metrics.** `res.writableLength` (bytes buffered right now), process RSS during the biggest export, and how long each export stays open.",
            "**Set timeouts.** A client that stops reading entirely holds a cursor and a connection forever; use a request timeout or `stream.setTimeout` and let `pipeline()` clean up.",
        ]),
        callout("tip", "Test with a slow consumer",
            "Backpressure bugs never show up on localhost, where the client reads as fast as you write. In tests, use a fake writable that returns false and drains later; manually, download through curl --limit-rate 100k and watch the process memory."),

        h2("6. Checklist"),
        bullets([
            "Never materialize large or unbounded results: read with a cursor or keyset pagination and stream the output.",
            "Respect `write()`: when it returns false, stop and wait for `'drain'` before writing again.",
            "Connect stages with `await pipeline(...)` from `node:stream/promises`, not `.pipe()` chains, so errors and disconnects destroy every stream.",
            "Consume Readables with `for await`, and use async generators as sources or transforms.",
            "Validate and open resources before the first byte; after that, the status code is fixed.",
            "Test exports with a slow consumer and measure RSS on the largest real data set.",
        ]),
    ],
});
