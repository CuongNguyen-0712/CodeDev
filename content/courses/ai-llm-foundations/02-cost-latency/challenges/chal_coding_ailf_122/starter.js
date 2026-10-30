/**
 * Estimate what a batch of logged LLM calls cost.
 *
 * calls:  [{ id, model, inputTokens, outputTokens }, ...]   from the AI Hint call log
 * prices: { "<model>": { inputPer1M, outputPer1M }, ... }   example prices in USD per 1,000,000 tokens
 *
 * Cost of one call (prices are per 1M tokens, input and output priced separately):
 *   inputTokens  / 1_000_000 * inputPer1M
 * + outputTokens / 1_000_000 * outputPer1M
 *
 * For each call, in order:
 *   - model not in prices      -> errors.push({ id, error: "unknown model: <model>" })   (check this first)
 *   - inputTokens or outputTokens is not a whole number >= 0 (negative, fractional, missing, a string)
 *                              -> errors.push({ id, error: "invalid token counts" })
 *   - otherwise add the call to its model in byModel and to the total.
 * Calls with an error are not counted anywhere else.
 *
 * Return:
 * {
 *   totalCost: <sum of the cost of every valid call>,
 *   byModel: { "<model>": { calls, inputTokens, outputTokens, cost }, ... },  // only models with >= 1 valid call
 *   errors: [{ id, error }, ...]
 * }
 * Round totalCost and every byModel cost ONCE, at the end, to 6 decimal places:
 *   Math.round(value * 1e6) / 1e6
 * Do not round each call: thousands of tiny calls must still add up. Do not modify calls or prices.
 *
 * @param {{ id: string, model: string, inputTokens: number, outputTokens: number }[]} calls
 * @param {Record<string, { inputPer1M: number, outputPer1M: number }>} prices
 */
function estimateBatchCost(calls, prices) {
  // TODO: price every call per 1M tokens, group by model, collect errors, round at the end.
  return { totalCost: 0, byModel: {}, errors: [] };
}
