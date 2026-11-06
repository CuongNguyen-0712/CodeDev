// @piece run-tool: Run the tool; a throw becomes a failed result
stats.executed++;
return { role: "tool", callId, name, ok: true, result: tool.run(call.args) };
