// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-qaf-2-3",
    title: "Integration tests against an in-memory store",
    slug: { _type: "slug", current: "integration-tests-against-an-in-memory-store" },
    description:
        "Unit tests with hand-written stubs passed while signup answered 500 in production: the stubs agreed with the code, not with the database. Learn what an integration test is, what to replace (only the slow edge), how to build an in-memory fake that keeps the real store's contract - async, copies in and out, case-insensitive uniqueness, null for not found, error codes - and how one contract suite run against both the fake and Postgres keeps the fake honest.",
    estimatedTime: 25,

    scenario: {
        role: "QA automation engineer, online shop accounts team",
        problem:
            "A customer who signed up as Ann@Shop.vn could not log in, and when she tried to sign up again as ann@shop.vn the shop showed \"Something went wrong\" (HTTP 500) instead of \"email already registered\" (409). The signup service had a green unit suite - built on stubs that returned null and handed back the very object the service later changed. Your job: replace the stubs with an in-memory store that behaves like the database, prove it with a contract suite, and test the signup handler end to end.",
    },

    content: [
        h2("1. The incident: stubs that agreed with the code"),
        p("The accounts team stores users in Postgres. The `users` table has a unique index on `lower(email)`, so `Ann@Shop.vn` and `ann@shop.vn` cannot both exist. The repository translates Postgres' unique violation (SQLSTATE `23505`) into an `Error` with `code: \"DUPLICATE_EMAIL\"`. This is the signup service that shipped:"),
        code("javascript", `
import { ValidationError, ConflictError } from "./errors.js";

const EMAIL = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

export function createSignupService({ users }) {
    return {
        async signup({ email, name } = {}) {
            if (typeof email !== "string" || !EMAIL.test(email)) throw new ValidationError("email is invalid");
            if (typeof name !== "string" || name.trim() === "") throw new ValidationError("name is required");

            if (await users.findByEmail(email.toLowerCase())) {
                throw new ConflictError("email already registered");
            }
            const user = await users.insert({ email, name });
            user.email = user.email.toLowerCase();      // "store emails in lower case"
            return user;
        },
    };
}`, "src/signup-service.js"),
        p("And its unit tests. Both were green on every run:"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSignupService } from "../src/signup-service.js";
import { ConflictError } from "../src/errors.js";

test("signup stores the email in lower case", async () => {
    const rows = [];
    const users = {
        findByEmail: async () => null,
        insert: async (user) => { user.id = 1; rows.push(user); return user; },
    };
    await createSignupService({ users }).signup({ email: "Ann@Shop.vn", name: "Ann" });
    assert.equal(rows[0].email, "ann@shop.vn");
});

test("signup rejects an email that is already registered", async () => {
    const users = {
        findByEmail: async () => ({ id: 1, email: "ann@shop.vn", name: "Ann" }),
        insert: async () => assert.fail("insert must not be called"),
    };
    await assert.rejects(
        createSignupService({ users }).signup({ email: "ann@shop.vn", name: "Ann" }),
        ConflictError,
    );
});`, "test/signup.unit.test.js"),
        p("Both stubs told a lie, and the tests believed them:"),
        bullets([
            "**The shared reference.** The `insert` stub pushed the caller's object into `rows` and returned that same object. The service then lower-cased `user.email` on it, so `rows[0].email` was `\"ann@shop.vn\"` - the test read back the service's own change. Postgres returns a new row from `INSERT ... RETURNING`; changing it changes nothing in the table. The real row kept `Ann@Shop.vn`.",
            "**The missing error.** No stub ever threw what the real store throws. The real `findByEmail` ran `WHERE email = $1`, which is case-sensitive, so the lookup for `ann@shop.vn` missed the `Ann@Shop.vn` row. The insert then hit the unique index, the repository threw `DUPLICATE_EMAIL`, and the service let it escape. The handler turned an unknown error into a 500.",
        ]),
        p("The login lookup had the same case problem, so Ann could not log in either. And even with a correct lookup, check-then-insert has a race: two requests that arrive together both see `null`, and the second insert fails with the same unhandled error."),
        callout("warning", "The stubs were written by the same person as the code",
            "Each stub encoded what the developer believed the store does: lookups never miss, inserts never fail, returned objects are the stored ones. A test built on beliefs can only confirm them. Nothing in the suite compared those beliefs with Postgres."),

        h2("2. Reproduce it: make the stubs tell the truth"),
        p("Before building anything new, change each stub so it behaves like the real store in exactly one way, and watch the old assumptions fail. The first stub returns a copy, as `RETURNING` does. The second rejects the insert the way the unique index does. This test goes through the HTTP-style handler `handleSignup(req)`, which turns the service's errors into `{ status, body }`:"),
        code("javascript", `
import { ValidationError, ConflictError } from "./errors.js";

export function createSignupHandler(service) {
    return async function handleSignup(req) {
        try {
            const user = await service.signup(req.body);
            return { status: 201, body: { id: user.id, email: user.email, name: user.name } };
        } catch (err) {
            if (err instanceof ValidationError) return { status: 400, body: { error: err.message } };
            if (err instanceof ConflictError) return { status: 409, body: { error: err.message } };
            return { status: 500, body: { error: "internal error" } };
        }
    };
}`, "src/signup-handler.js"),
        code("javascript", `
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSignupService } from "../src/signup-service.js";
import { createSignupHandler } from "../src/signup-handler.js";

test("the stored row has the lower-case email", async () => {
    const rows = [];
    const users = {
        findByEmail: async () => null,
        insert: async (user) => {                    // like INSERT ... RETURNING: a new object
            rows.push({ ...user, id: 1 });
            return { ...user, id: 1 };
        },
    };
    await createSignupService({ users }).signup({ email: "Ann@Shop.vn", name: "Ann" });
    assert.equal(rows[0].email, "ann@shop.vn");
});

test("a second signup with the same email is a 409", async () => {
    const users = {
        findByEmail: async () => null,               // WHERE email = $1 misses "Ann@Shop.vn"
        insert: async () => {                        // the unique index on lower(email) does not
            throw Object.assign(new Error("email already registered"), { code: "DUPLICATE_EMAIL" });
        },
    };
    const handleSignup = createSignupHandler(createSignupService({ users }));
    const res = await handleSignup({ body: { email: "ann@shop.vn", name: "Ann" } });
    assert.equal(res.status, 409);
});`, "test/signup.repro.test.js"),
        code("bash", `
$ node --test test/signup.repro.test.js
✖ the stored row has the lower-case email (11.4063ms)
✖ a second signup with the same email is a 409 (2.9194ms)
ℹ tests 2
ℹ pass 0
ℹ fail 2

✖ the stored row has the lower-case email
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected

  + 'Ann@Shop.vn'
  - 'ann@shop.vn'

✖ a second signup with the same email is a 409
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

  500 !== 409`),
        p("Both production bugs are now red, on a laptop, in a few milliseconds. But look at the cost. Every test needs its own hand-made stub, and each stub tells one truth while it guesses everything else. The next test will need a stub where the lookup ignores case, then one where the list is ordered, and nothing checks any of them against Postgres. The rest of this lesson replaces that pile of guesses with **one** in-memory store that tells all the truths at once. A **contract suite** then proves that the store matches the database."),

        h2("3. What an integration test is, and what to replace"),
        p("You met stubs, mocks and fakes in **Stubs, mocks & fakes: picking the right double**. A unit test there checked one function with every collaborator replaced. An **integration test** wires several real pieces together and drives them through their public entry point. Here the pieces are the handler, the validation, the service and the repository. The test checks only what comes out: the status, the body, and what was stored."),
        p("The rule for what to replace is short: **replace only the edge that is slow, external or non-deterministic, and keep everything in between real.**"),
        bullets([
            "**Keep real:** `handleSignup`, the error-to-status mapping, the validation, the service, the normalising of the email. That is where this incident's bugs were, and stubs hid them.",
            "**Replace:** the Postgres connection, which needs a server and data from earlier runs, and the email sender, which talks to the network. Use a fake store and a recording mock.",
            "**Never replace the thing you are testing.** If the test stubs `service.signup`, it is testing the stub.",
        ]),
        p("Integration tests with an in-memory store run about as fast as unit tests (most tests in the integration suite below take one or two milliseconds). That is why the testing trophy from **What to test: the pyramid & the trophy** puts most of its weight on them: they are cheap, and they test the seams where pieces disagree."),

        h2("4. A fake that keeps the contract"),
        p("A **fake** is a working implementation of a dependency, with a shortcut inside: an array or a `Map` instead of a database. It is only useful if it keeps the real store's **contract**, meaning every promise the callers rely on. Otherwise it is one more stub that agrees with the code. For a database-backed store, these are the rules that matter:"),
        numbered([
            "**Same shape, same timing.** Same method names and arguments, and every method is `async`, because the real one is. Callers that forget an `await` must break in the test the way they break in production.",
            "**Copies in, copies out.** Store a copy of what you are given and return a fresh copy every time. The database never shares memory with its callers, so the fake must not either. This is the exact rule the incident's stub broke.",
            "**The same uniqueness rules.** If the real index is on `lower(email)`, the fake compares emails ignoring case.",
            "**The same not-found value.** A query with no row gives `null` in this codebase, so the fake returns `null`, not `undefined` and not `{}`. Code that checks `=== null` behaves differently with `undefined`.",
            "**The same errors.** Reject with the same `code` the real repository throws (`DUPLICATE_EMAIL`), because that code is what the service checks.",
            "**A stable order.** If the real query says `ORDER BY`, the fake sorts the same way. Never rely on whatever order an array or `Map` happens to keep.",
            "**A fresh, empty instance per call.** No module-level data, so each test can create its own store.",
        ]),
        p("Here are those rules applied to a different table, the shop's coupons. Codes are unique ignoring case, like `SUMMER10` and `summer10`:"),
        code("javascript", `
// A fake of the coupon table: same methods, same promises, same rules - no database.
export function createInMemoryCouponStore() {
    const byCode = new Map();                        // key: the normalised code

    return {
        async save(coupon) {
            const key = coupon.code.toUpperCase();
            if (byCode.has(key)) {
                throw Object.assign(new Error(\`coupon exists: \${coupon.code}\`), { code: "DUPLICATE_CODE" });
            }
            byCode.set(key, structuredClone(coupon));             // copy on write
            return structuredClone(coupon);
        },
        async findByCode(code) {
            const coupon = byCode.get(code.toUpperCase());
            return coupon ? structuredClone(coupon) : null;      // copy on read; null, like a query with no row
        },
        async listActive() {
            return [...byCode.values()]
                .filter((c) => c.active)
                .sort((a, b) => a.code.localeCompare(b.code))     // a stable order, like ORDER BY code
                .map((c) => structuredClone(c));
        },
    };
}`, "src/stores/memory-coupon-store.js"),
        p("`structuredClone` (from **Modern JavaScript on Node 24**) makes a deep copy, so nested objects are safe as well. For flat rows like a user, a spread `{ ...row }` is enough. Notice what the fake does **not** do: no SQL parsing, no transactions, no connection pool. It copies only the behaviour that callers can observe."),
        callout("info", "Where the fake lives",
            "Put the fake next to the real store (src/stores/), not in a test folder. Several test files and the local dev server can then use it, and it is reviewed like production code - because a wrong fake makes every test built on it wrong."),

        h2("5. One contract suite for the fake and the real store"),
        p("How do you know the fake really behaves like Postgres? You write the contract down once, as a suite that takes a **factory** for the store, and you run the same suite against every implementation:"),
        code("javascript", `
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// One suite, every store: if the fake passes it, the fake answers like the database.
export function runUserStoreContract(name, makeStore, options = {}) {
    describe(\`\${name} honours the user store contract\`, options, () => {
        let store;
        beforeEach(async () => {
            store = await makeStore();                 // a fresh, empty store for every test
        });

        it("returns what it stored, with an id", async () => {
            const saved = await store.insert({ email: "ann@shop.vn", name: "Ann" });
            assert.equal(typeof saved.id, "number");
            assert.deepEqual(await store.findByEmail("ann@shop.vn"), saved);
        });

        it("finds a user by email in any case", async () => {
            const saved = await store.insert({ email: "Ann@Shop.vn", name: "Ann" });
            assert.deepEqual(await store.findByEmail("ann@shop.vn"), saved);
        });

        it("rejects the same email in another case with code DUPLICATE_EMAIL", async () => {
            await store.insert({ email: "Ann@Shop.vn", name: "Ann" });
            await assert.rejects(store.insert({ email: "ann@shop.vn", name: "Ann 2" }), { code: "DUPLICATE_EMAIL" });
            assert.equal((await store.list()).length, 1);
        });

        it("returns null, not undefined, for an unknown email", async () => {
            assert.equal(await store.findByEmail("nobody@shop.vn"), null);
        });

        it("does not let callers change stored rows through returned objects", async () => {
            const saved = await store.insert({ email: "ann@shop.vn", name: "Ann" });
            saved.name = "Mallory";
            assert.equal((await store.findByEmail("ann@shop.vn")).name, "Ann");
        });
    });
}`, "testing/user-store-contract.js"),
        p("Each implementation gets a test file of a few lines. The in-memory one runs everywhere. The Postgres one runs when a database is available and is skipped, with a reason, when it is not:"),
        code("javascript", `
import { runUserStoreContract } from "../testing/user-store-contract.js";
import { createInMemoryUserStore } from "../src/stores/memory-user-store.js";

runUserStoreContract("in-memory store", () => createInMemoryUserStore());`, "test/memory-user-store.test.js"),
        code("javascript", `
import { after } from "node:test";
import { runUserStoreContract } from "../testing/user-store-contract.js";

const url = process.env.DATABASE_URL;
let pool;

runUserStoreContract("postgres store", async () => {
    const { default: pg } = await import("pg");
    const { createPgUserStore } = await import("../src/stores/pg-user-store.js");
    pool ??= new pg.Pool({ connectionString: url });
    await pool.query("TRUNCATE users RESTART IDENTITY");      // a fresh, empty table per test
    return createPgUserStore(pool);
}, { skip: url ? false : "set DATABASE_URL to run against Postgres" });

after(() => pool?.end());`, "test/pg-user-store.test.js"),
        code("bash", `
$ node --test
▶ in-memory store honours the user store contract
  ✔ returns what it stored, with an id (7.1901ms)
  ✔ finds a user by email in any case (1.3031ms)
  ✔ rejects the same email in another case with code DUPLICATE_EMAIL (2.4161ms)
  ✔ returns null, not undefined, for an unknown email (0.6651ms)
  ✔ does not let callers change stored rows through returned objects (0.6868ms)
✔ in-memory store honours the user store contract (15.7131ms)
﹣ postgres store honours the user store contract (1.5998ms) # set DATABASE_URL to run against Postgres`),
        p("`describe(name, options, fn)` accepts the same `skip` option as `test`. A string is printed as the reason, so nobody mistakes a skipped suite for a passing one. In CI, start a throwaway Postgres in Docker, for example `docker run -d -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:17`, then create the table and set `DATABASE_URL`. The same five tests then run against the real store. Running the fake's suite needs nothing at all."),
        p("This is what the contract buys you. Run against the shipped repository, whose `findByEmail` used `WHERE email = $1`, the test **finds a user by email in any case** fails in CI. Run against the incident's quick fake (returns its own objects, compares with `===`, gives `undefined`), four of the five tests fail. A fake and a real store that pass the same suite give the same answers to the questions your code asks."),
        h3("When you still need the real database"),
        p("The fake cannot catch everything. Keep a small set of tests against real Postgres, in CI, for the things only the database knows:"),
        bullets([
            "**The SQL itself**: a typo in a column name, a wrong `JOIN`, a missing `ORDER BY`. The fake has no SQL to get wrong.",
            "**Constraints and migrations**: that the unique index on `lower(email)` actually exists after the migration ran.",
            "**Database behaviour you rely on**: transactions, locking, time zones in `timestamptz`, collation-based sorting, and sequence gaps (see the pitfalls).",
            "**The contract suite itself**, so the fake cannot drift away from the real store unnoticed.",
        ]),
        p("Everything else - every status code, every validation rule, every error mapping, every edge case of the service - runs against the fake, in milliseconds, on every save."),

        h2("6. Testing the handler end to end"),
        p("With a trustworthy store, the integration test drives the real handler, service and validation, and checks what the customer sees and what was stored. Two habits keep these tests independent:"),
        bullets([
            "**A fresh store per test, in `beforeEach`.** You met `beforeEach` in JS-1 lesson 8. Here it builds the whole stack: a new store, a new service, a new handler. No test can see another test's users, and every test passes when run alone (`--test-name-pattern`) or in any order.",
            "**Seed through the public API.** To set up an existing user, call `users.insert(...)` (or `handleSignup` itself). Never push objects into the fake's private array. Seeding through the API goes through the same rules as production data, and the test keeps working when the fake's internals change.",
        ]),
        code("javascript", `
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createSignupService } from "../src/signup-service.js";
import { createSignupHandler } from "../src/signup-handler.js";
import { createInMemoryUserStore } from "../src/stores/memory-user-store.js";

describe("POST /signup", () => {
    let users, handleSignup;

    beforeEach(() => {
        users = createInMemoryUserStore();                  // a fresh, empty store for every test
        handleSignup = createSignupHandler(createSignupService({ users }));
    });

    it("creates the user and returns 201", async () => {
        const res = await handleSignup({ body: { email: " Ann@Shop.vn ", name: "Ann" } });

        assert.equal(res.status, 201);
        assert.deepEqual(await users.findByEmail("ann@shop.vn"), { id: 1, email: "ann@shop.vn", name: "Ann" });
    });

    it("returns 409 for an email registered before the fix, in another case", async () => {
        await users.insert({ email: "Ann@Shop.vn", name: "Ann" });   // a legacy row, seeded through the public API

        const res = await handleSignup({ body: { email: "ann@shop.vn", name: "Ann" } });

        assert.deepEqual(res, { status: 409, body: { error: "email already registered" } });
        assert.equal((await users.list()).length, 1);
    });

    it("returns 400 for an invalid email and stores nothing", async () => {
        const res = await handleSignup({ body: { email: "ann.shop.vn", name: "Ann" } });

        assert.equal(res.status, 400);
        assert.deepEqual(await users.list(), []);
    });
});`, "test/signup.integration.test.js"),
        p("Each test checks both sides: the response the customer gets, and the state the store holds afterwards. A 409 that still inserted a second row, or a 400 that stored half a user, would pass a test that looks only at the status."),
        p("These tests import `createInMemoryUserStore` - the store you build now. The grader runs a contract suite against your store, then wires it to the fixed signup service and `handleSignup` and checks the 201, 409 and 400 paths."),
        challenge("chal_coding_qaf_231", "Walk through the contract rules from section 4, one by one: async methods, a counter for ids starting at 1, a copy when you store and a fresh copy on every return (list() included), emails compared after toLowerCase(), an Error with error.code = \"DUPLICATE_EMAIL\" for a duplicate, and null when nothing matches. Keep all data inside the function, so every call gives a new, empty store."),

        h2("7. The fix"),
        p("The service fix has two parts. First, normalise the email **before** the write, so the stored row is what the code intends. Second, stop asking \"does it exist?\" before inserting: let the unique index decide, and translate its error into a 409:"),
        code("javascript", `
import { ValidationError, ConflictError } from "./errors.js";

const EMAIL = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

export function createSignupService({ users }) {
    return {
        async signup({ email, name } = {}) {
            if (typeof email !== "string" || !EMAIL.test(email.trim())) throw new ValidationError("email is invalid");
            if (typeof name !== "string" || name.trim() === "") throw new ValidationError("name is required");

            try {
                // Normalise BEFORE the write, and let the unique index decide: no check-then-insert race.
                return await users.insert({ email: email.trim().toLowerCase(), name: name.trim() });
            } catch (err) {
                if (err.code === "DUPLICATE_EMAIL") throw new ConflictError("email already registered", { cause: err });
                throw err;
            }
        },
    };
}`, "src/signup-service.js"),
        p("The repository's lookups now use `WHERE lower(email) = lower($1)`. Rows written before the fix still contain mixed case, so the store, not the service, must ignore case. The real store's shape, for comparison with your fake:"),
        code("javascript", `
// CREATE TABLE users (id bigserial PRIMARY KEY, email text NOT NULL, name text NOT NULL);
// CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
export function createPgUserStore(pool) {
    return {
        async insert({ email, name }) {
            try {
                const { rows } = await pool.query(
                    "INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id, email, name",
                    [email, name],
                );
                return rows[0];
            } catch (err) {
                if (err.code === "23505") {               // unique_violation
                    throw Object.assign(new Error(\`email already registered: \${email}\`), { code: "DUPLICATE_EMAIL", cause: err });
                }
                throw err;
            }
        },
        async findByEmail(email) {
            const { rows } = await pool.query(
                "SELECT id, email, name FROM users WHERE lower(email) = lower($1)", [email]);
            return rows[0] ?? null;
        },
        async list() {
            const { rows } = await pool.query("SELECT id, email, name FROM users ORDER BY id");
            return rows;
        },
    };
}`, "src/stores/pg-user-store.js"),
        p("The fake also reproduces the race, without threads or sleeps. Start two signups at once with `Promise.all`. Against the shipped service and an honest fake, the answers are `[201, 500]`. After the fix they are `[201, 409]`, and exactly one row is stored:"),
        code("javascript", `
it("two simultaneous signups for the same email: one 201, one 409", async () => {
    const results = await Promise.all([
        handleSignup({ body: { email: "Ann@Shop.vn", name: "Ann" } }),
        handleSignup({ body: { email: "ann@shop.vn", name: "Ann" } }),
    ]);

    assert.deepEqual(results.map((r) => r.status), [201, 409]);
    assert.equal((await users.list()).length, 1);
});`, "test/signup.integration.test.js"),
        p("Notice what happened to the old unit test **signup rejects an email that is already registered**. It now fails, with \"insert must not be called\": its stub was built around check-then-insert, which no longer exists. The behaviour is correct; the stub described the old implementation. The integration test for the same rule, which only sees requests and stored rows, stayed green through the refactor. Delete the stub-based test."),
        image("stubs-fakes-real-database", {
            alt: "Three columns. Left, red: a unit test calls the signup service directly, with no handler and no store; the service talks to stubs where findByEmail always resolves to null and insert returns the same object - about 1 ms, agrees with the code. Middle, green: an integration test calls handleSignup(req), then the signup service and validation, then createInMemoryUserStore(), which returns copies, keeps emails unique in any case, returns null and rejects with error codes - about 1 ms, real wiring with a fake edge. Right, blue: a contract test calls createPgUserStore(pool), which runs real SQL against Postgres in Docker with a unique index on lower(email) - slower, needs Postgres in CI. Below, a box labelled runUserStoreContract(makeStore) has arrows marked same suite pointing up to both the in-memory store and the Postgres store: one suite runs against the fake on every run and against Postgres in CI, checking that stores return copies, reject the same email in any case with DUPLICATE_EMAIL, and return null for an unknown email. A red note under the stub column says nothing checks a stub: the guesses kept the suite green while production answered 500.",
            caption: "Replace only the slow edge. The shared contract suite is what makes the fake's answers the database's answers.",
        }),
        callout("success", "After the fix",
            "The two reproduction tests and the race test are green. The integration suite runs about 30 tests through handleSignup in under a second. The contract suite runs against the fake on every save and against Postgres in CI. Two weeks later someone changed the repository's lookup back to WHERE email = $1 during a refactor; the Postgres contract job failed on \"finds a user by email in any case\" before the change was merged."),

        h2("8. Pitfalls"),
        bullets([
            "**A fake that returns its own objects.** Any test that changes a returned object, or reads back an object it passed in, then checks its own change instead of the store. Copy on the way in and on the way out.",
            "**A fake that is smarter than the database.** If the fake ignores case but the real lookup does not, your tests pass and production fails. That is exactly this incident in reverse. Only the contract suite, run against both stores, catches it.",
            "**Contract tests that assert things only the fake guarantees.** In Postgres, a failed insert still uses up a value from the id sequence: after `ann` (id 1) and a rejected duplicate, the next user gets id 3, not 2. A contract test that expects id 2 passes against the fake and fails in CI. Check what both stores promise (an id is a number, ids increase) and keep exact-id checks in fake-only tests.",
            "**Shared state between tests.** A store created once at module level, or a fake that keeps its rows in a module-level array, lets one test's users leak into the next. Then tests pass in one order and fail in another. Create the store in `beforeEach`; **Flaky tests: order, time & shared state** goes deeper.",
            "**Seeding by reaching inside the fake.** `users._rows.push({...})` skips the uniqueness rule and the copy, and breaks when the fake's internals change. Seed through `insert` or through the handler.",
            "**Helpers inside `test/`.** `node --test` treats every `.js` file inside a `test/` folder as a test file. A contract helper in `test/support/` is run on its own as a \"test\" and reported as a passing file. Keep shared helpers in another folder, such as `testing/`.",
            "**Forgetting `await` on `assert.rejects`.** Every store method is async, so every duplicate check is a promise. Without `await` the test ends before the assertion runs (JS-1 lesson 8).",
            "**Stubbing what you should integrate.** If a test replaces the service to test the handler, it cannot see the service's real errors - the 500 in this incident came from that seam.",
        ]),
        callout("tip", "Break the fake on purpose",
            "Change your fake's email comparison to === and run the contract suite: the case tests must go red. Return the stored object instead of a copy: the mutation test must go red. A contract test you have never seen fail does not protect anything."),

        h2("9. Checklist"),
        bullets([
            "Integration tests drive the real handler, validation and service; only the slow or external edge is replaced.",
            "The fake has the same methods as the real store, all `async`, and returns `null` for not found.",
            "The fake copies on write and on read; no caller ever holds a reference to a stored row.",
            "Uniqueness and lookups follow the real index (`lower(email)`), and duplicates reject with the code the service maps (`DUPLICATE_EMAIL`).",
            "Lists come back in a defined order, like the real `ORDER BY`.",
            "One contract suite takes a store factory and runs against the fake on every run and against Postgres in CI.",
            "Contract tests assert only what both stores guarantee.",
            "A fresh store is created per test in `beforeEach`, and data is seeded through the public API.",
            "Every integration test checks the response and the stored state.",
            "A few real-database tests cover SQL, constraints and migrations; everything else runs against the fake.",
        ]),
    ],
});
