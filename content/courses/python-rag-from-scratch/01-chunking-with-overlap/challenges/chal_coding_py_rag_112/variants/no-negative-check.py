# Known wrong: accepts a negative overlap, which silently skips words between chunks.
import json
import sys


def chunk_words(text: str, size: int, overlap: int) -> list[str]:
    if size < 1 or overlap >= size:
        raise ValueError("bad window")
    words = text.split()
    chunks, start = [], 0
    while start < len(words):
        chunks.append(" ".join(words[start:start + size]))
        if start + size >= len(words):
            break
        start += size - overlap
    return chunks


if __name__ == "__main__":
    case = json.load(sys.stdin)
    try:
        print(json.dumps(chunk_words(**case)))
    except ValueError:
        print(json.dumps({"error": "ValueError"}))
