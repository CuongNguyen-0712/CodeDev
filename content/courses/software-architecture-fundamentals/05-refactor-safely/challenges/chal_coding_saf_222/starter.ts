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
    return [];
}

function subtotalOf(items: Item[]): number {
    return 0;
}

function bundlePercent(count: number): number {
    return 0;
}

function couponPercent(coupon: Coupon | null): number {
    return 0;
}

function fixedDiscount(coupon: Coupon | null): number {
    return 0;
}

function totalWithVat(net: number): number {
    return 0;
}

// The old code. It works: keep its results, replace its body.
function calculatePrice(order: Order): number {
    // staff get everything for free (HR asked for this in 2024)
    if (order) {
        if (order.staff === true) {
            return 0;
        }
    }

    // collect the courses
    let list: Item[] = [];
    let seen: string[] = [];
    let n = 0;
    if (order && order.items && Array.isArray(order.items)) {
        for (let i = 0; i < order.items.length; i++) {
            const it = order.items[i];
            let ok = true;
            if (it == null) {
                ok = false;
            } else {
                if (typeof it.priceVnd !== "number") {
                    ok = false;
                } else {
                    if (!Number.isInteger(it.priceVnd)) {
                        ok = false;
                    }
                    if (it.priceVnd <= 0) {
                        ok = false;
                    }
                }
            }
            if (ok) {
                // same course twice? only the first one
                let dup = false;
                for (let j = 0; j < seen.length; j++) {
                    if (seen[j] === it.courseId) {
                        dup = true;
                        break;
                    }
                }
                if (!dup) {
                    seen.push(it.courseId);
                    list.push(it);
                    n = n + 1;
                }
            }
        }
    }
    if (n === 0) {
        return 0;
    }

    // add up
    let sum = 0;
    for (let i = 0; i < list.length; i++) {
        sum = sum + list[i].priceVnd;
    }

    // bundle
    let b = 0;
    if (n >= 3) {
        if (n >= 5) {
            b = 15;
        } else {
            b = 10;
        }
    }

    // coupon (percent)
    let c = 0;
    const cp = order.coupon;
    if (cp != null) {
        if (cp.type === "percent") {
            if (typeof cp.value === "number" && Number.isInteger(cp.value)) {
                if (cp.value >= 1 && cp.value <= 100) {
                    c = cp.value;
                } else {
                    c = 0; // bad coupon, ignore
                }
            }
        }
    }

    // never both! marketing lost money on that in March
    let pct = 0;
    if (b > c) {
        pct = b;
    } else {
        pct = c;
    }

    let amount = sum;
    if (pct > 0) {
        amount = (sum * (100 - pct)) / 100;
    }

    // coupon (fixed)
    if (cp != null) {
        if (cp.type === "fixed") {
            if (typeof cp.value === "number") {
                if (Number.isInteger(cp.value) && cp.value > 0) {
                    amount = amount - cp.value;
                    if (amount < 0) {
                        amount = 0;
                    }
                }
            }
        }
    }

    // VAT 10%, round at the very end only (finance: "never round twice")
    let total = (amount * 110) / 100;
    total = Math.round(total);
    if (total < 0) {
        total = 0;
    }
    return total;
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
