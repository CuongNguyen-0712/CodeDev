"""Pack retrieved chunks into the prompt's context under a token budget, with citations."""
import json
import re
import sys


def count_tokens(text: str) -> int:
    """Approximate tokens: every word and every punctuation mark counts as one (do not change)."""
    return len(re.findall(r"\w+|[^\w\s]", text))


def pack_context(chunks: list[dict], budget: int, max_per_source: int) -> dict:
    numbers: dict[str, int] = {}      # source -> citation number, in order of first use
    per_source: dict[str, int] = {}
    seen_text: set[str] = set()
    lines: list[str] = []
    used: list[str] = []
    tokens = 0

    for chunk in chunks:  # already in rank order
        text, source = chunk["text"].strip(), chunk["source"]
        if text in seen_text or per_source.get(source, 0) >= max_per_source:
            continue
        number = numbers.get(source, len(numbers) + 1)
        line = f"[{number}] {text}"
        cost = count_tokens(line)
        if tokens + cost > budget:
            continue  # too big - a later, shorter chunk may still fit
        numbers.setdefault(source, number)
        per_source[source] = per_source.get(source, 0) + 1
        seen_text.add(text)
        lines.append(line)
        used.append(chunk["id"])
        tokens += cost

    return {
        "context": "\n".join(lines),
        "citations": sorted(numbers, key=numbers.get),
        "used": used,
        "tokens": tokens,
    }


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(pack_context(**case)))
