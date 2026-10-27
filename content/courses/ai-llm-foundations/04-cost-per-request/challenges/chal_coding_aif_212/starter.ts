import { readFileSync } from "node:fs";

// CodeDev hint bot: cost estimate from recorded requests.
// The test runner reads one JSON object from stdin:
//   prices          { "<model>": { inputPer1M, outputPer1M, cachedInputPer1M? } }   USD per 1M tokens
//   requests        [{ model, inputTokens, cachedInputTokens, outputTokens }]      recorded usage
//   requestsPerDay, daysPerMonth                                                   for the projection
// cachedInputTokens are part of inputTokens (the provider reports them inside the input count).
//
// requestCost(price, r), in USD, not rounded:
//   (uncached input tokens x inputPer1M
//    + cachedInputTokens x cachedInputPer1M (inputPer1M when the model has no cached price)
//    + outputTokens x outputPer1M) / 1,000,000
//
// estimate(input) returns the report lines, in this order:
//   "#<n> <model> <cost>"                 one line per request, n from 1; cost with toFixed(6)
//   "#<n> <model> error: unknown model"   the model is not in the price table
//   "#<n> <model> error: invalid tokens"  a token count is not a whole number >= 0,
//                                         or cachedInputTokens > inputTokens
//   "model <name> count=<n> cost=<sum>"   one line per model with priced requests, sorted by name
//   "total count=<priced> errors=<errors> cost=<sum>"
//   "monthly requests=<requestsPerDay x daysPerMonth> cost=<average priced request x that number>"
// Sums are of the unrounded costs, printed with toFixed(6); the monthly cost uses toFixed(2)
// and is 0.00 when no request was priced. Error lines never stop the report.

type Price = { inputPer1M: number; outputPer1M: number; cachedInputPer1M?: number };
type LlmRequest = { model: string; inputTokens: number; cachedInputTokens: number; outputTokens: number };
type Input = {
    prices: Record<string, Price>;
    requests: LlmRequest[];
    requestsPerDay: number;
    daysPerMonth: number;
};

function requestCost(price: Price, r: LlmRequest): number {
    return 0;
}

function estimate(input: Input): string[] {
    return [];
}

// ---------------------------------------------------------------- test runner (do not change)
const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(estimate(input).join("\n"));
