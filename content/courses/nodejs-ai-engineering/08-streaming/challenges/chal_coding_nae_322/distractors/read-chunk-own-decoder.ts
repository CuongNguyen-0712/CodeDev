// @piece read-chunk: Add the chunk's text to the buffer
buffer += new TextDecoder("utf-8").decode(chunk);
