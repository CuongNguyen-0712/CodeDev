import { readFileSync } from "node:fs";

// Chợ Sớm weekly report: three small helpers, used for orders AND for product reviews.
//
// countBy(items, key): how many items have each key, as a Map; keys in the order they first appear.
// maxBy(items, score): the item with the highest score; when several items share the highest
//   score, the first of them; undefined for an empty list.
// sumBy(items, value): the sum of value(item) over all items; 0 for an empty list.
//
// The old JavaScript helpers took (items, "propertyName"), and a typo in the property name turned
// the revenue into NaN. These take a callback instead, and they must be generic: the test runner
// calls each of them with Order[] and with Review[].
//
// countBy has its signature already. Write its body, then write maxBy and sumBy - signatures
// included. Until both exist, the test runner does not compile. Do not change the test runner.

// how many items have each key, keys in the order they first appear
function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
    const counts = new Map<string, number>();
    for (const item of items) {
        const k = key(item);
        counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return new Map([...counts].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

// the first item with the highest score, or undefined for an empty list
function maxBy<T>(items: readonly T[], score: (item: T) => number): T | undefined {
    let best: T | undefined;
    let bestScore = -Infinity;
    for (const item of items) {
        const s = score(item);
        if (s > bestScore) {
            best = item;
            bestScore = s;
        }
    }
    return best;
}

// the sum of value(item) over all items
function sumBy<T>(items: readonly T[], value: (item: T) => number): number {
    return items.reduce((total, item) => total + value(item), 0);
}

// ---------------------------------------------------------------- test runner (do not change)
type OrderStatus = "paid" | "cancelled" | "refunded";
interface Order { id: string; status: OrderStatus; total: number }
interface Review { sku: string; author: string; stars: 1 | 2 | 3 | 4 | 5 }

const { orders, reviews }: { orders: Order[]; reviews: Review[] } = JSON.parse(readFileSync(0, "utf8"));
const list = (counts: Map<string, number>) =>
    counts.size === 0 ? "none" : [...counts].map(([key, n]) => `${key} ${n}`).join(", ");

console.log(`orders by status: ${list(countBy(orders, (o) => o.status))}`);
console.log(`revenue: ${sumBy(orders.filter((o) => o.status === "paid"), (o) => o.total)}`);
const biggest = maxBy(orders, (o) => o.total);
console.log(`biggest order: ${biggest ? `${biggest.id} (${biggest.total})` : "none"}`);

console.log(`reviews by stars: ${list(countBy(reviews, (r) => `${r.stars}*`))}`);
const best = maxBy(reviews, (r) => r.stars);
console.log(`best review: ${best ? `${best.sku} by ${best.author} (${best.stars}*)` : "none"}`);
const average = reviews.length === 0 ? "none" : (sumBy(reviews, (r) => r.stars) / reviews.length).toFixed(1);
console.log(`average stars: ${average}`);
