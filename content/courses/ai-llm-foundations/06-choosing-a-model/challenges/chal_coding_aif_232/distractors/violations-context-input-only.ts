// @piece violations: Helper: every rule of the task a model breaks
function violations(task: Task, m: Model): string[] {
    const out: string[] = [];
    if (task.personalData && !m.local && !m.approvedProcessor) out.push("personal data would leave the company");
    const needed = task.inputTokens;
    if (m.contextTokens < needed) out.push(`context ${m.contextTokens} < ${needed} tokens needed`);
    if (m.quality === null) out.push("quality not measured");
    else if (m.quality < task.minQuality) out.push(`quality ${m.quality} < ${task.minQuality}`);
    if (m.p95Ms === null) out.push("p95 not measured");
    else if (m.p95Ms > task.maxP95Ms) out.push(`p95 ${m.p95Ms}ms > ${task.maxP95Ms}ms`);
    const cost = costPer1k(task, m);
    if (cost > task.maxCostPer1k) out.push(`cost per 1k ${cost.toFixed(2)} > ${task.maxCostPer1k}`);
    return out;
}
