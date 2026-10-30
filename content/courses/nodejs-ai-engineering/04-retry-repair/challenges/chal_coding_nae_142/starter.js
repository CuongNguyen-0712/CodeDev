/**
 * Ask the model for a hint, repair invalid answers a limited number of times, then fall back.
 *
 * Every call is llm.complete({ model, messages, temperature, maxTokens }) with model, temperature
 * and maxTokens taken from `request`. It resolves with { text, usage: { inputTokens, outputTokens } }
 * or throws (provider down, timeout, rate limit - a gateway error).
 *
 * Rules:
 *   - attempt 1 sends request.messages unchanged;
 *   - validate(text) returns { ok: true, value } or { ok: false, errors: [string, ...] };
 *     on ok, return { hint: value, source: "model", attempts, tokens };
 *   - on an invalid answer, the next attempt sends
 *       [...request.messages,
 *        { role: "assistant", content: <the invalid text> },
 *        { role: "user", content: repairMessage(<its errors>) }]
 *     - only the LAST invalid answer and its errors, the conversation does not grow;
 *   - make at most maxAttempts calls in total (default 3); after maxAttempts invalid answers
 *     return { hint: fallbackHint, source: "fallback", attempts, tokens };
 *   - a thrown gateway error is not repaired: return the fallback at once (no more calls);
 *   - attempts = number of llm.complete calls made (a call that threw counts);
 *   - tokens = inputTokens + outputTokens summed over EVERY call that returned (invalid ones too).
 *
 * Do not mutate request.messages. Do not change repairMessage: the tests compare its exact text.
 *
 * @param {{ complete: (req: object) => Promise<{ text: string, usage: { inputTokens: number, outputTokens: number } }> }} llm
 * @param {{ model: string, temperature: number, maxTokens: number, messages: { role: string, content: string }[] }} request
 * @param {{ validate: (text: string) => { ok: boolean, value?: object, errors?: string[] },
 *           fallbackHint: object, maxAttempts?: number }} options
 * @returns {Promise<{ hint: object, source: "model" | "fallback", attempts: number, tokens: number }>}
 */
async function getHint(llm, request, { validate, fallbackHint, maxAttempts = 3 }) {
  // TODO: loop up to maxAttempts times, repair invalid answers with repairMessage(errors),
  // fall back on a gateway error or when no attempt is left, and count the tokens of every call.
  const response = await llm.complete({
    model: request.model,
    messages: request.messages,
    temperature: request.temperature,
    maxTokens: request.maxTokens,
  });
  const checked = validate(response.text);
  const tokens = response.usage.inputTokens + response.usage.outputTokens;
  if (checked.ok) return { hint: checked.value, source: "model", attempts: 1, tokens };
  return { hint: fallbackHint, source: "fallback", attempts: 1, tokens };
}

// The user message of a repair attempt (given - do not change).
function repairMessage(errors) {
  return "Your previous answer did not match the hint schema:\n" +
    errors.map((error) => "- " + error).join("\n") +
    "\nReturn only the corrected JSON object.";
}
