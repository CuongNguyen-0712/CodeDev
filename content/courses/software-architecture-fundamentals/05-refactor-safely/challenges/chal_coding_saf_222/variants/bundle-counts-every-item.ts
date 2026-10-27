import { readFileSync } from "node:fs";

// CodeDev checkout: calculatePrice(order) below is the price a learner pays for a cart of premium
// courses. It is correct (finance checked it against six months of invoices) and nobody dares to
// touch it: 150 lines, one function, every rule tangled with the others.
//
// Split it into the small functions below, then make calculatePrice use them. The test runner
// calls every function on its own AND calculatePrice, and the results must stay exactly what the
// old code returns today, for every order (odd ones included). The spec, rule by rule:
//
//   free for staff  order.staff === true: the total is 0, whatever the cart holds.
//   counted items   an item counts only when its priceVnd is a positive whole number; among the
//                   items that count, a courseId that appears again counts once (the first one).
//                   No counted item: the total is 0.
//   subtotal        the sum of the counted prices.
//   bundle          3 or 4 counted courses: 10 percent off; 5 or more: 15 percent off.
//   percent coupon  { type: "percent", value } with value a whole number from 1 to 100: value
//                   percent off. Percent discounts do not stack: the larger one of the bundle
//                   percent and the coupon percent applies, once:  subtotal * (100 - p) / 100
//   fixed coupon    { type: "fixed", value } with value a positive whole number: value đồng off
//                   after the percent discount, never below 0. Any other coupon is ignored.
//   VAT, rounding   10 percent VAT on what is left, rounded to the whole đồng once, at the end:
//                   Math.round(net * 110 / 100). Nothing is rounded before that.
//
// The functions the test runner calls (keep these names and signatures):
//   countedItems(items)      the items that count, in their original order
//   subtotalOf(items)        the sum of priceVnd of the given (already counted) items
//   bundlePercent(count)     0, 10 or 15 for a number of counted courses
//   couponPercent(coupon)    the percent of a valid percent coupon, 0 for anything else
//   fixedDiscount(coupon)    the đồng of a valid fixed coupon, 0 for anything else
//   totalWithVat(net)        VAT and the one rounding, for a net amount that is not rounded
//   calculatePrice(order)    the total, built from the functions above
// Do not change the types or the test runner.

type Item = { courseId: string; priceVnd: number };
type Coupon = { type: string; value: number };
type Order = { items: Item[]; coupon: Coupon | null; staff: boolean };

// ---------------------------------------------------------------- your code
function countedItems(items: Item[]): Item[] {
    if (!Array.isArray(items)) return [];
    const seen = new Set<string>();
    const counted: Item[] = [];
    for (const item of items) {
        if (item == null || typeof item.priceVnd !== "number") continue;
        if (!Number.isInteger(item.priceVnd) || item.priceVnd <= 0) continue;
        if (seen.has(item.courseId)) continue;
        seen.add(item.courseId);
        counted.push(item);
    }
    return counted;
}

function subtotalOf(items: Item[]): number {
    return items.reduce((sum, item) => sum + item.priceVnd, 0);
}

function bundlePercent(count: number): number {
    if (count >= 5) return 15;
    if (count >= 3) return 10;
    return 0;
}

function couponPercent(coupon: Coupon | null): number {
    if (coupon == null || coupon.type !== "percent") return 0;
    const { value } = coupon;
    return Number.isInteger(value) && value >= 1 && value <= 100 ? value : 0;
}

function fixedDiscount(coupon: Coupon | null): number {
    if (coupon == null || coupon.type !== "fixed") return 0;
    return Number.isInteger(coupon.value) && coupon.value > 0 ? coupon.value : 0;
}

function totalWithVat(net: number): number {
    return Math.round((net * 110) / 100);
}

function calculatePrice(order: Order): number {
    if (order.staff === true) return 0;
    const items = countedItems(order.items);
    if (items.length === 0) return 0;
    const percent = Math.max(bundlePercent(order.items.length), couponPercent(order.coupon));
    const afterPercent = (subtotalOf(items) * (100 - percent)) / 100;
    const net = Math.max(0, afterPercent - fixedDiscount(order.coupon));
    return totalWithVat(net);
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: a list of calls ["functionName", argument]. Output: one line per call,
// "functionName -> <result as JSON>", or "functionName -> threw: <message>".
type Call = [string, unknown];

const functions: Record<string, (arg: never) => unknown> = {
    countedItems,
    subtotalOf,
    bundlePercent,
    couponPercent,
    fixedDiscount,
    totalWithVat,
    calculatePrice,
};

const calls: Call[] = JSON.parse(readFileSync(0, "utf8"));
for (const [name, arg] of calls) {
    const fn = functions[name];
    let result: string;
    try {
        result = JSON.stringify(fn(arg as never));
    } catch (error) {
        result = `threw: ${error instanceof Error ? error.message : String(error)}`;
    }
    console.log(`${name} -> ${result}`);
}
