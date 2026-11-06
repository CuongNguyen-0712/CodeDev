// @piece ask-the-model: Ask the model and handle an invalid reply
let messages = hintMessages(input.failure, buildContext(input.failure, input.files, input.budgetTokens));
for (let repairs = 0; ; repairs++) {
    const reply = await llm.complete(messages);
    const errors = validateHint(reply);
    if (errors.length === 0) return { source: repairs === 0 ? "model" : "repair", hint: JSON.parse(reply) as Hint };
    if (repairs === MAX_REPAIRS) return { source: "fallback", hint: FALLBACK_HINT };
    // retry the same messages, at most MAX_REPAIRS more times
}
