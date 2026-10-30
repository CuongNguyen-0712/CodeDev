/**
 * Assemble the streamed hint that the Hint Service sends as server-sent events (SSE).
 *
 * `chunks` is an ASYNC iterable of strings: the response body, already decoded to text,
 * exactly as the network delivers it. A chunk can end anywhere - in the middle of a line,
 * in the middle of the JSON, between "\r" and "\n". Read it with `for await (const chunk of chunks)`.
 *
 * The text is a sequence of lines. A line ends with "\n" or "\r\n" (the "\r" is not part of the line).
 *   - A line that starts with ":" is a comment (keep-alive): ignore it.
 *   - Any other line is "field: value" or "field:value"; the value is everything after the first ":",
 *     minus ONE leading space if there is one. A line without ":" is a field with an empty value.
 *   - Only two fields matter: "data" and "event". Ignore every other field ("id", "retry", ...).
 *   - An EMPTY line ends the current event. When it ends:
 *       - an event with no data line is ignored (and forgotten);
 *       - otherwise its payload is the values of its data lines joined with "\n";
 *       - event name "error"     -> stop: { complete: false, reason: "error", text, frames }
 *       - payload exactly "[DONE]" -> stop: { complete: true, text, frames }
 *       - otherwise the payload must be JSON of an object whose "delta" is a string:
 *         append delta to text and add 1 to frames. Anything else (invalid JSON, no delta,
 *         a delta that is not a string) -> stop: { complete: false, reason: "bad_frame", text, frames }
 *       - any other event name is handled like a normal frame; the next event starts with no name.
 * Nothing after the stop matters. If the chunks run out before [DONE] (or before the empty line
 * that ends the [DONE] event), the stream was cut: { complete: false, reason: "cut", text, frames }.
 * An event that was still being read when the stream ended is incomplete: it is never applied.
 *
 * `text` is all applied deltas concatenated in order; `frames` is how many deltas were applied.
 *
 * @param {AsyncIterable<string>} chunks
 * @returns {Promise<{ complete: boolean, reason?: "cut" | "error" | "bad_frame", text: string, frames: number }>}
 */
async function assembleStream(chunks) {
  // TODO: keep a buffer across chunks, cut it into lines, collect the fields of the current event
  // and act on the event when its empty line arrives.
  let text = "";
  let frames = 0;
  for await (const chunk of chunks) {
    // This only works when every chunk is exactly one complete frame.
    if (chunk.startsWith("data: ") && !chunk.includes("[DONE]")) {
      text += JSON.parse(chunk.slice(6)).delta;
      frames++;
    }
  }
  return { complete: true, text, frames };
}
