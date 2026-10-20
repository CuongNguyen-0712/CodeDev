# Known wrong: ranks start at 0, so every score is shifted.
import json
import sys


def rrf(rankings, top, k=60, weights=None):
    weights = [1.0] * len(rankings) if weights is None else weights
    if len(weights) != len(rankings):
        raise ValueError("one weight per ranking")
    scores = {}
    for ranking, w in zip(rankings, weights):
        seen = set()
        for rank, doc_id in enumerate(ranking):
            if doc_id in seen:
                continue
            seen.add(doc_id)
            scores[doc_id] = scores.get(doc_id, 0.0) + w / (k + rank)
    ordered = sorted(scores.items(), key=lambda x: (-x[1], x[0]))
    return [[d, round(s, 6)] for d, s in ordered[:top]]


if __name__ == "__main__":
    case = json.load(sys.stdin)
    try:
        print(json.dumps(rrf(**case)))
    except ValueError:
        print(json.dumps({"error": "ValueError"}))
