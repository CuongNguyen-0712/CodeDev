"""Offline retrieval metrics over a golden set: recall@k, MRR@k and hit rate@k."""
import json
import sys


def evaluate(results: list[dict], k: int) -> dict:
    recalls: list[float] = []
    reciprocal_ranks: list[float] = []
    hits: list[float] = []

    for result in results:
        relevant = set(result["relevant"])
        if not relevant:
            continue  # nothing to find: the query cannot be scored
        top = result["retrieved"][:k]  # what the model would see, duplicates included
        found = relevant.intersection(top)
        recalls.append(len(found) / len(relevant))
        reciprocal_ranks.append(next((1 / rank for rank, doc_id in enumerate(top, start=1) if doc_id in relevant), 0.0))
        hits.append(1.0 if found else 0.0)

    if not recalls:
        return {"recall_at_k": 0.0, "mrr": 0.0, "hit_rate": 0.0}
    n = len(recalls)
    return {
        "recall_at_k": round(sum(recalls) / n, 4),
        "mrr": round(sum(reciprocal_ranks) / n, 4),
        "hit_rate": round(sum(hits) / n, 4),
    }


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(evaluate(**case)))
