import { readFileSync } from "node:fs";

// Chợ Sớm admin: the "quick edit" panel and the stock summary on the dashboard.
//
// applyPatch(product, patch) returns a NEW product with the edits applied:
//   - the form library sends every field; a field the admin did not touch is undefined and must
//     not change anything;
//   - a price or a stock below 0 is a typing mistake: ignore that field, apply the others;
//   - the original product must not change (the dashboard compares old and new);
//   - the sku can never be edited, and ProductPatch already makes that a compile error.
//
// stockSummary(products) returns the total stock of each category. Every category is in the
// result, with 0 when no product has it.
//
// The starter does not compile: an empty object is not a StockSummary. Write both functions;
// do not change the types or the test runner.

type Category = "vegetables" | "fruit" | "meat" | "dairy" | "dry";

interface Product {
    readonly sku: string;
    name: string;
    category: Category;
    price: number; // đồng
    stock: number;
}

type ProductPatch = Partial<Omit<Product, "sku">>;
type StockSummary = Record<Category, number>;

function applyPatch(product: Product, patch: ProductPatch): Product {
    return product;
}

function stockSummary(products: readonly Product[]): StockSummary {
    return {};
}

// ---------------------------------------------------------------- test runner (do not change)
const CATEGORIES: readonly Category[] = ["vegetables", "fruit", "meat", "dairy", "dry"];
type Edit = { sku: string; patch: { [K in keyof ProductPatch]: ProductPatch[K] | null } };
const input: { products: Product[]; edits: Edit[] } = JSON.parse(readFileSync(0, "utf8"));

const before = input.products;
const snapshot = structuredClone(before);
const same = (a: Product, b: Product) =>
    a.sku === b.sku && a.name === b.name && a.category === b.category && a.price === b.price && a.stock === b.stock;
let after: Product[] = [...before];
for (const edit of input.edits) {
    const i = after.findIndex((p) => p.sku === edit.sku);
    if (i < 0) {
        console.log(`no product ${edit.sku}`);
        continue;
    }
    // like the form library: an untouched field arrives as undefined (null in this JSON)
    const patch: ProductPatch = {};
    for (const [key, value] of Object.entries(edit.patch)) {
        Object.assign(patch, { [key]: value ?? undefined });
    }
    after = after.with(i, applyPatch(after[i], patch));
}

for (const p of after) {
    console.log(`${p.sku} ${p.name} (${p.category}) ${p.price} đ, stock ${p.stock}`);
}
const changed = after.filter((p, i) => !same(p, snapshot[i])).length;
const untouched = before.every((p, i) => same(p, snapshot[i]));
console.log(`changed ${changed}, originals ${untouched ? "intact" : "MODIFIED"}`);
const summary = stockSummary(after);
console.log(`stock: ${CATEGORIES.map((c) => `${c} ${summary[c]}`).join(", ")}`);
