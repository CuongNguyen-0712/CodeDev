// Harness: runs the learner's estimateBatchCost on a logged batch of LLM calls. No network, no real model.
// input.calls   the logged calls, in order
// input.repeat  optional [{ count, call }]: appends `count` copies of `call` (ids "<id>-1", "<id>-2", ...)
//               so a month of traffic does not have to be written out in the test
// input.prices  example prices in USD per 1,000,000 tokens: { "<model>": { inputPer1M, outputPer1M } }
// Output: whatever estimateBatchCost returns, or { problem } when it changed its inputs.
async function __harness(input) {
    const calls = (input.calls || []).map((call) => ({ ...call }));
    for (const { count, call } of input.repeat || []) {
        for (let i = 1; i <= count; i++) calls.push({ ...call, id: call.id + "-" + i });
    }
    const prices = JSON.parse(JSON.stringify(input.prices));
    const before = JSON.stringify([calls, prices]);
    const result = estimateBatchCost(calls, prices);
    if (JSON.stringify([calls, prices]) !== before) return { problem: "estimateBatchCost modified the calls or the prices" };
    return result;
}
