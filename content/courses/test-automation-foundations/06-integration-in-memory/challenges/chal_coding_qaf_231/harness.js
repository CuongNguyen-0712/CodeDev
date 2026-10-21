// Harness: an in-memory user store that keeps the real store's contract.
// Runs one group of checks against the learner's createInMemoryUserStore():
//   "basics" | "isolation" | "duplicates" | "lookup"  - the user store contract
//   "signup"                                          - integration: correct signup service + handler + learner's store
//   "hidden"                                          - fresh stores, concurrent signups, list order
// Output: "passed" or "failed: <what went wrong>".
async function __harness(input) {
    // ---- the shop's signup service and handler (the correct versions from the lesson's fix) ----
    class ValidationError extends Error {}
    class ConflictError extends Error {}
    const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function createSignupService({ users }) {
        return {
            async signup({ email, name } = {}) {
                if (typeof email !== "string" || !EMAIL.test(email.trim())) throw new ValidationError("email is invalid");
                if (typeof name !== "string" || name.trim() === "") throw new ValidationError("name is required");
                try {
                    return await users.insert({ email: email.trim().toLowerCase(), name: name.trim() });
                } catch (err) {
                    if (err && err.code === "DUPLICATE_EMAIL") throw new ConflictError("email already registered");
                    throw err;
                }
            },
        };
    }

    function createSignupHandler(service) {
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
    }

    // ---- tiny assertion helpers ----
    const show = (v) => (v === undefined ? "undefined" : JSON.stringify(v));
    function canonical(v) {
        if (Array.isArray(v)) return v.map(canonical);
        if (v && typeof v === "object") {
            const out = {};
            for (const k of Object.keys(v).sort()) out[k] = canonical(v[k]);
            return out;
        }
        return v;
    }
    function same(actual, expected, what) {
        if (show(canonical(actual)) !== show(canonical(expected))) {
            throw new Error(`${what}: expected ${show(expected)}, got ${show(actual)}`);
        }
    }
    function check(condition, message) {
        if (!condition) throw new Error(message);
    }
    function isPromise(v) {
        return v !== null && typeof v === "object" && typeof v.then === "function";
    }
    async function rejection(promise, what) {
        check(isPromise(promise), `${what}: must return a promise that rejects, like the real store`);
        try {
            await promise;
        } catch (err) {
            return err;
        }
        throw new Error(`${what}: expected the promise to reject, but it resolved`);
    }
    function newStore() {
        const store = createInMemoryUserStore();
        check(store !== null && typeof store === "object", "createInMemoryUserStore() must return an object");
        for (const m of ["insert", "findByEmail", "list"]) check(typeof store[m] === "function", `the store has no ${m}() method`);
        return store;
    }
    const newHandler = (users) => createSignupHandler(createSignupService({ users }));

    const groups = {
        async basics() {
            const users = newStore();
            const pending = users.insert({ email: "Ann@Shop.vn", name: "Ann" });
            check(isPromise(pending), "insert() must return a promise, like the real store");
            same(await pending, { id: 1, email: "Ann@Shop.vn", name: "Ann" }, "first insert resolves to");
            same(await users.insert({ email: "bob@shop.vn", name: "Bob" }), { id: 2, email: "bob@shop.vn", name: "Bob" }, "second insert resolves to");
            const found = users.findByEmail("bob@shop.vn");
            check(isPromise(found), "findByEmail() must return a promise, like the real store");
            same(await found, { id: 2, email: "bob@shop.vn", name: "Bob" }, "findByEmail(\"bob@shop.vn\")");
            const all = users.list();
            check(isPromise(all), "list() must return a promise, like the real store");
            same(await all, [{ id: 1, email: "Ann@Shop.vn", name: "Ann" }, { id: 2, email: "bob@shop.vn", name: "Bob" }], "list()");
        },

        async isolation() {
            const users = newStore();
            const input = { email: "ann@shop.vn", name: "Ann" };
            const saved = await users.insert(input);
            check(saved !== input, "insert() returned the very object it was given; return a copy");
            input.name = "Changed via input";
            same((await users.findByEmail("ann@shop.vn")).name, "Ann", "name after changing the object passed to insert()");
            saved.name = "Changed via insert result";
            same((await users.findByEmail("ann@shop.vn")).name, "Ann", "name after changing the object insert() returned");
            const found = await users.findByEmail("ann@shop.vn");
            found.name = "Changed via findByEmail result";
            same((await users.findByEmail("ann@shop.vn")).name, "Ann", "name after changing the object findByEmail() returned");
            const all = await users.list();
            all[0].name = "Changed via list result";
            all.push({ id: 99, email: "eve@shop.vn", name: "Eve" });
            same(await users.list(), [{ id: 1, email: "ann@shop.vn", name: "Ann" }], "list() after changing the array list() returned");
        },

        async duplicates() {
            const users = newStore();
            await users.insert({ email: "Ann@Shop.vn", name: "Ann" });
            for (const email of ["Ann@Shop.vn", "ann@shop.vn", "ANN@SHOP.VN"]) {
                const err = await rejection(users.insert({ email, name: "Ann again" }), `insert of "${email}" after "Ann@Shop.vn"`);
                check(err instanceof Error, `insert of "${email}": reject with an Error, got ${show(err)}`);
                same(err.code, "DUPLICATE_EMAIL", `insert of "${email}": error.code`);
            }
            same(await users.list(), [{ id: 1, email: "Ann@Shop.vn", name: "Ann" }], "list() after the rejected duplicates");
            same(await users.insert({ email: "anna@shop.vn", name: "Anna" }), { id: 2, email: "anna@shop.vn", name: "Anna" }, "a different email is still accepted");
        },

        async lookup() {
            const users = newStore();
            same(await users.findByEmail("nobody@shop.vn"), null, "findByEmail on an empty store");
            await users.insert({ email: "Ann@Shop.vn", name: "Ann" });
            same(await users.findByEmail("ann@shop.vn"), { id: 1, email: "Ann@Shop.vn", name: "Ann" }, "findByEmail(\"ann@shop.vn\")");
            same(await users.findByEmail("ANN@SHOP.VN"), { id: 1, email: "Ann@Shop.vn", name: "Ann" }, "findByEmail(\"ANN@SHOP.VN\")");
            same(await users.findByEmail("nobody@shop.vn"), null, "findByEmail(\"nobody@shop.vn\")");
        },

        async signup() {
            let users = newStore();
            let handleSignup = newHandler(users);
            same(await handleSignup({ body: { email: " Ann@Shop.vn ", name: "Ann" } }),
                { status: 201, body: { id: 1, email: "ann@shop.vn", name: "Ann" } }, "first signup");
            same(await users.findByEmail("ann@shop.vn"), { id: 1, email: "ann@shop.vn", name: "Ann" }, "stored user after the signup");

            // A legacy row written before the fix, in mixed case, seeded through the store's public API.
            users = newStore();
            handleSignup = newHandler(users);
            await users.insert({ email: "Bob@Shop.vn", name: "Bob" });
            same(await handleSignup({ body: { email: "bob@shop.vn", name: "Bob" } }),
                { status: 409, body: { error: "email already registered" } }, "signup of \"bob@shop.vn\" when \"Bob@Shop.vn\" exists");
            same((await users.list()).length, 1, "number of users after the 409");

            users = newStore();
            handleSignup = newHandler(users);
            same(await handleSignup({ body: { email: "carol.shop.vn", name: "Carol" } }),
                { status: 400, body: { error: "email is invalid" } }, "signup with an invalid email");
            same(await users.list(), [], "list() after the 400");
        },

        async hidden() {
            const first = newStore();
            await first.insert({ email: "ann@shop.vn", name: "Ann" });
            const second = newStore();
            same(await second.list(), [], "a second store must start empty (no shared module-level data)");
            same(await second.findByEmail("ann@shop.vn"), null, "findByEmail in a second, empty store");

            const users = newStore();
            const handleSignup = newHandler(users);
            const [a, b] = await Promise.all([
                handleSignup({ body: { email: "Dan@Shop.vn", name: "Dan" } }),
                handleSignup({ body: { email: "dan@shop.vn", name: "Dan" } }),
            ]);
            same([a.status, b.status], [201, 409], "statuses of two simultaneous signups for the same email");
            await users.insert({ email: "eve@shop.vn", name: "Eve" });
            await users.insert({ email: "fay@shop.vn", name: "Fay" });
            const all = await users.list();
            same(all.map((u) => u.id), [1, 2, 3], "ids from list()");
            same(all.map((u) => u.email), ["dan@shop.vn", "eve@shop.vn", "fay@shop.vn"], "emails from list()");
        },
    };

    const group = groups[input.group];
    if (!group) throw new Error(`unknown group ${input.group}`);
    try {
        await group();
        return "passed";
    } catch (error) {
        return `failed: ${error && error.message ? error.message : String(error)}`;
    }
}
