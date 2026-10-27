import { readFileSync } from "node:fs";

// Wrong: the spreadsheet mistake - output tokens are not priced at all.

type Price = { inputPer1M: number; outputPer1M: number; cachedInputPer1M?: number };
type LlmRequest = { model: string; inputTokens: number; cachedInputTokens: number; outputTokens: number };
type Input = {
    prices: Record<string, Price>;
    requests: LlmRequest[];
    requestsPerDay: number;
    daysPerMonth: number;
};

const isCount = (n: unknown): boolean => typeof n === "number" && Number.isInteger(n) && n >= 0;

function requestCost(price: Price, r: LlmRequest): number {
    const cachedPrice = price.cachedInputPer1M ?? price.inputPer1M;
    const uncached = r.inputTokens - r.cachedInputTokens;
    return (uncached * price.inputPer1M + r.cachedInputTokens * cachedPrice) / 1_000_000;
}

function estimate(input: Input): string[] {
    const lines: string[] = [];
    const perModel = new Map<string, { count: number; cost: number }>();
    let count = 0;
    let errors = 0;
    let total = 0;
    input.requests.forEach((r, i) => {
        const price = Object.hasOwn(input.prices, r.model) ? input.prices[r.model] : undefined;
        if (!price) {
            errors++;
            lines.push(`#${i + 1} ${r.model} error: unknown model`);
            return;
        }
        if (!isCount(r.inputTokens) || !isCount(r.cachedInputTokens) || !isCount(r.outputTokens) || r.cachedInputTokens > r.inputTokens) {
            errors++;
            lines.push(`#${i + 1} ${r.model} error: invalid tokens`);
            return;
        }
        const cost = requestCost(price, r);
        lines.push(`#${i + 1} ${r.model} ${cost.toFixed(6)}`);
        const m = perModel.get(r.model) ?? { count: 0, cost: 0 };
        m.count++;
        m.cost += cost;
        perModel.set(r.model, m);
        count++;
        total += cost;
    });
    for (const name of [...perModel.keys()].sort()) {
        const m = perModel.get(name)!;
        lines.push(`model ${name} count=${m.count} cost=${m.cost.toFixed(6)}`);
    }
    lines.push(`total count=${count} errors=${errors} cost=${total.toFixed(6)}`);
    const monthlyRequests = input.requestsPerDay * input.daysPerMonth;
    const monthly = count === 0 ? 0 : (total / count) * monthlyRequests;
    lines.push(`monthly requests=${monthlyRequests} cost=${monthly.toFixed(2)}`);
    return lines;
}

// ---------------------------------------------------------------- test runner (do not change)
const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(estimate(input).join("\n"));
