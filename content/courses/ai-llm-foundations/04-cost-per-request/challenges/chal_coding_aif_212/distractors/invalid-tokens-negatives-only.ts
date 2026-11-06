// @piece invalid-tokens: Token counts that make no sense
if (r.inputTokens < 0 || r.cachedInputTokens < 0 || r.outputTokens < 0) {
    errors++;
    lines.push(`#${i + 1} ${r.model} error: invalid tokens`);
    return;
}
