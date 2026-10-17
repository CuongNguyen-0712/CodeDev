// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-js-4-3",
    title: "Producer/consumer with a bounded async queue",
    slug: { _type: "slug", current: "producer-consumer-bounded-async-queue" },
    description:
        "Dropping 800 photos into a chat makes the thumbnailer outrun the uploader until the tab is killed. Decouple producers and consumers with a bounded async queue: push waits when it is full, pull waits when it is empty, close drains cleanly, and consumers read it with for await.",
    estimatedTime: 24,

    scenario: {
        role: "Frontend engineer, web client of a team chat app",
        problem:
            "Tuesday, 14:20. A field technician drags 800 photos from a site inspection into a chat on an iPad. A Web Worker turns each photo into a compressed preview in about 40 ms, but the uploads over the site's 4G connection take about 2 seconds each. The previews pile up in an array - after a minute the tab holds 1.6 GB of blobs and Safari reloads the page, losing the whole batch. On desktops it \"works\", while the fans spin up from the consumer's 50 ms polling loop.",
    },

    content: [
        h2("1. The incident"),
        p("The upload flow was split into two parts that share a plain array:"),
        code("javascript", `
const pending = [];

// Producer: fast (about 40 ms per photo in a Web Worker)
async function addPhotos(files) {
    for (const file of files) {
        pending.push({ file, preview: await thumbnails.render(file) });
    }
}

// Consumer: slow (about 2 s per upload on 4G)
async function uploadLoop() {
    while (true) {
        const job = pending.shift();
        if (!job) {
            await sleep(50);                 // poll: is there anything yet?
            continue;
        }
        await upload(job);
    }
}`, "photoUpload.js"),
        p("Splitting the work was the right idea: rendering and uploading run at different speeds and should not block each other. But the array between them has three flaws:"),
        bullets([
            "**Unbounded**: the producer never slows down. After 60 seconds there are about 1,500 previews rendered and 30 uploaded; memory grows with the difference.",
            "**Polling**: an empty array is checked 20 times per second forever, even when nothing will ever arrive - and every item waits up to 50 ms for no reason.",
            "**No end**: the consumer cannot tell \"nothing yet\" from \"nothing ever again\", so the loop never finishes and nobody knows when the batch is done.",
        ]),

        h2("2. Decoupling with a bounded buffer"),
        p("The **producer/consumer** pattern puts a queue between the code that creates work and the code that performs it. It shows up everywhere in frontends: uploads, analytics events batched for sending, messages from a WebSocket written to IndexedDB, chunks handed to a Web Worker."),
        bullets([
            "Producers and consumers can have **different speeds** and still run concurrently.",
            "There can be **several of each**: the file picker, drag-and-drop and paste all produce; two upload slots consume.",
            "The buffer absorbs **bursts**: 30 photos dropped at once do not have to be uploaded at once.",
        ]),
        p("A buffer only absorbs bursts. If the producer is faster **on average**, any buffer eventually fills up, and you have to decide what happens then. That is the most important design decision of the queue:"),
        numbered([
            "**Wait (backpressure)**: `push()` returns a promise that stays pending until there is room. The producer pauses. Right for uploads, exports, anything where every item matters.",
            "**Drop the newest or the oldest**: right for telemetry or \"latest value wins\" data such as cursor positions or progress updates.",
            "**Fail**: reject the push and let the caller decide - useful at system boundaries, for example a chat composer that tells the user to slow down.",
        ]),
        callout("info", "Not a concurrency limiter",
            "A worker pool limits how many tasks run at the same time. A bounded queue limits how much finished-but-unconsumed work can pile up between two stages. Real pipelines often use both: the queue between stages, a pool inside a stage."),

        h2("3. Waiting without polling"),
        p("An async queue never polls. When an operation cannot complete yet, it returns a promise and **stores that promise's `resolve` function** in a waiting list. The opposite operation settles it later. The idea in its smallest form - a mailbox for socket messages with one waiting list:"),
        code("javascript", `
function createMailbox(socket) {
    const backlog = [];
    const waiting = [];                       // resolve functions of pending receive() calls

    socket.addEventListener("message", (event) => {
        const resolve = waiting.shift();
        if (resolve) resolve(event.data);     // someone is waiting: hand it over directly
        else backlog.push(event.data);        // nobody is waiting: keep it
    });

    return {
        receive() {
            if (backlog.length > 0) return Promise.resolve(backlog.shift());
            return new Promise((resolve) => waiting.push(resolve));
        },
    };
}`),
        p("The mailbox is unbounded - the socket cannot be paused, so it can only keep or drop. A bounded queue needs **two** waiting lists, one for each side:"),
        bullets([
            "**Waiting consumers** exist only while the buffer is empty. A `push()` should hand its item straight to the oldest one.",
            "**Waiting producers** exist only while the buffer is full. When a `pull()` takes an item and frees a slot, the oldest waiting producer's item moves into the buffer and its `push()` resolves.",
            "Both lists are FIFO, so items leave in the order their `push()` was called and nobody starves.",
        ]),
        image("bounded-queue-states", {
            alt: "Two producers push into a buffer of capacity 3 holding img 7, img 8 and img 9; a waiting push of img 10 sits below it. Two uploaders pull from the right. Three cards describe the states: has room, full, and empty or closed.",
            caption: "Every push and pull has to handle three states. Waiting producers only exist while the buffer is full, waiting consumers only while it is empty.",
        }),

        h2("4. Close semantics"),
        p("Without a way to end, a consumer loop can never finish. `close()` means **\"no new items\"** - not \"throw away what you have\". Get the details right, because each mistake fails in a different, quiet way:"),
        bullets([
            "Items that were already accepted are still delivered. A consumer only sees the end, `{ done: true }`, after the buffer has drained.",
            "Consumers waiting on an empty queue are woken with `{ done: true }`. Forgetting this leaves their `for await` loops hanging forever, holding whatever they hold.",
            "`push()` after `close()` rejects with an error such as `QUEUE_CLOSED`. Dropping it silently hides a race in the producer.",
            "The end of the stream is a normal outcome, not a failure: pending pulls resolve, they do not reject. If you need to signal a failure, add a separate `fail(error)` that makes every pull reject.",
        ]),
        challenge("chal_quiz_js_431"),

        h2("5. The queue as an async iterator"),
        p("Consumers should not have to write `pull()` loops by hand. If the queue implements `[Symbol.asyncIterator]`, a consumer is one `for await` loop, which ends by itself when the queue is closed and drained:"),
        code("javascript", `
const queue = createAsyncQueue({ capacity: 8 });

async function addPhotos(files) {
    try {
        for (const file of files) {
            const preview = await thumbnails.render(file);
            await queue.push({ file, preview });   // pauses while 8 previews are waiting
        }
    } finally {
        queue.close();                             // also on error: let the uploaders finish
    }
}

async function uploader(slot) {
    for await (const job of queue) {               // ends after close() and the last item
        await upload(job, { slot });
    }
}

await Promise.all([addPhotos(files), uploader(1), uploader(2)]);
ui.showDone();`, "photoUpload.js"),
        p("Memory now has a hard ceiling: at most 8 buffered previews plus the one waiting inside a pending `push()`, plus the two being uploaded - no matter whether 8 or 8,000 photos are dropped. The producer renders exactly as fast as the uploads drain, and when the last upload finishes, `Promise.all` resolves."),
        callout("tip", "Two consumers, one queue",
            "Unlike a single generator object, the queue hands out a new iterator to each for await loop, and all of them pull from the same buffer. Each job goes to exactly one uploader - whichever asks first."),
        challenge("chal_coding_js_432", "Handle the three states in each operation: has room, full and empty. A push into an empty queue with a waiting consumer should hand the item over directly; a pull that frees a slot should admit the oldest waiting producer."),

        h2("6. Backpressure across a Web Worker"),
        p("`postMessage` has no backpressure: a worker can post previews much faster than the main thread can use them, and every message is queued in memory. Carry the queue's signal across the boundary with **credits**: the worker renders only as many previews as the main thread has asked for."),
        code("javascript", `
// main thread
const WINDOW = 4;
worker.onmessage = async ({ data: job }) => {
    await queue.push(job);                       // waits while the queue is full
    worker.postMessage({ type: "credit", count: 1 });
};
worker.postMessage({ type: "start", files, credits: WINDOW });

// thumbnail.worker.js
let credits = 0;
let next = 0;
let files = [];
let rendering = false;

self.onmessage = ({ data }) => {
    if (data.type === "start") {
        files = data.files;
        credits = data.credits;
    } else if (data.type === "credit") {
        credits += data.count;
    }
    pump();
};

async function pump() {
    if (rendering) return;
    rendering = true;
    while (credits > 0 && next < files.length) {
        credits -= 1;
        const file = files[next++];
        self.postMessage({ file, preview: await renderPreview(file) });
    }
    rendering = false;
}`),
        p("At most `WINDOW` previews are ever in flight between the worker and the queue, so the bound holds end to end - from rendering, through the queue, to the uploader."),
        callout("warning", "Every unbounded hop breaks the bound",
            "A bounded queue only protects memory if every stage in front of it waits too. An unbounded postMessage, a push() that is not awaited, or an event listener that pushes without checking the result each recreates the original array."),

        h2("7. Checklist"),
        bullets([
            "Put a queue between stages that run at different speeds; never share a plain array and poll it.",
            "Bound it, and choose deliberately what happens when it is full: wait, drop newest or oldest, or fail.",
            "Wait with stored `resolve` functions - one FIFO list for waiting producers, one for waiting consumers.",
            "Producers must `await push()`; that pending promise is the backpressure.",
            "`close()`: reject new pushes, drain accepted items, then answer `{ done: true }` - and wake waiting consumers.",
            "Expose `[Symbol.asyncIterator]` so consumers are a single `for await` loop that ends by itself.",
            "Carry backpressure across boundaries that lack it, such as `postMessage`, with credits.",
        ]),
    ],
});
