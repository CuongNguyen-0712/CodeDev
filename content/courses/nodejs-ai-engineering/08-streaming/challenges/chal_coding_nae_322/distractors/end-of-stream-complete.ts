// @piece end-of-stream: The bytes ended
// The stream ended without a done marker: whatever is left in the buffer is an event that never got its blank line.
return { status: "complete", text, error: null };
