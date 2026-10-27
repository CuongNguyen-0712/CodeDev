import { readFileSync } from "node:fs";

// Wrong: a missing measurement (null) is compared like a number, and null < 0.8 or null > 3000 is false, so it passes.

type Task = {
    name: string;
    inputTokens: number;
    outputTokens: number;
    maxCostPer1k: number;
    maxP95Ms: number;
    minQuality: number;
    personalData: boolean;
};
type Model = {
    name: string;
    inputPer1M: number;
    outputPer1M: number;
    p95Ms: number | null;
    contextTokens: number;
    quality: number | null;
    local: boolean;
    approvedProcessor: boolean;
};
type Input = { task: Task; models: Model[] };

function costPer1k(task: Task, m: Model): number {
    return (task.inputTokens * m.inputPer1M + task.outputTokens * m.outputPer1M) / 1000;
}

function violations(task: Task, m: Model): string[] {
    const out: string[] = [];
    if (task.personalData && !m.local && !m.approvedProcessor) out.push("personal data would leave the company");
    const needed = task.inputTokens + task.outputTokens;
    if (m.contextTokens < needed) out.push(`context ${m.contextTokens} < ${needed} tokens needed`);
    if ((m.quality as number) < task.minQuality) out.push(`quality ${m.quality} < ${task.minQuality}`);
    if ((m.p95Ms as number) > task.maxP95Ms) out.push(`p95 ${m.p95Ms}ms > ${task.maxP95Ms}ms`);
    const cost = costPer1k(task, m);
    if (cost > task.maxCostPer1k) out.push(`cost per 1k ${cost.toFixed(2)} > ${task.maxCostPer1k}`);
    return out;
}

function chooseModel(input: Input): string[] {
    const { task, models } = input;
    const fitting = models.filter((m) => violations(task, m).length === 0);
    if (fitting.length === 0) {
        if (models.length === 0) return ["no model fits", "(no candidates)"];
        return ["no model fits", ...models.map((m) => `${m.name}: ${violations(task, m).join(", ")}`)];
    }
    fitting.sort(
        (a, b) =>
            costPer1k(task, a) - costPer1k(task, b) ||
            (b.quality ?? 0) - (a.quality ?? 0) ||
            (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
    const best = fitting[0];
    const data = !task.personalData ? "no personal data" : best.local ? "runs locally" : "approved processor";
    return [
        `choose ${best.name}`,
        `reason: cheapest fitting model (${fitting.length} of ${models.length} fit); cost per 1k ${costPer1k(task, best).toFixed(2)}, p95 ${best.p95Ms}ms, quality ${best.quality}, data: ${data}`,
    ];
}

// ---------------------------------------------------------------- test runner (do not change)
const input: Input = JSON.parse(readFileSync(0, "utf8"));
console.log(chooseModel(input).join("\n"));
