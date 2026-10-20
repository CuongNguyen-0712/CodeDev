# Known wrong: steps through every start position, so a trailing chunk repeats the end of the previous one.
import json
import sys


def chunk_words(text: str, size: int, overlap: int) -> list[str]:
    if size < 1 or overlap < 0 or overlap >= size:
        raise ValueError("bad window")
    words = text.split()
    return [" ".join(words[i:i + size]) for i in range(0, len(words), size - overlap)]


if __name__ == "__main__":
    case = json.load(sys.stdin)
    try:
        print(json.dumps(chunk_words(**case)))
    except ValueError:
        print(json.dumps({"error": "ValueError"}))
