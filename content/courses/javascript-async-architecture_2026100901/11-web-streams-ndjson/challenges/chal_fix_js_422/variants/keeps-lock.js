// Wrong variant: decodes correctly but never releases the reader lock.
async function readAllText(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
