// @piece end-of-stream: The bytes ended
// The stream ended without a done marker: whatever is left in the buffer is an event that never got its blank line.
const last = dispatch();
if (last) return last;
return { status: "truncated", text, error: null };
