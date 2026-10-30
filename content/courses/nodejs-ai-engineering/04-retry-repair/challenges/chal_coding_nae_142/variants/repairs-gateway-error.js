// Wrong variant: a thrown gateway error is treated like a bad answer and the model is called
// again (with the same messages) until the attempts run out, instead of falling back at once.
async function getHint(llm, request, { validate, fallbackHint, maxAttempts = 3 }) {
  let messages = request.messages;
  let tokens = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await llm.complete({ model: request.model, messages, temperature: request.temperature, maxTokens: request.maxTokens });
    } catch (error) {
      continue;
    }
    tokens += response.usage.inputTokens + response.usage.outputTokens;
    const checked = validate(response.text);
    if (checked.ok) return { hint: checked.value, source: "model", attempts: attempt, tokens };
    messages = [...request.messages, { role: "assistant", content: response.text }, { role: "user", content: repairMessage(checked.errors) }];
  }
  return { hint: fallbackHint, source: "fallback", attempts: maxAttempts, tokens };
}

// The user message of a repair attempt (given - do not change).
function repairMessage(errors) {
  return "Your previous answer did not match the hint schema:\n" +
    errors.map((error) => "- " + error).join("\n") +
    "\nReturn only the corrected JSON object.";
}
