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
// Write compare (add helpers as you like). Do not change the types or the test runner.

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

function compare(categories: Label[], items: Item[], swaps: Swap[]): Report {
    return { error: "bad_categories" };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { categories, items, swaps }. Output: the report as JSON.
const input: { categories: Label[]; items: Item[]; swaps: Swap[] } = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(compare(input.categories, input.items, input.swaps)));
