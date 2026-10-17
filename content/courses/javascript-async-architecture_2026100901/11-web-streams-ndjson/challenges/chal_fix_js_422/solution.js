/**
 * Reference solution (never shipped to learners).
 * { stream: true } keeps an incomplete multi-byte sequence at the end of a chunk
 * for the next call; the final decode() flushes whatever is left (a truncated
 * sequence becomes U+FFFD instead of silently disappearing).
 */
async function readAllText(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return text;
}
