"""
Fuse the rankings of several retrievers (BM25, vector search, ...) with weighted
Reciprocal Rank Fusion:

    score(d) = sum over rankings i that contain d of  weights[i] / (k + rank_i(d))

Requirements:
  - rank_i(d) is the 1-based position of d in ranking i (the first document has rank 1).
  - A document missing from a ranking gets nothing from it.
  - A document repeated inside one ranking counts once, at its best (first) position;
    positions are not renumbered.
  - weights defaults to 1 for every ranking; raise ValueError when its length differs from
    the number of rankings. k defaults to 60.
  - Return the `top` best documents as [[id, score], ...], highest score first, scores
    rounded to 6 decimals. Equal scores are ordered by id (alphabetically).
"""
import json
import sys


def rrf(rankings: list[list[str]], top: int, k: int = 60, weights: list[float] | None = None) -> list[list]:
    # @piece weights: One weight per ranking
    if weights is None:
        weights = [1.0] * len(rankings)
    if len(weights) != len(rankings):
        raise ValueError("one weight per ranking")
    # @end

    scores: dict[str, float] = {}
    for ranking, weight in zip(rankings, weights):
        # @piece add-ranking: Add the votes of one ranking
        seen = set()
        for rank, doc_id in enumerate(ranking, start=1):
            if doc_id in seen:
                continue  # a repeated id counts once, at its best rank
            seen.add(doc_id)
            scores[doc_id] = scores.get(doc_id, 0.0) + weight / (k + rank)
        # @end

    # @piece order: Best fused score first
    ordered = sorted(scores.items(), key=lambda item: (-item[1], item[0]))
    # @end
    return [[doc_id, round(score, 6)] for doc_id, score in ordered[:top]]


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    try:
        print(json.dumps(rrf(**case)))
    except ValueError:
        print(json.dumps({"error": "ValueError"}))
