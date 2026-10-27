import { readFileSync } from "node:fs";

// Wrong: the preferred position is read from the swapped run, so first and second are reversed, and 20% already counts as bias.


type Label = string | number;
type Item = { id: string; slice?: string; judge?: Label | null; human?: Label | null };
type Swap = { id: string; original?: unknown; swapped?: unknown; longer?: unknown };
type Agreement = {
    n: number;
    skipped: number;
    observed: number | null;
    expected: number | null;
    kappa: number | null;
    reason: "no_items" | "single_category" | null;
};
type Overall = Agreement & { matrix: number[][] };
type SliceAgreement = Agreement & { slice: string };
type Bias = {
    pairs: number;
    skipped: number;
    flips: number;
    flipRate: number | null;
    preferredPosition: "first" | "second" | null;
    positionBias: boolean;
    consistent: number;
    longerWins: number;
    verbosityRate: number | null;
    verbosityBias: boolean;
};
type Report = { overall: Overall; slices: SliceAgreement[]; bias: Bias } | { error: "bad_categories" };

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

function agreement(categories: Label[], items: Item[]): Overall {
    const k = categories.length;
    const matrix = categories.map(() => categories.map(() => 0));
    let n = 0;
    let skipped = 0;
    for (const it of items) {
        const h = categories.indexOf(it.human as Label);
        const j = categories.indexOf(it.judge as Label);
        if (h < 0 || j < 0) {
            skipped++;
            continue;
        }
        matrix[h][j]++;
        n++;
    }
    if (n === 0) return { n, skipped, observed: null, expected: null, kappa: null, reason: "no_items", matrix };
    let diag = 0;
    let pe = 0;
    let used = 0;
    for (let c = 0; c < k; c++) {
        diag += matrix[c][c];
        const row = matrix[c].reduce((a, b) => a + b, 0);
        const col = matrix.reduce((a, r) => a + r[c], 0);
        pe += (row / n) * (col / n);
        if (row + col > 0) used++;
    }
    const po = diag / n;
    if (used === 1) return { n, skipped, observed: round3(po), expected: round3(pe), kappa: null, reason: "single_category", matrix };
    return { n, skipped, observed: round3(po), expected: round3(pe), kappa: round3((po - pe) / (1 - pe)), reason: null, matrix };
}

function bias(swaps: Swap[]): Bias {
    const winners = ["A", "B", "tie"];
    let pairs = 0;
    let skipped = 0;
    let flips = 0;
    let first = 0;
    let second = 0;
    let longerWins = 0;
    for (const s of swaps) {
        if (!winners.includes(s.original as string) || !winners.includes(s.swapped as string) || (s.longer !== "A" && s.longer !== "B")) {
            skipped++;
            continue;
        }
        pairs++;
        if (s.original !== s.swapped) {
            flips++;
            if (s.original === "A" && s.swapped === "B") second++;
            if (s.original === "B" && s.swapped === "A") first++;
        } else if (s.original === s.longer) {
            longerWins++;
        }
    }
    const consistent = pairs - flips;
    return {
        pairs,
        skipped,
        flips,
        flipRate: pairs === 0 ? null : round3(flips / pairs),
        preferredPosition: first > second ? "first" : second > first ? "second" : null,
        positionBias: pairs > 0 && flips / pairs >= 0.2,
        consistent,
        longerWins,
        verbosityRate: consistent === 0 ? null : round3(longerWins / consistent),
        verbosityBias: consistent > 0 && longerWins / consistent > 0.5,
    };
}

function compare(categories: Label[], items: Item[], swaps: Swap[]): Report {
    const okCategories = Array.isArray(categories) && categories.length > 0
        && categories.every((c) => typeof c === "string" || typeof c === "number")
        && new Set(categories).size === categories.length;
    if (!okCategories) return { error: "bad_categories" };

    const groups = new Map<string, Item[]>();
    for (const it of items) {
        const slice = typeof it.slice === "string" && it.slice !== "" ? it.slice : "(none)";
        if (!groups.has(slice)) groups.set(slice, []);
        groups.get(slice)!.push(it);
    }
    const slices = [...groups.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((slice) => {
        const { matrix, ...rest } = agreement(categories, groups.get(slice)!);
        return { slice, ...rest };
    });
    return { overall: agreement(categories, items), slices, bias: bias(swaps) };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { categories, items, swaps }. Output: the report as JSON.
const input: { categories: Label[]; items: Item[]; swaps: Swap[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(compare(input.categories, input.items, input.swaps)));
