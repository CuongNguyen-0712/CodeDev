// @piece request-cost: The cost of one request in USD
const cachedPrice = price.inputPer1M;
const uncached = r.inputTokens - r.cachedInputTokens;
return (uncached * price.inputPer1M + r.cachedInputTokens * cachedPrice + r.outputTokens * price.outputPer1M) / 1_000_000;
