# Known wrong: an id repeated inside one ranking is counted every time it appears.
import json
import sys


def rrf(rankings, top, k=60, weights=None):
    weights = [1.0] * len(rankings) if weights is None else weights
    if len(weights) != len(rankings):
        raise ValueError("one weight per ranking")
    scores = {}
    for ranking, w in zip(rankings, weights):
        for rank, doc_id in enumerate(ranking, start=1):
            scores[doc_id] = scores.get(doc_id, 0.0) + w / (k + rank)
    ordered = sorted(scores.items(), key=lambda x: (-x[1], x[0]))
    return [[d, round(s, 6)] for d, s in ordered[:top]]


if __name__ == "__main__":
    case = json.load(sys.stdin)
    try:
        print(json.dumps(rrf(**case)))
    except ValueError:
        print(json.dumps({"error": "ValueError"}))
