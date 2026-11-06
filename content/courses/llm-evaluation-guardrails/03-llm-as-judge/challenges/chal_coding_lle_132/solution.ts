import { readFileSync } from "node:fs";

// CodeDev AI grading assistant: before an LLM judge may replace a mentor's spot-check, we measure how
// well its labels agree with the mentors' labels (Cohen's kappa), per slice, and we screen the judge
// for position and verbosity bias with a recorded A/B swap experiment. No model is called here.
//
// categories: the allowed labels, e.g. ["pass", "fail"] or [1, 2, 3, 4, 5]. They must form a non-empty
// array of unique strings or numbers; otherwise the whole report is { "error": "bad_categories" }.
// Labels are compared with ===, so the string "4" is not the category 4.
//
// Agreement over a group of items:
//   - An item counts only when both human and judge are one of the categories. Any other item
//     (a label missing, null or not a category) is skipped: counted in "skipped", not a disagreement.
//   - n = counted items. matrix[h][j] = number of items the human labelled categories[h] and the judge
//     labelled categories[j] (rows = human, columns = judge, both in categories order).
//   - observed = (sum of the diagonal) / n
//   - expected = sum over categories c of (row total of c / n) * (column total of c / n)
//   - kappa = (observed - expected) / (1 - expected), computed from the unrounded values.
//   - n = 0: observed, expected and kappa are null and reason is "no_items".
//   - Every counted label, human and judge, is the same single category: kappa is undefined, so kappa is
//     null and reason is "single_category" (observed and expected are still reported). Otherwise reason null.
// overall: the agreement over all items, with its matrix.
// slices: the agreement (without matrix) of each slice, { slice, n, skipped, observed, expected, kappa,
//   reason }, sorted by slice name (plain < comparison); a missing or empty slice is "(none)".
//
// Swap experiment: for each pair, the judge saw answer A first and B second ("original"), then B first
// and A second ("swapped"). original and swapped name the winning answer, "A", "B" or "tie". The two
// answers make the same points, and "longer" ("A" or "B") is the one padded with extra words.
//   - A record with another value in original, swapped or longer is skipped (counted in bias.skipped).
//   - pairs = valid records. A flip is a pair with original !== swapped; flipRate = flips / pairs.
//   - In a flip, original "A" and swapped "B" means the first position won both times; original "B"
//     and swapped "A" means the second position won both times. preferredPosition is "first" or
//     "second", whichever happened more often, or null when they are equal.
//   - positionBias: flips / pairs > 0.2.
//   - consistent = pairs - flips. longerWins = consistent pairs whose winner is the longer answer.
//     verbosityRate = longerWins / consistent. verbosityBias: longerWins / consistent > 0.5.
//   - flipRate and verbosityRate are null when their denominator is 0, and then the flag is false.
// Round observed, expected, kappa, flipRate and verbosityRate with Math.round(x * 1000) / 1000.
// Fill every [ ] line of compare and its helpers with a piece (some pieces are wrong). Do not change the
// types or the test runner.

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
    // @piece count-pairs: Fill the confusion matrix, skipping unusable items
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
    // @end
    if (n === 0) return { n, skipped, observed: null, expected: null, kappa: null, reason: "no_items", matrix };
    // @piece kappa: Observed and chance agreement, then kappa
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
    // @end
}

function bias(swaps: Swap[]): Bias {
    const winners = ["A", "B", "tie"];
    let pairs = 0;
    let skipped = 0;
    let flips = 0;
    let first = 0;
    let second = 0;
    let longerWins = 0;
    // @piece count-flips: Count flips, positions and longer-answer wins
    for (const s of swaps) {
        if (!winners.includes(s.original as string) || !winners.includes(s.swapped as string) || (s.longer !== "A" && s.longer !== "B")) {
            skipped++;
            continue;
        }
        pairs++;
        if (s.original !== s.swapped) {
            flips++;
            if (s.original === "A" && s.swapped === "B") first++;
            if (s.original === "B" && s.swapped === "A") second++;
        } else if (s.original === s.longer) {
            longerWins++;
        }
    }
    // @end
    // @piece bias-report: Report the rates and the two bias flags
    const consistent = pairs - flips;
    return {
        pairs,
        skipped,
        flips,
        flipRate: pairs === 0 ? null : round3(flips / pairs),
        preferredPosition: first > second ? "first" : second > first ? "second" : null,
        positionBias: pairs > 0 && flips / pairs > 0.2,
        consistent,
        longerWins,
        verbosityRate: consistent === 0 ? null : round3(longerWins / consistent),
        verbosityBias: consistent > 0 && longerWins / consistent > 0.5,
    };
    // @end
}

function compare(categories: Label[], items: Item[], swaps: Swap[]): Report {
    // @piece check-categories: Reject a bad category list
    const okCategories = Array.isArray(categories) && categories.length > 0
        && categories.every((c) => typeof c === "string" || typeof c === "number")
        && new Set(categories).size === categories.length;
    if (!okCategories) return { error: "bad_categories" };
    // @end

    // @piece slice-groups: Group items by slice and score each slice
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
    // @end
    return { overall: agreement(categories, items), slices, bias: bias(swaps) };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { categories, items, swaps }. Output: the report as JSON.
const input: { categories: Label[]; items: Item[]; swaps: Swap[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(compare(input.categories, input.items, input.swaps)));
