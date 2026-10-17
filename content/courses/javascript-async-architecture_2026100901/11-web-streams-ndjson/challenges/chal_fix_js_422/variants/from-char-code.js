// Wrong variant: treats every byte as one character (Latin-1), which breaks all multi-byte UTF-8.
async function readAllText(body) {
  const reader = body.getReader();
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += String.fromCharCode(...value);
    }
  } finally {
    reader.releaseLock();
  }
  return text;
}
