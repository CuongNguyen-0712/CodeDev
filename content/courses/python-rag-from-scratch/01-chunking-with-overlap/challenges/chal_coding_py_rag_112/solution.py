"""Split a document into overlapping word windows for embedding."""
import json
import sys


def chunk_words(text: str, size: int, overlap: int) -> list[str]:
    if size < 1 or overlap < 0 or overlap >= size:
        raise ValueError(f"need size >= 1 and 0 <= overlap < size, got size={size}, overlap={overlap}")
    words = text.split()
    step = size - overlap
    chunks = []
    start = 0
    while start < len(words):
        chunks.append(" ".join(words[start:start + size]))
        if start + size >= len(words):
            break  # this window already reaches the last word
        start += step
    return chunks


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    try:
        print(json.dumps(chunk_words(**case)))
    except ValueError:
        print(json.dumps({"error": "ValueError"}))
