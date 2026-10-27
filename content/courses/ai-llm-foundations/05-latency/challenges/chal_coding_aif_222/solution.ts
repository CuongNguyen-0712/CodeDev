import { readFileSync } from "node:fs";

// Reference solution (internal): output tokens use the output price, and the table is per 1M tokens.

type Price = { input: number; output: number };          // USD per 1M tokens
type Call = { model: string; inputTokens: number; outputTokens: number; ttftMs: number; totalMs: number };
type Input = { prices: Record<string, Price>; calls: Call[] };

// Nearest-rank percentile: sort ascending, take the value at position ceil(p / 100 * n), counted from 1.
function percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

// Prices are per 1M tokens.
const TOKENS_PER_PRICE_UNIT = 1_000_000;

function callCost(price: Price, c: Call): number {
    return (c.inputTokens * price.input + c.outputTokens * price.output) / TOKENS_PER_PRICE_UNIT;
}

function dashboard(input: Input): string[] {
    const lines: string[] = [];
    const byModel = new Map<string, Call[]>();
    for (const c of input.calls) byModel.set(c.model, [...(byModel.get(c.model) ?? []), c]);
    let totalCalls = 0;
    let totalCost = 0;
    const unknown: string[] = [];
    for (const model of [...byModel.keys()].sort()) {
        const calls = byModel.get(model)!;
        const price = Object.hasOwn(input.prices, model) ? input.prices[model] : undefined;
        if (!price) {
            unknown.push(`unknown model ${model} calls=${calls.length}`);
            continue;
        }
        const generationSeconds = calls.reduce((s, c) => s + (c.totalMs - c.ttftMs), 0) / 1000;
        const outputTokens = calls.reduce((s, c) => s + c.outputTokens, 0);
        const speed = generationSeconds > 0 ? `${Math.round(outputTokens / generationSeconds)}tok/s` : "n/a";
        const cost = calls.reduce((s, c) => s + callCost(price, c), 0);
        lines.push(
            `${model} calls=${calls.length}` +
                ` ttft_p50=${percentile(calls.map((c) => c.ttftMs), 50)}ms` +
                ` total_p50=${percentile(calls.map((c) => c.totalMs), 50)}ms` +
                ` total_p95=${percentile(calls.map((c) => c.totalMs), 95)}ms` +
                ` speed=${speed} cost=${cost.toFixed(6)}`,
        );
        totalCalls += calls.length;
        totalCost += cost;
    }
    lines.push(...unknown);
    lines.push(`total calls=${totalCalls} cost=${totalCost.toFixed(6)}`);
    return lines;
}

// ---------------------------------------------------------------- test runner (do not change)
const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(dashboard(input).join("\n"));
