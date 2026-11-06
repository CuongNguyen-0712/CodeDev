// @piece agent-step: Handle the call the model proposes
transcript.push({ role: "assistant", content: `${turn.toolCall.name} ${JSON.stringify(turn.toolCall.args)}` });
transcript.push({ role: "tool", content: executeTool(tools, session, turn.toolCall, desk, null) });
