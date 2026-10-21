// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-jsf-2-2",
    title: "ES modules in Node 24: import, export & top-level await",
    slug: { _type: "slug", current: "es-modules-node-import-export-top-level-await" },
    description:
        "A service is moved from CommonJS to ES modules, every test passes, and the first production start crash-loops with \"Cannot access 'config' before initialization\". Learn how Node 24 decides between ESM and CommonJS, how a module graph is linked and evaluated, what live bindings and module singletons are, why circular imports hit the TDZ, and how top-level await, dynamic import(), JSON import attributes and require(esm) really behave.",
    estimatedTime: 22,

    scenario: {
        role: "Backend engineer, notifications API (Node 24)",
        problem:
            "The team migrated notify-api from CommonJS to ES modules: \"type\": \"module\" in package.json, every require() turned into an import, and the config module now loads its secrets with top-level await. Unit tests, `npm run dev` and the CI smoke test are green. The first production deploy crash-loops: every pod exits at start with \"ReferenceError: Cannot access 'config' before initialization\" at db.js line 4, Kubernetes restarts them 40 times in ten minutes, and 9,300 webhook deliveries pile up until the rollback lands 18 minutes later. Nobody can reproduce it with `npm run dev`.",
    },

    content: [
        h2("1. The incident: a crash that only production sees"),
        p("Before the migration, `config.js` required the database module at the bottom of the file, after it had filled in its exports. That detail was load-bearing, but nobody knew it:"),
        code("javascript", `
// src/config.js - CommonJS, before the migration
const config = {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: process.env.DATABASE_URL,
};
module.exports = { config, refreshOverrides };

// Required last, so db.js finds config already exported.
const { getOverrides } = require("./db");

async function refreshOverrides() {
    Object.assign(config, await getOverrides());
}`, "config.cjs"),
        p("The migration replaced every `require()` with an `import` and, while they were at it, loaded the secrets at start-up with top-level await:"),
        code("javascript", `
// src/config.js - ES module, after the migration
import { fetchSecrets } from "./secrets-client.js";
import { getOverrides } from "./db.js";          // was a require() at the bottom

export let config = {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: process.env.DATABASE_URL,
};

const secrets = await fetchSecrets(process.env.SECRETS_URL);
config = { ...config, ...secrets };

export async function refreshOverrides() {
    config = { ...config, ...(await getOverrides()) };
}

// src/db.js
import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });  // line 4

export async function getOverrides() {
    const { rows } = await pool.query("select key, value from settings");
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}`, "src/config.js + src/db.js"),
        p("Two entry points start this code. Production runs `node src/server.js`, which imports `config.js` first to read the port. Local development and the CI smoke test run `scripts/dev.js`, which applies database migrations and therefore imports `db.js` first. Same files, same code, different first import - and only one of them crashes."),

        h2("2. Reproduce it in four files"),
        p("You do not need a database or a secrets service to see the bug. Strip the incident down to the module structure, with a 50 ms timer standing in for the secrets call:"),
        code("javascript", `
// package.json: { "type": "module" }

// config.js
import { getOverrides } from "./db.js";
console.log("config.js: start");
export let config = { databaseUrl: "postgres://localhost/dev" };
await new Promise((resolve) => setTimeout(resolve, 50));   // "fetch secrets"
config = { ...config, apiKey: "s3cret" };
console.log("config.js: secrets loaded");

// db.js
import { config } from "./config.js";
console.log("db.js: start");
export const pool = { url: config.databaseUrl };
export function getOverrides() { return pool; }

// dev.js - imports db.js first
import "./db.js";
import "./config.js";
console.log("dev ok");

// server.js - imports config.js first
import { config } from "./config.js";
import "./db.js";
console.log("server ok", config.apiKey);`, "repro"),
        code("bash", `
$ node dev.js
config.js: start
config.js: secrets loaded
db.js: start
dev ok

$ node server.js
db.js: start
file:///.../db.js:3
export const pool = { url: config.databaseUrl };
                           ^
ReferenceError: Cannot access 'config' before initialization`, "terminal"),
        p("Look at the order of the logs. With `dev.js`, `config.js` runs before `db.js` even though `dev.js` imports `db.js` first. With `server.js`, `db.js` runs first even though `server.js` imports `config.js` first. To understand why, you need the rules Node uses to load a graph of ES modules."),

        h2("3. ESM and CommonJS in Node 24"),
        p("Node.js has two module systems. **CommonJS** (CJS) is the original one: `require()`, `module.exports`, `__dirname`. **ES modules** (ESM) are the JavaScript standard, shared with browsers: `import`, `export`, `import.meta`. Node decides which one a file uses before it runs it:"),
        bullets([
            "`.mjs` files are always ESM, `.cjs` files are always CommonJS.",
            "`.js` files follow the `\"type\"` field of the nearest `package.json`: `\"module\"` means ESM, `\"commonjs\"` (or no field) means CommonJS.",
            "With no `\"type\"` field, Node 24 tries CommonJS first. If the file contains `import`/`export` syntax, it parses it again as ESM and prints a `MODULE_TYPELESS_PACKAGE_JSON` warning. Do not rely on this guess: set `\"type\"` explicitly.",
        ]),
        h3("What changes when a file becomes ESM"),
        bullets([
            "`import` / `export` replace `require()` / `module.exports`. Imports are static: the specifier must be a string literal, and the declarations are processed before any code in the file runs.",
            "Relative imports need the full file name: `import \"./db.js\"`, not `\"./db\"` (`ERR_MODULE_NOT_FOUND`). Node does not guess extensions or look for `index.js` in ESM.",
            "`__dirname` and `__filename` do not exist. Use `import.meta.dirname` and `import.meta.filename` (Node 20.11 and later).",
            "The file is always in strict mode, and top-level `this` is `undefined`.",
            "`await` is allowed at the top level of the file (section 7).",
            "Built-in modules are best imported with the `node:` prefix: `import { readFile } from \"node:fs/promises\"`. The prefix can never be shadowed by a package on npm, and some newer built-ins, such as `node:test`, exist only with it.",
        ]),
        h3("Named and default exports"),
        code("javascript", `
// money.js
export const CURRENCY = "USD";                       // named export
export function formatMoney(cents) {                 // named export
    return (cents / 100).toFixed(2) + " " + CURRENCY;
}
export default function parseMoney(text) { /* ... */ }  // one default export

// checkout.js
import parseMoney, { formatMoney, CURRENCY as currency } from "./money.js";
import * as money from "./money.js";                 // namespace object: money.formatMoney, money.default`, "exports"),
        p("A module can have many named exports and at most one default export. Prefer named exports in application code: the name is checked when the graph is linked (a typo is a `SyntaxError` before anything runs), editors can rename them safely, and every file uses the same name for the same thing. A default import can be given any name, so `parseMoney` in one file can become `parse` or `money` in another."),
        callout("info", "Importing CommonJS from ESM",
            "An ES module can import a CommonJS file. The default import is the whole module.exports object, and named imports also work when Node can detect the export names statically (for example exports.a = 1). When they cannot be detected, import the default and destructure it."),

        h2("4. How Node runs a module graph"),
        p("When you run `node server.js`, Node does not execute the file line by line the way `require()` does. It works in two phases over the whole graph:"),
        numbered([
            "**Load and link.** Starting from the entry file, Node reads every `import` declaration, resolves and loads each dependency, and repeats until the whole graph is known. It then connects every imported name to the variable it refers to in the exporting module. A missing file or a missing export fails here, before any of your code runs. After linking, every binding exists but is **uninitialized**: it is in its temporal dead zone (TDZ), exactly like a `let` before its declaration line.",
            "**Evaluate.** Node runs the module bodies depth-first, **dependencies before importers**: for each module it first evaluates its imports in the order they are written, then the module's own body. A module that has already been evaluated is skipped.",
        ]),
        p("Two consequences follow. First, `import` declarations are hoisted: an `import` written at the bottom of a file is processed before the first line of that file runs, which is exactly what broke the CommonJS trick in `config.js`. Second, every module body runs **once** per process. All importers share the same instance, which makes an ES module a natural singleton - one connection pool, one config object, one cache."),
        image("module-graph-cycle", {
            alt: "Two module graphs. Left: server.js imports config.js then db.js, config.js imports db.js and db.js imports config.js back, a cycle; db.js is evaluated first and reads config while it is still uninitialized, throwing ReferenceError. Right: config.js imports nothing, db.js and settings.js import it, server.js imports both; evaluation order is config.js, db.js, settings.js, server.js.",
            caption: "Link first, then evaluate dependencies before importers. In a cycle the module reached first runs last; removing the cycle gives one safe order for every entry point.",
        }),
        callout("warning", "Once per URL, not once per file",
            "The module cache is keyed by the resolved URL. `./config.js` and `./config.js?v=2` are two different modules, each evaluated once, each with its own state. The same happens when two copies of a package end up in node_modules: two \"singletons\" that disagree."),

        h2("5. Live bindings"),
        p("An import is not a copy of a value. It is a **live, read-only view** of the variable inside the exporting module. When the exporting module changes the variable, every importer sees the new value on its next read:"),
        code("javascript", `
// connection.js
export let status = "disconnected";
export async function connect() {
    status = "connecting";
    await openSocket();
    status = "connected";
}

// health.js
import { status, connect } from "./connection.js";
console.log(status);   // "disconnected"
await connect();
console.log(status);   // "connected" - same variable, read again

status = "connected";  // TypeError: Assignment to constant variable.`, "live-bindings.js"),
        bullets([
            "Only the module that declares a variable can assign to it. To change it from outside, export a function that does it, like `connect()`.",
            "`export default <expression>` exports the **value** of the expression at the moment it is evaluated, not a variable. Named exports of `let` variables are the ones that stay live.",
            "CommonJS has no live bindings: `const { status } = require(\"./connection\")` copies the value once.",
        ]),

        h2("6. Circular imports and the TDZ"),
        p("A cycle is legal in ESM: linking simply notices that a module is already being visited and does not follow the edge again. Evaluation then has to pick an order, and it can only be \"dependencies first\" for one side of the cycle. Replay the production start with the rules from section 4:"),
        numbered([
            "`server.js` imports `config.js` first, so evaluation goes into `config.js`, whose first dependency is `db.js`.",
            "`db.js` imports `config.js`, which is already in progress. The edge is skipped; `db.js` has no other unevaluated dependency.",
            "So `db.js` is evaluated **first**. It reads `config.databaseUrl`, but `config.js` has not run a single line yet: `config` is still in its TDZ.",
            "`ReferenceError: Cannot access 'config' before initialization`, and the process exits.",
        ]),
        p("With `dev.js`, `db.js` is reached first, so the roles swap: `config.js` runs first (its only top-level work is loading secrets, and it does not call `getOverrides()` yet), then `db.js` reads a finished config. The cycle was there in both cases; the entry point only decided which side of it lost. CommonJS hid it because `require()` runs where it is written, and the old `config.js` had already filled `module.exports` when it required `db.js`."),
        callout("tip", "The rule of thumb",
            "A module in a cycle may use the other module's exports inside functions that run later, never at its top level. The safest cycle is no cycle."),

        h2("7. Top-level await"),
        p("In an ES module you can use `await` outside any function. While the module waits, its evaluation is paused, and so is the evaluation of **every module that depends on it**, directly or indirectly. Importers never see a half-initialized module: when their body runs, the awaited value is there."),
        bullets([
            "It does not block the thread. Timers, I/O and modules that do not depend on the waiting module keep running.",
            "If the awaited promise rejects, the module fails and so does every importer: the process exits at start-up instead of serving traffic with broken config. That is usually what you want for secrets.",
            "Everything that imports the module waits for it, so slow or hanging work at the top level delays the whole service. Put a timeout on network calls made at start-up.",
            "Top-level await exists only in ES modules. A CommonJS file cannot `require()` a module graph that contains it (section 9).",
        ]),
        h3("Dynamic import()"),
        p("`import(specifier)` is an expression, not a declaration. It loads a module at run time and returns a promise of its namespace object. It works in both ESM and CommonJS, and the specifier can be computed:"),
        code("javascript", `
export async function exportReport(rows, format) {
    // Load the heavy PDF library only when someone asks for a PDF.
    if (format === "pdf") {
        const { renderPdf } = await import("./pdf-renderer.js");
        return renderPdf(rows);
    }
    return rows.map((row) => row.join(",")).join("\\n");
}`, "report.js"),
        p("Use it for optional or heavy dependencies, plugins chosen by configuration, and code that only some requests need. The module is still evaluated once: the second `import()` of the same URL returns the cached module."),
        challenge("chal_quiz_jsf_221"),

        h2("8. The fix: give the graph one safe order"),
        p("Wrapping `pool` in a function or swapping the two imports in `server.js` would make the crash disappear for today's entry points. The real fix is to remove the cycle, so the order is the same no matter which file starts the process:"),
        code("javascript", `
// src/config.js - a leaf: it imports nothing from the app
import { fetchSecrets } from "./secrets-client.js";

const secrets = await fetchSecrets(process.env.SECRETS_URL, { signal: AbortSignal.timeout(5_000) });

export const config = Object.freeze({
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: process.env.DATABASE_URL,
    ...secrets,
});

// src/db.js - depends on config, never the other way round
import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

// src/settings.js - the runtime overrides that used to live in config.js
import { pool } from "./db.js";
import { config } from "./config.js";

export async function loadSettings() {
    const { rows } = await pool.query("select key, value from settings");
    return { ...config, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}`, "src/config.js + src/db.js + src/settings.js"),
        bullets([
            "**`config.js` is a leaf.** It has no imports from the app, so nothing can ever be evaluated before it. Its top-level await makes `db.js`, `settings.js` and `server.js` wait until the secrets are loaded.",
            "**`export const`, frozen.** Config is assigned once, after the secrets arrive. There is no `export let` to reassign and no window in which an importer could see the defaults without the secrets.",
            "**Overrides moved out.** The code that needed both the database and the config lives in a module that imports both. Dependencies now point one way: `server.js` → `settings.js` → `db.js` → `config.js`.",
            "**Fail fast with a timeout.** If the secrets service hangs, start-up fails after five seconds with a clear error instead of hanging forever.",
        ]),
        callout("tip", "Make CI start the real entry point",
            "The bug survived CI because CI only ran scripts/dev.js. Add a smoke test that starts node src/server.js exactly as production does, and fail the build on circular imports with a cycle checker such as madge --circular src."),

        h2("9. Interop and other pitfalls"),
        h3("require() of an ES module"),
        p("Since Node 22.12 (and 20.19), `require()` can load an ES module without any flag, and Node 24 does it by default. You get the module namespace object, so a default export is at `.default`:"),
        code("javascript", `
// legacy-worker.cjs
const { formatMoney } = require("./money.js");      // works: no top-level await in its graph
const parseMoney = require("./money.js").default;   // default export lives at .default

require("./db.js");
// Error [ERR_REQUIRE_ASYNC_MODULE]: db.js imports config.js, which uses top-level await.
// Use: const { pool } = await import("./db.js");`, "legacy-worker.cjs"),
        p("`require()` is synchronous, so it cannot wait for a top-level `await`. If the module or anything it imports uses top-level await, `require()` throws `ERR_REQUIRE_ASYNC_MODULE`, and the CommonJS caller has to switch to `await import()`."),
        h3("Importing JSON"),
        code("javascript", `
import pkg from "./package.json" with { type: "json" };
console.log(pkg.version);

// import { version } from "./package.json" with { type: "json" };
// SyntaxError: ... does not provide an export named 'version'`, "version.js"),
        bullets([
            "The import attribute `with { type: \"json\" }` is required. Without it Node throws `ERR_IMPORT_ATTRIBUTE_MISSING`. The attribute states that you expect data, so a module is never executed as code when you asked for JSON.",
            "A JSON module has only a default export: import the object, then read its properties.",
            "The older `assert { type: \"json\" }` syntax was removed and is a `SyntaxError` in Node 24. Write `with`.",
        ]),
        h3("More traps"),
        bullets([
            "**Missing extensions.** `import \"./db\"` worked with `require()` and fails in ESM. Write `./db.js`.",
            "**Assigning to an import.** Imports are read-only; tests cannot replace an exported function by assignment. Pass dependencies in as arguments, or use the module mocking of your test runner.",
            "**Top-level work in modules that sit in cycles.** Code that only runs inside functions survives a cycle; code that reads another module's export at the top level does not.",
            "**Mixing module systems by accident.** A `.js` file next to a `package.json` without `\"type\"` is CommonJS. Pick one system per package and say so explicitly.",
        ]),

        h2("10. Checklist"),
        bullets([
            "`package.json` has an explicit `\"type\"`; `.mjs` / `.cjs` are used only for files that must differ from it.",
            "Relative imports include the file extension; built-ins use the `node:` prefix.",
            "Application code prefers named exports; an imported binding is never assigned to outside its own module.",
            "Every module body runs once per resolved URL; shared state (pools, caches, config) lives in one module and is never duplicated with query strings or second package copies.",
            "The module graph has no cycles, or modules in a cycle only use each other inside functions, never at the top level. CI checks for cycles.",
            "Config is a leaf module: it imports nothing from the app and exports a frozen `const`, loaded with top-level await and a timeout.",
            "CI starts the same entry point as production.",
            "Heavy or optional code is loaded with `await import()`; CommonJS callers use `import()` for modules with top-level await.",
            "JSON is imported with `with { type: \"json\" }` and read through its default export.",
        ]),
    ],
});
