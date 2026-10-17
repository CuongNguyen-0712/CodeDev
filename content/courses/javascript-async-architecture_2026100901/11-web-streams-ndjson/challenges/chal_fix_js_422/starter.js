/**
 * Reads a byte stream (for example `(await fetch(url)).body`) to the end and
 * returns its content as text.
 *
 * BUG report from the analytics team: in large exports some customer names come out
 * as "Nguy��n" or "Caf��" instead of "Nguyễn" and "Café". Small exports are
 * always fine, and the same file opened in an editor is correct. The reader loop
 * itself works - look at how the bytes of each chunk are turned into text.
 *
 * @param {ReadableStream<Uint8Array>} body
 * @returns {Promise<string>}
 */
async function readAllText(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
  } finally {
    reader.releaseLock();
  }

  return text;
}
