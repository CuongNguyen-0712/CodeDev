"""
Split a document into overlapping word windows for embedding.

Requirements:
  - Words are separated by any whitespace (spaces, tabs, new lines); join a chunk's words
    with a single space.
  - Every chunk has at most `size` words. Consecutive chunks share exactly `overlap` words,
    so each chunk starts `size - overlap` words after the previous one.
  - The last chunk ends at the last word. Stop as soon as a chunk reaches the end: never add
    a trailing chunk whose words are all in the previous one.
  - Raise ValueError unless size >= 1 and 0 <= overlap < size.
  - An empty (or whitespace-only) text gives [].

Example: chunk_words("a b c d e f g h i j", size=4, overlap=1)
         -> ["a b c d", "d e f g", "g h i j"]
"""
import json
import sys


def chunk_words(text: str, size: int, overlap: int) -> list[str]:
    # @piece validate: Refuse sizes that cannot make windows
    if size < 1 or overlap < 0 or overlap >= size:
        raise ValueError(f"need size >= 1 and 0 <= overlap < size, got size={size}, overlap={overlap}")
    # @end
    words = text.split()
    # @piece windows: Start a window every size - overlap words
    step = size - overlap
    chunks = []
    start = 0
    while start < len(words):
        chunks.append(" ".join(words[start:start + size]))
        if start + size >= len(words):
            break  # this window already reaches the last word
        start += step
    return chunks
    # @end


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    try:
        print(json.dumps(chunk_words(**case)))
    except ValueError:
        print(json.dumps({"error": "ValueError"}))
