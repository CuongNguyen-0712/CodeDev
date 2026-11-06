// @piece run-call: Run the proposed call and give the model its result
const key = `${call.name} ${canonical(call.args)}`;
sameInARow = key === lastKey ? sameInARow + 1 : 1;
lastKey = key;
if (sameInARow >= policy.maxSameCall) return escalate("repeated_call");

transcript.push({ role: "assistant", content: `call ${call.name} ${JSON.stringify(call.args)}` });
let content = "";
for (let retry = 0; ; retry++) {
    try {
        content = tools.call(call);
        break;
    } catch (error) {
        if (!(error instanceof ToolError)) throw error;
        if (TEMPORARY.has(error.code) && retry < policy.maxRetries) {
            clock.sleep(policy.baseBackoffMs);
            continue;
        }
        lastError = `${error.code}: ${error.message}`;
        content = `error ${lastError}`;
        break;
    }
}
transcript.push({ role: "tool", content });
