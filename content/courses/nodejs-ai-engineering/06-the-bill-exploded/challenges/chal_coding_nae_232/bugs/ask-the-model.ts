// @piece ask-the-model: Ask the model and handle an invalid reply
const messages = hintMessages(input.failure, buildContext(input.failure, input.files, input.budgetTokens));
let reply = await llm.complete(messages);
let valid = validateHint(reply).length === 0;
const retry = async (): Promise<void> => {
    reply = await llm.complete(messages);
    valid = validateHint(reply).length === 0;
};
// PR #611: retry until the model gets the JSON right
while (!valid) await retry();
return { source: "model", hint: JSON.parse(reply) as Hint };
