import { readFileSync } from "node:fs";

// Chợ Sớm home page widgets. The catalog is loaded once and shared by every page: the category
// pages show it in its original order, so no widget may change it.
//
// bestSellers(catalog, n): the n products with the most units sold, most sold first; products with
//   the same number sold are ordered by sku, in plain string order ("DRY-310" before "EGG-020").
//   If the catalog has fewer than n products, all of them.
// priceRange(catalog): [the lowest price, the highest price]. The catalog is never empty.
//
// The bug: after the home page rendered once, every category page showed its products by sales,
// and the price filter said the most expensive product cost 65.000 đ. The catalog is readonly now,
// and the starter no longer compiles. Fix bestSellers and priceRange without changing their
// signatures or the test runner.

interface Product {
    readonly sku: string;
    name: string;
    price: number; // đồng
    sold: number;  // units sold this week
}

function bestSellers(catalog: readonly Product[], n: number): Product[] {
    return catalog
        .toSorted((a, b) => b.sold - a.sold || (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0))
        .slice(0, n);
}

function priceRange(catalog: readonly Product[]): [min: number, max: number] {
    const prices = catalog.map((p) => p.price).toSorted();
    return [prices[0], prices[prices.length - 1]];
}

// ---------------------------------------------------------------- test runner (do not change)
const { n, catalog }: { n: number; catalog: readonly Product[] } = JSON.parse(readFileSync(0, "utf8"));
bestSellers(catalog, n).forEach((p, i) => console.log(`${i + 1}. ${p.name} (${p.sold} sold)`));
const [min, max] = priceRange(catalog);
console.log(`price range: ${min} - ${max}`);
console.log(`catalog: ${catalog.map((p) => p.sku).join(", ")}`);
