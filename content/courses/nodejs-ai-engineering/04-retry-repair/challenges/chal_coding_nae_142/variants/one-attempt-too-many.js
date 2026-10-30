// Wrong variant: the loop starts at 0 and runs while attempt <= maxAttempts, so the model is
// called maxAttempts + 1 times before the fallback (one paid call more than the limit allows).
async function getHint(llm, request, { validate, fallbackHint, maxAttempts = 3 }) {
  let messages = request.messages;
  let tokens = 0;
  let attempt = 0;
  for (; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await llm.complete({ model: request.model, messages, temperature: request.temperature, maxTokens: request.maxTokens });
    } catch (error) {
      return { hint: fallbackHint, source: "fallback", attempts: attempt + 1, tokens };
    }
    tokens += response.usage.inputTokens + response.usage.outputTokens;
    const checked = validate(response.text);
    if (checked.ok) return { hint: checked.value, source: "model", attempts: attempt + 1, tokens };
    messages = [...request.messages, { role: "assistant", content: response.text }, { role: "user", content: repairMessage(checked.errors) }];
  }
  return { hint: fallbackHint, source: "fallback", attempts: attempt, tokens };
}

// The user message of a repair attempt (given - do not change).
function repairMessage(errors) {
  return "Your previous answer did not match the hint schema:\n" +
    errors.map((error) => "- " + error).join("\n") +
    "\nReturn only the corrected JSON object.";
}
