// Wrong variant: rounds every call to 6 decimals before adding it up, so thousands of tiny calls
// (each below a millionth of a dollar) are counted wrongly.
function estimateBatchCost(calls, prices) {
  const round6 = (value) => Math.round(value * 1e6) / 1e6;
  const isCount = (n) => Number.isInteger(n) && n >= 0;
  const byModel = {};
  const costs = {};
  const errors = [];
  let total = 0;

  for (const call of calls) {
    const price = Object.prototype.hasOwnProperty.call(prices, call.model) ? prices[call.model] : null;
    if (!price) {
      errors.push({ id: call.id, error: "unknown model: " + call.model });
      continue;
    }
    if (!isCount(call.inputTokens) || !isCount(call.outputTokens)) {
      errors.push({ id: call.id, error: "invalid token counts" });
      continue;
    }
    const cost = (call.inputTokens / 1_000_000) * price.inputPer1M + (call.outputTokens / 1_000_000) * price.outputPer1M;
    const entry = byModel[call.model] || (byModel[call.model] = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 });
    entry.calls++;
    entry.inputTokens += call.inputTokens;
    entry.outputTokens += call.outputTokens;
    costs[call.model] = (costs[call.model] || 0) + round6(cost);
    total += round6(cost);
  }

  for (const model of Object.keys(byModel)) byModel[model].cost = round6(costs[model]);
  return { totalCost: round6(total), byModel, errors };
}
