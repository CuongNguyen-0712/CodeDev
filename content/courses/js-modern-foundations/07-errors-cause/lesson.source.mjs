// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-jsf-4-1",
    title: "Errors that explain themselves: cause, AggregateError & boundaries",
    slug: { _type: "slug", current: "errors-that-explain-themselves-cause-aggregateerror-boundaries" },
    description:
        "A nightly import failed for three hours with nothing but \"Import failed\" in the logs, and on another night it reported \"0 rows imported\" as a success. Learn to throw Error objects instead of strings, write small error classes with a name and a code, wrap errors with { cause } instead of replacing them, report many failures at once with AggregateError, use finally without swallowing errors, and catch only at the edge of your program.",
    estimatedTime: 20,

    scenario: {
        role: "Junior backend developer, data team of an online shop",
        problem:
            "The nightly order import failed at 02:10. For three hours the only clue in the logs was \"Error: Import failed\" - no file, no line, no reason. The real cause was one CSV row on line 4812 with the date 2026-02-30. A week later the database was down during the import, and the job reported \"0 rows imported - success\", so nobody was paged at all and the finance dashboard showed an empty day.",
    },

    content: [
        h2("1. The incident"),
        p("The import job is short and looks careful - it even has a try/catch around everything:"),
        code("javascript", `
async function runImport(path) {
    try {
        const text = await readFile(path, "utf8");
        const rows = parseCsv(text);           // throws "invalid date" on a bad row
        const saved = await saveOrders(rows);
        console.log(\`\${saved} rows imported - success\`);
    } catch (error) {
        throw new Error("Import failed");      // the real error is dropped here
    }
}

async function saveOrders(rows) {
    try {
        await db.insertMany("orders", rows);
        return rows.length;
    } catch {
        return 0;                              // "nothing saved" looks like "nothing to save"
    }
}`, "import-job.js"),
        p("Two different catches, two different ways to destroy information:"),
        bullets([
            "**Replaced error**: the first catch throws a brand-new `Error(\"Import failed\")`. The variable `error` - which knew the line number and the reason - is never used. The stack trace now points at the catch block, not at the bad row.",
            "**Swallowed error**: the second catch turns a database outage into the number `0`. To the caller, \"the database is down\" and \"the file was empty\" look exactly the same - and both look like success.",
            "**A string instead of an Error**: deep inside, `parseCsv` does `throw \"invalid date\"`. A string has no stack trace, no name and no place for extra data. Even if it reached the log, nobody could tell which file or line it came from.",
        ]),

        h2("2. Reproduce it"),
        p("Run this in Node 24 (save it as `repro.mjs` and run `node repro.mjs`) and compare the two outputs:"),
        code("javascript", `
function parseDate(text) {
    if (text === "2026-02-30") throw new Error(\`invalid date "\${text}"\`);
    return text;
}

try { parseDate("2026-02-30"); }
catch (error) { console.error(new Error("Import failed")); }                     // 1: replaced

try { parseDate("2026-02-30"); }
catch (error) { console.error(new Error("Import failed", { cause: error })); }    // 2: wrapped`, "repro.mjs"),
        p("The first prints `Error: Import failed` and a stack trace that ends in the catch block. The second prints the same message **plus** a `[cause]: Error: invalid date \"2026-02-30\"` section with its own stack trace pointing into `parseDate`. Same message for humans, but the original error travels along with it. That one option - `{ cause: error }` - is the difference between a three-hour incident and a three-minute fix."),

        h2("3. Throw Error objects, never strings"),
        p("JavaScript lets you `throw` any value: a string, a number, an object literal. Only `Error` objects (and subclasses such as `TypeError` or your own classes) give you the things you need when something breaks in production:"),
        bullets([
            "**`stack`**: where the error was created - file, line, the chain of function calls.",
            "**`name`** and **`message`**: what kind of failure it is, in words. `console.error` and error trackers print both.",
            "**`cause`**: the error that led to this one (section 5).",
            "**Your own fields**: a `code`, a line number, an order id - anything that helps the code that catches it decide what to do.",
        ]),
        code("javascript", `
throw "invalid date";                                  // no stack, no name, no cause
throw { message: "invalid date" };                     // looks like an error, is not one
throw new Error(\`Line \${lineNumber}: invalid date "\${value}"\`);   // do this`),
        callout("info", "Messages are for humans, codes are for code",
            "Write messages that a tired on-call engineer understands: what failed, with which value, where. But never let code depend on the message text - `if (error.message.includes(\"date\"))` breaks the day someone fixes a typo. Give errors a stable `code` and branch on that."),

        h2("4. Small error classes with a name and a code"),
        p("A custom error class is only a few lines. It lets callers tell your failures apart from everything else, and it gives every instance the same shape:"),
        code("javascript", `
class PaymentError extends Error {
    constructor(message, code, options) {
        super(message, options);       // pass options on - that is where cause lives
        this.name = "PaymentError";    // otherwise logs say "Error: ..."
        this.code = code;              // e.g. "CARD_DECLINED", "PROVIDER_TIMEOUT"
    }
}

throw new PaymentError("Card declined by issuer", "CARD_DECLINED");`, "errors.js"),
        bullets([
            "**Set `this.name`.** Subclasses inherit `name` from `Error.prototype`, so without this line every log line still starts with `Error:`.",
            "**Forward `options` to `super`.** `super(message)` alone silently drops `{ cause }` - the class looks right and still loses the original error.",
            "**Keep codes stable and upper-case** (`\"CARD_DECLINED\"`): they end up in dashboards, alerts and API responses, so treat them like part of your API.",
            "**Do not build a deep hierarchy.** One base class per area (`ImportError`, `PaymentError`) plus a `code` is enough for most programs.",
        ]),
        h3("Checking what you caught"),
        p("`error instanceof PaymentError` is the usual check, and it works for errors created in the same program. It has two known blind spots: errors that come from another realm (an iframe, a `node:vm` context) are not instances of *your* `Error`, and if two copies of the same library are installed, `instanceof` against one copy fails for errors from the other. For those cases, check the `name` or `code` field as well - they survive both situations."),
        callout("tip", "Error.isError()",
            "To ask \"is this a real Error object at all?\" across realms, ES2026 adds `Error.isError(value)`. Node 24 and current browsers ship it, but older runtimes (Node 22 and earlier) do not - feature-check with `typeof Error.isError === \"function\"` if your code also runs there. For \"is this *my* kind of error?\", `instanceof` plus `code` remain the tools."),

        h2("5. Wrap with cause - do not replace"),
        p("Each layer of a program knows something different. The CSV parser knows the line number; the import job knows the file name and how many rows there were; the scheduler knows which night it was. When a lower layer fails, the upper layer should **add** its context and **keep** the original error:"),
        code("javascript", `
try {
    await db.insertMany("orders", rows);
} catch (error) {
    throw new Error(\`Could not save \${rows.length} orders from \${path}\`, { cause: error });
}`),
        p("`cause` is a normal property: `error.cause` gives you the original, and its own `cause` gives you the one before that. Node's `console.error` and `util.inspect` print the whole chain, and error trackers show it as linked exceptions."),
        image("error-cause-chain", {
            alt: "Two chains side by side. With cause: the job runner at the edge receives an ImportError with code IMPORT_INVALID_ROWS and the message Import failed: 1 of 48,210 rows invalid; its cause is an AggregateError named Invalid rows, whose first entry is a ValidationError with code INVALID_ROW and the message Line 4812: invalid date 2026-02-30. Without cause: the job runner receives a plain Error with the message Import failed, and the real error is thrown away in the catch block.",
            caption: "Every catch either recovers or adds context and passes the original along as cause. Only the edge logs - and then the whole chain is in one log entry.",
        }),

        h2("6. Many failures at once: AggregateError"),
        p("Sometimes there is not one cause but many. `AggregateError` is a built-in error that carries a list of errors in its `errors` property. You meet it first in `Promise.any`, which rejects with an `AggregateError` only when **every** promise rejected:"),
        code("javascript", `
try {
    const price = await Promise.any([fetchPrice("eu"), fetchPrice("us"), fetchPrice("asia")]);
} catch (error) {
    console.log(error.name);           // "AggregateError"
    console.log(error.errors.length);  // 3 - one rejection reason per mirror
}`),
        p("You can create one yourself, too. Validation is the classic case: if a file has 40 bad rows, stopping at the first one means 40 runs to find them all. Collect the problems and report them together:"),
        code("javascript", `
const problems = [];
for (const [index, row] of rows.entries()) {
    if (!isValidEmail(row.email)) {
        problems.push(new Error(\`Row \${index + 1}: invalid email "\${row.email}"\`));
    }
}
if (problems.length > 0) {
    throw new AggregateError(problems, \`\${problems.length} invalid rows\`);
}`),
        callout("info", "AggregateError and cause work together",
            "AggregateError is a normal Error: it can be the `cause` of a higher-level error, and it can have a `cause` of its own. A typical chain is \"ImportError -> AggregateError -> one ValidationError per bad row\"."),

        h2("7. try, catch and finally: the rules"),
        bullets([
            "**`finally` always runs** - after the `try` block finishes, after `return`, after a `throw`, after the `catch` block. Put cleanup there: closing a file, releasing a lock, closing a database connection.",
            "**Never `return` (or `throw`) from `finally`.** A `return` inside `finally` replaces whatever the `try` or `catch` was doing - including a thrown error, which simply disappears. ESLint's `no-unsafe-finally` rule catches this.",
            "**`catch` without a variable is allowed** (`catch { ... }`), but an empty `catch {}` is almost always a bug. If ignoring the error really is the plan, write a comment that says why.",
            "**`try/catch` only catches what happens inside it** - including rejected promises you `await` there, but not callbacks that run later.",
        ]),
        code("javascript", `
function readCount() {
    try {
        throw new Error("disk full");
    } finally {
        return 0;          // the "disk full" error is gone - readCount() returns 0
    }
}`),

        h2("8. Your turn"),
        p("Here is a smaller version of the import job. It throws strings, its error class drops the cause and has the wrong name, it stops at the first bad row, and it turns a database failure into \"0 rows\". The tests look at what `importOrders` throws and follow the `cause` chain all the way down."),
        challenge("chal_fix_jsf_411", "Work from the bottom up: make parseRow throw ValidationError objects; fix ImportError so it has its own name and keeps options.cause; collect every ValidationError before deciding; wrap the database error instead of swallowing it. Keep store.close() in finally - and do not return from there."),

        h2("9. Error boundaries: catch at the edge"),
        p("If every function catches and logs, one failure produces ten log lines and still nobody knows what happened. Most functions should not catch at all. A good rule of thumb is that a function catches an error only to do one of three things:"),
        numbered([
            "**Recover**: there is a real fallback, for example a default template when the optional one fails to load. Recover only from the errors you expect - check the `code` or class and rethrow everything else.",
            "**Add context**: wrap with `new Error(message, { cause })` (or your own class) and throw it on.",
            "**Handle at the edge**: the outermost layer - the HTTP request handler, the job runner, the CLI's `main` - logs the full chain once, turns it into a response or exit code, and alerts if needed.",
        ]),
        code("javascript", `
// Inside: recover from the one error you expect, rethrow the rest.
try {
    return await loadTemplate("receipt-v2");
} catch (error) {
    if (error.code !== "TEMPLATE_NOT_FOUND") throw error;
    return loadTemplate("plain");
}

// The edge: one place that logs, sets the exit code and pages someone.
try {
    await runImport(process.argv[2]);
} catch (error) {
    console.error(error);            // prints message, stack and every [cause]
    process.exitCode = 1;            // the scheduler now sees a failed run
}`, "main.js"),
        callout("warning", "Never catch {} silently",
            "`catch {}` and `catch { return null; }` do not make errors go away - they move them to a place where nobody looks: an empty dashboard, a \"success\" with 0 rows, a null that crashes three functions later with a less helpful message. If a function can fail, let it fail loudly or return a result that clearly says it failed."),

        h2("10. Pitfalls"),
        bullets([
            "**`super(message)` in a subclass** forgets the options - `cause` is lost even though callers pass it.",
            "**Forgetting `this.name`**: your `ImportError` is logged as `Error: ...`, and dashboards group it with everything else.",
            "**Logging and rethrowing at every level**: the same failure shows up five times. Log once, at the edge.",
            "**Copying only the message**: `new Error(\"Save failed: \" + error.message)` keeps the text but loses the stack, the code and the cause chain of the original. Use `{ cause: error }`.",
            "**Stopping at the first validation error** when the user needs the full list: collect them and throw one `AggregateError`.",
            "**`return` in `finally`**: the error vanishes and the caller gets a normal value.",
            "**Branching on message text**: use `code` or the class.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Every `throw` throws an `Error` object (or a subclass) with a message that says what failed, with which value, where.",
            "Error classes set `name`, carry a stable `code`, and pass `options` to `super` so `cause` is kept.",
            "Every catch either recovers from an expected error, adds context with `{ cause }`, or is the edge. Everything else is rethrown.",
            "Many independent failures are reported together with `AggregateError`.",
            "Cleanup lives in `finally`, and `finally` never contains `return` or `throw`.",
            "No empty `catch {}`; no `catch` that turns a failure into `null`, `0` or \"success\".",
            "The edge logs the whole error (including the cause chain) once and sets a failing exit code or status.",
        ]),
    ],
});
