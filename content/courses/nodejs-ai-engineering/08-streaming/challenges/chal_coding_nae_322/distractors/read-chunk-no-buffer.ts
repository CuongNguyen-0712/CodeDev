// @piece read-chunk: Add the chunk's text to the buffer
buffer = decoder.decode(chunk, { stream: true }) + "\n";
