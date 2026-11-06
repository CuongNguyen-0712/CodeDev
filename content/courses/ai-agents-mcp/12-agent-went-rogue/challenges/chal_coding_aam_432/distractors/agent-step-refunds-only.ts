// @piece agent-step: Handle the call the model proposes
const call = turn.toolCall;
transcript.push({ role: "assistant", content: `${call.name} ${JSON.stringify(call.args)}` });
let token: string | null = null;
if (call.name === "refund_order") {
    const answer = desk.request(session.id, call);
    if ("declined" in answer) {
        transcript.push({ role: "tool", content: answer.declined });
        continue;
    }
    token = answer.token;
}
transcript.push({ role: "tool", content: executeTool(tools, session, call, desk, token) });
