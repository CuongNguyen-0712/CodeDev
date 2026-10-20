"""
Drop near-duplicate documents before they are indexed.

The knowledge base is imported from three tools (help center, PDF exports, Confluence), so the
same article often arrives several times with small differences: capitalisation, punctuation,
a "Last updated" footer. dedupe() should keep the first copy and drop the others - but in
production it lets copies through, drops short FAQ entries that only quote a longer article,
and crashes on empty documents.

Intended behaviour:
  - tokens(): lower-case words and numbers; punctuation and whitespace only separate them.
  - shingles(): every run of k consecutive tokens. A text shorter than k is a single shingle
    (all of its tokens); an empty text has no shingles.
  - jaccard(): size of the intersection divided by the size of the union. Two empty sets are
    identical (1.0).
  - dedupe(): keep documents in input order; drop a document when its Jaccard similarity to a
    document already KEPT is >= threshold. Return the ids that were kept.
"""
import json
import sys

type Shingle = tuple[str, ...]


def tokens(text: str) -> list[str]:
    return text.split()


def shingles(text: str, k: int) -> set[Shingle]:
    words = tokens(text)
    return {tuple(words[i:i + k]) for i in range(len(words) - k)}


def jaccard(a: set[Shingle], b: set[Shingle]) -> float:
    return len(a & b) / len(a)


def dedupe(docs: list[dict], k: int, threshold: float) -> list[str]:
    kept: list[tuple[str, set[Shingle]]] = []
    for doc in docs:
        signature = shingles(doc["text"], k)
        if any(jaccard(signature, other) >= threshold for _, other in kept):
            continue
        kept.append((doc["id"], signature))
    return [doc_id for doc_id, _ in kept]


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(dedupe(**case)))
