# Known wrong: counts characters instead of words, so chunks cut words (and numbers) in half.
import json
import sys


def chunk_words(text: str, size: int, overlap: int) -> list[str]:
    if size < 1 or overlap < 0 or overlap >= size:
        raise ValueError("bad window")
    text = " ".join(text.split())
    chunks, start = [], 0
    while start < len(text):
        chunks.append(text[start:start + size].strip())
        if start + size >= len(text):
            break
        start += size - overlap
    return chunks


if __name__ == "__main__":
    case = json.load(sys.stdin)
    try:
        print(json.dumps(chunk_words(**case)))
    except ValueError:
        print(json.dumps({"error": "ValueError"}))
