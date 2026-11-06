// @piece call-with-retry: Call the model, retrying only transient errors
let reply: Reply;
try {
    reply = await llm.complete(messages);
    calls++;
} catch (error) {
    if (!(error instanceof LlmError)) return fallback("error");
    if (!TRANSIENT.includes(error.status) || retries >= opts.maxRetries) return fallback(`error ${error.status}`);
    retries++;
    await clock.sleep(opts.baseDelayMs * 2 ** (retries - 1));
    continue;
}
