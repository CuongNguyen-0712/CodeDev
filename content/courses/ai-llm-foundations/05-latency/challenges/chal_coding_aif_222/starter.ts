import { readFileSync } from "node:fs";

// Spot the AI Mistake: wrong price unit. The request sent to an AI coding assistant was:
//   "Write a script for our cost/latency dashboard. Input: recorded LLM calls of the hint bot
//    (model, input tokens, output tokens, time to first token in ms, total time in ms) and the
//    price table (USD per 1M tokens, separate input and output prices). For each model print
//    the number of calls, p50 time to first token, p50 and p95 total time, output tokens per
//    second and the total cost. Calls for a model missing from the price table must not crash
//    the script."
// The assistant wrote the script below. It was tried on a day of local-model calls, the
// latency columns matched the hand-computed ones, and it went into the dashboard.
//
// On the first day with hosted models, finance asked why the dashboard says the hint bot costs
// about $96,700 a day when the provider's usage page says about $298. The latency columns are
// still right. Fix the script so the cost column matches what the provider bills.
// Do not change the output format, the types or the test runner.

type Price = { input: number; output: number };          // USD per 1M tokens
type Call = { model: string; inputTokens: number; outputTokens: number; ttftMs: number; totalMs: number };
type Input = { prices: Record<string, Price>; calls: Call[] };

// Nearest-rank percentile: sort ascending, take the value at position ceil(p / 100 * n), counted from 1.
function percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

// Prices are per 1K tokens.
const TOKENS_PER_PRICE_UNIT = 1000;

function callCost(price: Price, c: Call): number {
    return (c.inputTokens * price.input + c.outputTokens * price.input) / TOKENS_PER_PRICE_UNIT;
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
