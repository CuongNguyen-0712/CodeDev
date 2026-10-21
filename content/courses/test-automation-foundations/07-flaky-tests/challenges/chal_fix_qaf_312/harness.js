// Harness: Make the coupon suite stable (and keep it able to catch bugs)
// Runs the learner's couponSuite(t, deps) many times. Every run registers the tests again
// (like a fresh process per test file), then runs them in some order at some simulated wall-clock time.
//   input: { check: "orders" | "alone" | "times" }  -> "stable" | "failed <where>: \"<test>\": <message>"
//   input: { check: "bug", impl: "<bug name>" }     -> "bug caught" (every run fails)
//                                                     | "bug survived" (no run fails)
//                                                     | "bug caught in only <k> of <n> runs (flaky)"
async function __harness(input) {
    // The simulated "real" clock: a different wall-clock time per run, never Date.now().
    const DEFAULT_WALL = "2026-10-21T03:15:42.250Z"; // 10:15 in Vietnam, a normal workday
    const WALL_TIMES = [
        DEFAULT_WALL,
        "2026-10-21T17:30:00.000Z", // 00:30 the next day in Vietnam (UTC+7)
        "2026-10-31T23:59:59.999Z", // last millisecond of October (UTC)
        "2026-11-01T00:00:00.000Z", // first millisecond of November (UTC)
        "2026-02-28T12:00:00.700Z", // last day of a short month
    ];
    const SEEDS = [1, 2, 3, 10, 11, 12];

    const implementations = {
        correct: (coupon, cart, now) =>
            cart.totalCents() >= coupon.minTotalCents && now < Date.parse(coupon.expiresAt) + 1000,
        // Rejects the coupon during its whole last second (the incident's bug).
        expiresOneSecondEarly: (coupon, cart, now) =>
            cart.totalCents() >= coupon.minTotalCents && now < Date.parse(coupon.expiresAt),
        // Forgets the minimum cart total.
        ignoresMinimum: (coupon, cart, now) => now < Date.parse(coupon.expiresAt) + 1000,
        // A cart of exactly the minimum is rejected (> instead of >=).
        minimumOffByOne: (coupon, cart, now) =>
            cart.totalCents() > coupon.minTotalCents && now < Date.parse(coupon.expiresAt) + 1000,
        // Still valid at the first millisecond after the expiry second (<= instead of <).
        validOneSecondLate: (coupon, cart, now) =>
            cart.totalCents() >= coupon.minTotalCents && now <= Date.parse(coupon.expiresAt) + 1000,
    };

    function mulberry32(seed) {
        return () => {
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function shuffled(list, seed) {
        const out = [...list];
        const random = mulberry32(seed);
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }
    const ORDERS = [
        { label: "in the written order", arrange: (tests) => tests },
        { label: "in reverse order", arrange: (tests) => [...tests].reverse() },
        ...SEEDS.map((seed) => ({ label: `in shuffled order (seed ${seed})`, arrange: (tests) => shuffled(tests, seed) })),
    ];

    function createCart() {
        let total = 0;
        return {
            add(priceCents, qty = 1) {
                if (!Number.isInteger(priceCents) || !Number.isInteger(qty) || priceCents < 0 || qty < 1) {
                    throw new RangeError(`cart.add expects whole cents and a quantity >= 1, got ${priceCents} x ${qty}`);
                }
                total += priceCents * qty;
            },
            totalCents: () => total,
        };
    }

    function makeAssert(counter) {
        const fail = (message, fallback) => {
            throw new Error(message || fallback);
        };
        return {
            ok(value, message) {
                counter.count++;
                if (!value) fail(message, `expected a truthy value, got ${String(value)}`);
            },
            strictEqual(actual, expected, message) {
                counter.count++;
                if (!Object.is(actual, expected)) fail(message, `expected ${String(expected)}, got ${String(actual)}`);
            },
        };
    }

    // One run: register the suite, run the chosen tests in the chosen order.
    // Returns null when every test passed, otherwise { test, message } for the first failure.
    async function runOnce(implName, wallIso, arrange, onlyIndex) {
        const impl = implementations[implName];
        const wall = Date.parse(wallIso);
        let pinned = null;
        const clock = {
            now: () => (pinned === null ? wall : pinned),
            set(time) {
                const ms = typeof time === "number" ? time : Date.parse(time);
                if (!Number.isFinite(ms)) throw new Error(`clock.set: invalid time ${String(time)}`);
                pinned = ms;
            },
        };
        const counter = { count: 0 };
        const tests = [];
        const hooks = [];
        const t = {
            test(name, fn) {
                tests.push({ name: String(name), fn });
            },
            beforeEach(fn) {
                hooks.push(fn);
            },
        };
        const deps = {
            isCouponValid: (coupon, cart) => impl(coupon, cart, clock.now()),
            createCart,
            clock: { now: clock.now, set: clock.set },
            assert: makeAssert(counter),
        };
        try {
            couponSuite(t, deps);
        } catch (error) {
            return { test: "(registering the suite)", message: (error && error.message) || String(error) };
        }
        if (tests.length === 0) return { test: "(the suite)", message: "no tests registered" };

        const selected = onlyIndex === undefined ? arrange(tests) : tests.slice(onlyIndex, onlyIndex + 1);
        for (const test of selected) {
            pinned = null; // like t.mock.timers: the clock goes back to wall time for every test
            counter.count = 0;
            try {
                for (const hook of hooks) await hook();
                await test.fn();
            } catch (error) {
                return { test: test.name, message: (error && error.message) || String(error) };
            }
            if (counter.count === 0) return { test: test.name, message: "made no assertions" };
        }
        return null;
    }

    async function countTests() {
        let count = 0;
        try {
            couponSuite(
                { test() { count++; }, beforeEach() {} },
                { isCouponValid: () => true, createCart, clock: { now: () => 0, set() {} }, assert: makeAssert({ count: 0 }) },
            );
        } catch {
            return 0;
        }
        return count;
    }

    const where = (place, failure) => `failed ${place}: "${failure.test}": ${failure.message}`;

    if (input.check === "orders") {
        for (const order of ORDERS) {
            const failure = await runOnce("correct", DEFAULT_WALL, order.arrange);
            if (failure) return where(order.label, failure);
        }
        return "stable";
    }
    if (input.check === "alone") {
        const n = await countTests();
        if (n === 0) {
            const failure = await runOnce("correct", DEFAULT_WALL, (tests) => tests);
            return failure ? where("when run alone", failure) : "no tests registered";
        }
        for (let i = 0; i < n; i++) {
            const failure = await runOnce("correct", DEFAULT_WALL, (tests) => tests, i);
            if (failure) return where("when run alone", failure);
        }
        return "stable";
    }
    if (input.check === "times") {
        for (const wallIso of WALL_TIMES) {
            const failure = await runOnce("correct", wallIso, (tests) => tests);
            if (failure) return where(`with the wall clock at ${wallIso}`, failure);
        }
        return "stable";
    }
    if (input.check === "bug") {
        if (!implementations[input.impl]) throw new Error(`unknown implementation ${input.impl}`);
        let runs = 0;
        let failed = 0;
        for (const wallIso of WALL_TIMES) {
            for (const order of ORDERS) {
                runs++;
                if (await runOnce(input.impl, wallIso, order.arrange)) failed++;
            }
        }
        if (failed === runs) return "bug caught";
        if (failed === 0) return "bug survived";
        return `bug caught in only ${failed} of ${runs} runs (flaky)`;
    }
    throw new Error(`unknown check ${input.check}`);
}
