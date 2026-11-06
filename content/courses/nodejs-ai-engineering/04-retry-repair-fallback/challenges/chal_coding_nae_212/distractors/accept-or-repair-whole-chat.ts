// @piece accept-or-repair: Accept a valid reply or ask for a repair
const errors = validateHint(reply.text);
if (errors.length === 0) {
    return { source: repairs === 0 ? "model" : "repair", hint: JSON.parse(reply.text) as Hint, reason: null, calls, inputTokens, outputTokens };
}
if (repairs >= opts.maxRepairs) return fallback("invalid output");
repairs++;
messages = [...messages, { role: "user", content: reply.text }, ...repairMessages(reply.text, errors)];
