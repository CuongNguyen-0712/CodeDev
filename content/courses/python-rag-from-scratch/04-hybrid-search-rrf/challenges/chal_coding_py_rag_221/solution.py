"""Fuse the rankings of several retrievers with weighted Reciprocal Rank Fusion."""
import json
import sys


def rrf(rankings: list[list[str]], top: int, k: int = 60, weights: list[float] | None = None) -> list[list]:
    if weights is None:
        weights = [1.0] * len(rankings)
    if len(weights) != len(rankings):
        raise ValueError("one weight per ranking")

    scores: dict[str, float] = {}
    for ranking, weight in zip(rankings, weights):
        seen = set()
        for rank, doc_id in enumerate(ranking, start=1):
            if doc_id in seen:
                continue  # a repeated id counts once, at its best rank
            seen.add(doc_id)
            scores[doc_id] = scores.get(doc_id, 0.0) + weight / (k + rank)

    ordered = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    return [[doc_id, round(score, 6)] for doc_id, score in ordered[:top]]


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    try:
        print(json.dumps(rrf(**case)))
    except ValueError:
        print(json.dumps({"error": "ValueError"}))
