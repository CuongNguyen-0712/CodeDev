import { readFileSync } from "node:fs";

// Write tests that catch bugs. applyCoupon below is CORRECT: it is the coupon rule of the CodeDev
// checkout. Your job is not to change it but to write the test cases for it, as data: cases()
// returns a list of { name, input, expected }. The test runner runs every case against applyCoupon
// (they must all pass) and then against seven MUTANTS: copies of applyCoupon with one small, planted
// bug each. A mutant is "killed" when at least one of your cases gives a different result on it.
// Your cases are good enough when every mutant is killed.
//
// The rule (prices in VND, whole numbers):
//   1. A coupon can be used up to and including its expiresOn day. If today is after expiresOn,
//      the price is unchanged.
//   2. "percent": the discount is value% of the price, rounded DOWN to a whole VND.
//      "fixed": the discount is value VND.
//   3. A coupon never takes a course below 10,000 VND: if price - discount is lower, the learner pays
//      10,000. A course that costs 10,000 VND or less (free courses included) is never discounted.
// Inputs are always valid: price and value are whole numbers >= 0, a percent value is 1-100, and
// dates are "YYYY-MM-DD" strings.
//
// Requirements for cases(): at least 6 cases, every name different, every expected value the price
// applyCoupon really returns. Do not change applyCoupon, the mutants or the test runner.

type Coupon = { kind: "percent" | "fixed"; value: number; expiresOn: string };
type Input = { price: number; coupon: Coupon; today: string };
type Case = { name: string; input: Input; expected: number };

// The shape of one case (on its own it kills only one mutant):
//   { name: "10% off a 100,000 VND course",
//     input: { price: 100000, coupon: { kind: "percent", value: 10, expiresOn: "2026-12-31" }, today: "2026-10-26" },
//     expected: 90000 }
function cases(): Case[] {
    return [
        {
            name: "10% off 100,000",
            input: { price: 100000, coupon: { kind: "percent", value: 10, expiresOn: "2026-12-31" }, today: "2026-10-26" },
            expected: 90000,
        },
        {
            name: "20% off 200,000",
            input: { price: 200000, coupon: { kind: "percent", value: 20, expiresOn: "2026-12-31" }, today: "2026-10-26" },
            expected: 160000,
        },
        {
            name: "50,000 off 300,000",
            input: { price: 300000, coupon: { kind: "fixed", value: 50000, expiresOn: "2026-12-31" }, today: "2026-10-26" },
            expected: 250000,
        },
        {
            name: "25% off 400,000",
            input: { price: 400000, coupon: { kind: "percent", value: 25, expiresOn: "2026-12-31" }, today: "2026-10-26" },
            expected: 300000,
        },
        {
            name: "30,000 off 150,000",
            input: { price: 150000, coupon: { kind: "fixed", value: 30000, expiresOn: "2026-12-31" }, today: "2026-10-26" },
            expected: 120000,
        },
        {
            name: "50% off 120,000",
            input: { price: 120000, coupon: { kind: "percent", value: 50, expiresOn: "2026-12-31" }, today: "2026-10-26" },
            expected: 60000,
        },
    ];
}

// ---------------------------------------------------------------- code under test (do not change)
const MIN_PRICE = 10_000;

function applyCoupon(price: number, coupon: Coupon, today: string): number {
    if (today > coupon.expiresOn) return price;
    if (price <= MIN_PRICE) return price;
    const discount = coupon.kind === "percent" ? Math.floor((price * coupon.value) / 100) : coupon.value;
    return Math.max(price - discount, MIN_PRICE);
}

// ---------------------------------------------------------------- mutants (do not change)
// Each mutant changes one thing in applyCoupon, the way a mutation testing tool would.
type Rule = (price: number, coupon: Coupon, today: string) => number;
const MUTANTS: Array<{ name: string; change: string; rule: Rule }> = [
    {
        name: "ignores-expiry",
        change: "the expiry check is removed",
        rule: (price, coupon) => {
            if (price <= MIN_PRICE) return price;
            const discount = coupon.kind === "percent" ? Math.floor((price * coupon.value) / 100) : coupon.value;
            return Math.max(price - discount, MIN_PRICE);
        },
    },
    {
        name: "expires-a-day-early",
        change: "today > coupon.expiresOn  ->  today >= coupon.expiresOn",
        rule: (price, coupon, today) => {
            if (today >= coupon.expiresOn) return price;
            if (price <= MIN_PRICE) return price;
            const discount = coupon.kind === "percent" ? Math.floor((price * coupon.value) / 100) : coupon.value;
            return Math.max(price - discount, MIN_PRICE);
        },
    },
    {
        name: "rounds-to-nearest",
        change: "Math.floor(...)  ->  Math.round(...)",
        rule: (price, coupon, today) => {
            if (today > coupon.expiresOn) return price;
            if (price <= MIN_PRICE) return price;
            const discount = coupon.kind === "percent" ? Math.round((price * coupon.value) / 100) : coupon.value;
            return Math.max(price - discount, MIN_PRICE);
        },
    },
    {
        name: "no-rounding",
        change: "Math.floor(price * value / 100)  ->  price * value / 100",
        rule: (price, coupon, today) => {
            if (today > coupon.expiresOn) return price;
            if (price <= MIN_PRICE) return price;
            const discount = coupon.kind === "percent" ? (price * coupon.value) / 100 : coupon.value;
            return Math.max(price - discount, MIN_PRICE);
        },
    },
    {
        name: "percent-and-fixed-swapped",
        change: "coupon.kind === \"percent\"  ->  coupon.kind === \"fixed\"",
        rule: (price, coupon, today) => {
            if (today > coupon.expiresOn) return price;
            if (price <= MIN_PRICE) return price;
            const discount = coupon.kind === "fixed" ? Math.floor((price * coupon.value) / 100) : coupon.value;
            return Math.max(price - discount, MIN_PRICE);
        },
    },
    {
        name: "no-minimum-price",
        change: "Math.max(price - discount, MIN_PRICE)  ->  price - discount",
        rule: (price, coupon, today) => {
            if (today > coupon.expiresOn) return price;
            if (price <= MIN_PRICE) return price;
            const discount = coupon.kind === "percent" ? Math.floor((price * coupon.value) / 100) : coupon.value;
            return price - discount;
        },
    },
    {
        name: "minimum-raises-cheap-courses",
        change: "the line \"if (price <= MIN_PRICE) return price;\" is removed",
        rule: (price, coupon, today) => {
            if (today > coupon.expiresOn) return price;
            const discount = coupon.kind === "percent" ? Math.floor((price * coupon.value) / 100) : coupon.value;
            return Math.max(price - discount, MIN_PRICE);
        },
    },
];

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "mutants": "all" } or { "mutants": ["ignores-expiry", ...] } (an empty list checks only
// your cases). Output: "cases: ok" or the first problem with your cases, then one line per mutant:
// killed, or survived (no valid case gives a different result on it).
const MIN_CASES = 6;

function resultOf(rule: Rule, c: Case): number | string {
    try {
        return rule(c.input.price, c.input.coupon, c.input.today);
    } catch (error) {
        return `error: ${(error as Error).message}`;
    }
}

function problemWith(list: Case[]): string | null {
    if (list.length < MIN_CASES) return `only ${list.length} case(s), write at least ${MIN_CASES}`;
    const names = new Set<string>();
    for (const c of list) {
        if (typeof c.name !== "string" || c.name.trim() === "") return "every case needs a name";
        if (names.has(c.name)) return `two cases are named "${c.name}"`;
        names.add(c.name);
        const actual = resultOf(applyCoupon, c);
        if (!Object.is(actual, c.expected)) return `"${c.name}" expects ${c.expected} but applyCoupon returns ${actual}`;
    }
    return null;
}

const request: { mutants: string[] | "all" } = JSON.parse(readFileSync(0, "utf8"));
const list = cases();
console.log(`cases: ${problemWith(list) ?? "ok"}`);
const valid = list.filter((c) => Object.is(resultOf(applyCoupon, c), c.expected)); // only passing cases can kill
const chosen = request.mutants === "all" ? MUTANTS : MUTANTS.filter((m) => request.mutants.includes(m.name));
for (const m of chosen) {
    const killed = valid.some((c) => !Object.is(resultOf(m.rule, c), c.expected));
    console.log(`${m.name}: ${killed ? "killed" : `survived (${m.change})`}`);
}
