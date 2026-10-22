import { readFileSync } from "node:fs";

// Chợ Sớm supplier webhook: farms post stock deliveries (and returns, with a negative qty) as JSON,
// one request body per line of input.
//
// parseUpdate(line) returns the StockUpdate, or the reason the body is rejected - the first
// that applies, in this order:
//   "not JSON"        the body is not valid JSON
//   "not an object"   valid JSON, but not an object (a number, a string, null, an array, ...)
//   "bad sku"         sku is missing, not a string, or an empty string
//   "bad qty"         qty is missing or not an integer number ("12" and 1.5 are rejected)
//   "bad warehouse"   warehouse is missing or not one of "HN-LB" and "HN-CG"
//
// The bug: the old code cast the parsed JSON with `as StockUpdate`. When a farm started sending
// "qty": "12", the stock of eggs became the string "4812". JSON.parse now returns unknown, and the
// starter no longer compiles. Fix parseUpdate by checking the data - no `as`, no `any`.
// Do not change the types or the test runner.

type Warehouse = "HN-LB" | "HN-CG";

interface StockUpdate {
    sku: string;
    qty: number;
    warehouse: Warehouse;
}

function parseUpdate(line: string): StockUpdate | string {
    let data: unknown;
    try {
        data = JSON.parse(line);
    } catch {
        return "not JSON";
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
        return "not an object";
    }
    if (!("sku" in data) || typeof data.sku !== "string" || data.sku === "") {
        return "bad sku";
    }
    if (!("qty" in data) || typeof data.qty !== "number") {
        return "bad qty";
    }
    if (!("warehouse" in data) || (data.warehouse !== "HN-LB" && data.warehouse !== "HN-CG")) {
        return "bad warehouse";
    }
    return { sku: data.sku, qty: data.qty, warehouse: data.warehouse };
}

// ---------------------------------------------------------------- test runner (do not change)
const stock = new Map<string, number>();
let accepted = 0;
const lines = readFileSync(0, "utf8").split("\n").filter((line) => line.trim() !== "");
lines.forEach((line, i) => {
    const result = parseUpdate(line);
    if (typeof result === "string") {
        console.log(`line ${i + 1} rejected: ${result}`);
        return;
    }
    accepted++;
    const key = `${result.warehouse} ${result.sku}`;
    stock.set(key, (stock.get(key) ?? 0) + result.qty);
});
for (const key of [...stock.keys()].toSorted()) {
    console.log(`${key}: ${stock.get(key)}`);
}
console.log(`accepted ${accepted}, rejected ${lines.length - accepted}`);
