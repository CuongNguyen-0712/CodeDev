// Wrong variant: streams correctly but never flushes the decoder -> a truncated last character vanishes.
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
  } finally {
    reader.releaseLock();
  }
  return text;
}
