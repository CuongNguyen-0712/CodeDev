"""
Offline retrieval metrics over a golden set.

Each result is {"query", "retrieved": ids in rank order, "relevant": ids a human marked as
correct}. The dashboard shows three averages over the queries - and they look wrong: recall
moves when k changes even though nothing is found, a document ranked 20th improves MRR@5, a
retriever that returns the same document twice scores better than one that does not, and
adding unlabelled queries to the golden set drags every metric down.

Intended behaviour, for each query with at least one relevant id:
  - top-k = the first k retrieved ids, as returned (a repeated id still takes a slot).
  - recall@k  = relevant ids found in the top-k / number of relevant ids
                (a relevant id counts once, however often it appears).
  - MRR@k     = 1 / rank of the first relevant id in the top-k (rank 1 = first), else 0.
  - hit rate  = 1 if any relevant id is in the top-k, else 0.
Queries without relevant ids are left out of the averages. With no query left, every metric
is 0.0. Averages are rounded to 4 decimals.
"""
import json
import sys


def evaluate(results: list[dict], k: int) -> dict:
    recall_sum = rr_sum = hit_sum = 0.0
    for result in results:
        relevant = set(result["relevant"])
        top = result["retrieved"][:k]
        found = [doc_id for doc_id in top if doc_id in relevant]
        recall_sum += len(found) / k
        for rank, doc_id in enumerate(result["retrieved"], start=1):
            if doc_id in relevant:
                rr_sum += 1 / rank
                break
        hit_sum += 1.0 if found else 0.0

    n = len(results)
    if n == 0:
        return {"recall_at_k": 0.0, "mrr": 0.0, "hit_rate": 0.0}
    return {
        "recall_at_k": round(recall_sum / n, 4),
        "mrr": round(rr_sum / n, 4),
        "hit_rate": round(hit_sum / n, 4),
    }


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(evaluate(**case)))
