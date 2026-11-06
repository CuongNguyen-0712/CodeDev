"""
Pack retrieved chunks into the prompt's context under a token budget, with citations.

`chunks` arrive in rank order: [{"id", "source", "text"}, ...]. Each chunk that is used becomes
one line "[n] <text>", where n is the citation number of its SOURCE document.

Requirements:
  - Go through the chunks in order. The cost of a chunk is count_tokens() of its whole line,
    "[n] " included. The total cost must stay <= budget.
  - A chunk that does not fit is skipped, but keep going: a later, shorter chunk may still fit.
  - Use at most `max_per_source` chunks from the same source.
  - Skip a chunk whose text (ignoring leading/trailing whitespace) is already in the context.
  - Citation numbers start at 1 and are given to sources in the order they are first USED.
    A skipped chunk never takes a number; every chunk of a source shows the same number.
  - Return {"context": lines joined with "\\n", "citations": sources in number order,
            "used": ids of the chunks used, "tokens": total cost}.
"""
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
        # [ ] Skip repeated text and sources that already have enough
        # [ ] The citation number of this chunk
        line = f"[{number}] {text}"
        cost = count_tokens(line)
        # [ ] A chunk that does not fit
        # [ ] Record a packed chunk

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
