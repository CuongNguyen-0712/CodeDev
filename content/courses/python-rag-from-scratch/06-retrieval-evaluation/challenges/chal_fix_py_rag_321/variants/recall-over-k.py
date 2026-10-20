# Known wrong: recall divides by k (that is precision), so it changes with k even when nothing new is found.
import json
import sys


def evaluate(results, k):
    recalls, rrs, hits = [], [], []
    for r in results:
        relevant = set(r["relevant"])
        if not relevant:
            continue
        top = r["retrieved"][:k]
        found = relevant.intersection(top)
        recalls.append(len(found) / k)
        rrs.append(next((1 / i for i, d in enumerate(top, start=1) if d in relevant), 0.0))
        hits.append(1.0 if found else 0.0)
    if not recalls:
        return {"recall_at_k": 0.0, "mrr": 0.0, "hit_rate": 0.0}
    n = len(recalls)
    return {"recall_at_k": round(sum(recalls) / n, 4), "mrr": round(sum(rrs) / n, 4), "hit_rate": round(sum(hits) / n, 4)}


if __name__ == "__main__":
    print(json.dumps(evaluate(**json.load(sys.stdin))))
