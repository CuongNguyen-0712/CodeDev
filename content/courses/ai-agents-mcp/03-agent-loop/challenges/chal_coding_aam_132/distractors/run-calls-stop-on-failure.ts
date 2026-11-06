// @piece run-calls: Give each proposed call an id, then run them all
const proposed = "toolCalls" in turn ? turn.toolCalls : [turn.toolCall];
const calls = proposed.map((c) => ({ id: `call_${nextId++}`, name: c.name, args: c.args }));
transcript.push({ role: "assistant", toolCalls: calls });
for (const call of calls) {
    stats.toolCalls++;
    const result = handle(call, tools, stats);
    transcript.push(result);
    if (result.role === "tool" && !result.ok) break;
}
