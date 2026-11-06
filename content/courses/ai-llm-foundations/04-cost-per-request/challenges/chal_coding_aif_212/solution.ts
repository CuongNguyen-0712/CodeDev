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
    // @piece request-cost: The cost of one request in USD
    const cachedPrice = price.cachedInputPer1M ?? price.inputPer1M;
    const uncached = r.inputTokens - r.cachedInputTokens;
    return (uncached * price.inputPer1M + r.cachedInputTokens * cachedPrice + r.outputTokens * price.outputPer1M) / 1_000_000;
    // @end
}

function estimate(input: Input): string[] {
    const lines: string[] = [];
    const perModel = new Map<string, { count: number; cost: number }>();
    let count = 0;
    let errors = 0;
    let total = 0;
    input.requests.forEach((r, i) => {
        // @piece unknown-model: A model missing from the price table
        const price = Object.hasOwn(input.prices, r.model) ? input.prices[r.model] : undefined;
        if (!price) {
            errors++;
            lines.push(`#${i + 1} ${r.model} error: unknown model`);
            return;
        }
        // @end
        // @piece invalid-tokens: Token counts that make no sense
        if (!isCount(r.inputTokens) || !isCount(r.cachedInputTokens) || !isCount(r.outputTokens) || r.cachedInputTokens > r.inputTokens) {
            errors++;
            lines.push(`#${i + 1} ${r.model} error: invalid tokens`);
            return;
        }
        // @end
        // @piece price-request: Price the request and add it up
        const cost = requestCost(price, r);
        lines.push(`#${i + 1} ${r.model} ${cost.toFixed(6)}`);
        const m = perModel.get(r.model) ?? { count: 0, cost: 0 };
        m.count++;
        m.cost += cost;
        perModel.set(r.model, m);
        count++;
        total += cost;
        // @end
    });
    // @piece per-model: One line per model
    for (const name of [...perModel.keys()].sort()) {
        const m = perModel.get(name)!;
        lines.push(`model ${name} count=${m.count} cost=${m.cost.toFixed(6)}`);
    }
    // @end
    // @piece totals: The total and the monthly projection
    lines.push(`total count=${count} errors=${errors} cost=${total.toFixed(6)}`);
    const monthlyRequests = input.requestsPerDay * input.daysPerMonth;
    const monthly = count === 0 ? 0 : (total / count) * monthlyRequests;
    lines.push(`monthly requests=${monthlyRequests} cost=${monthly.toFixed(2)}`);
    // @end
    return lines;
}

// @piece is-count: Helper: is a value a whole number >= 0
const isCount = (n: unknown): boolean => typeof n === "number" && Number.isInteger(n) && n >= 0;
// @end

// ---------------------------------------------------------------- test runner (do not change)
const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(estimate(input).join("\n"));
