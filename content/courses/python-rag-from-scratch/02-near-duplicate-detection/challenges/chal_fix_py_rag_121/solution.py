"""Drop near-duplicate documents before they are indexed."""
import json
import re
import sys

type Shingle = tuple[str, ...]


def tokens(text: str) -> list[str]:
    """Lower-case words and numbers; punctuation and whitespace only separate them."""
    return re.findall(r"[a-z0-9]+", text.lower())


def shingles(text: str, k: int) -> set[Shingle]:
    """Every run of k consecutive tokens. A text shorter than k is one shingle (none if empty)."""
    words = tokens(text)
    if len(words) < k:
        return {tuple(words)} if words else set()
    return {tuple(words[i:i + k]) for i in range(len(words) - k + 1)}


def jaccard(a: set[Shingle], b: set[Shingle]) -> float:
    """|a & b| / |a | b|; two empty sets are identical."""
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b)


def dedupe(docs: list[dict], k: int, threshold: float) -> list[str]:
    """Ids of the documents to index, in input order: a document is dropped when its
    similarity to a document already kept is >= threshold."""
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
