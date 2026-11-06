// @piece run-call: Run the proposed call and give the model its result
try {
    const content = tools.call(call);
    transcript.push({ role: "assistant", content: `call ${call.name} ${JSON.stringify(call.args)}` });
    transcript.push({ role: "tool", content });
} catch (error) {
    // The tool failed: wait a moment, then try again until we get an answer.
    clock.sleep(policy.baseBackoffMs);
}
