# Known wrong: every ranking counts the same, whatever weights the caller passed.
import json
import sys


def rrf(rankings, top, k=60, weights=None):
    if weights is not None and len(weights) != len(rankings):
        raise ValueError("one weight per ranking")
    scores = {}
    for ranking in rankings:
        seen = set()
        for rank, doc_id in enumerate(ranking, start=1):
            if doc_id in seen:
                continue
            seen.add(doc_id)
            scores[doc_id] = scores.get(doc_id, 0.0) + 1 / (k + rank)
    ordered = sorted(scores.items(), key=lambda x: (-x[1], x[0]))
    return [[d, round(s, 6)] for d, s in ordered[:top]]


if __name__ == "__main__":
    case = json.load(sys.stdin)
    try:
        print(json.dumps(rrf(**case)))
    except ValueError:
        print(json.dumps({"error": "ValueError"}))
