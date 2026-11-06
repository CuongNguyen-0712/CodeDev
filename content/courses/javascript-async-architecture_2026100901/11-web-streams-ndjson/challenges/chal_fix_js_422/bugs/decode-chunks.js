// @piece decode-chunks: Decode every chunk into text
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  text += decoder.decode(value);
}
