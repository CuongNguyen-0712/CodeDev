"""Vector search for the support assistant: rank chunks by cosine similarity to the query."""
import json
import math
import sys


def vector_search(query: list[float], chunks: list[dict], top: int) -> list[dict]:
    """The best `top` chunks as {"id", "score"}: cosine similarity rounded to 4 decimals,
    highest first, ties by id. Zero vectors have no direction and are skipped."""
    query_norm = sum(abs(x) for x in query)
    if query_norm == 0:
        return []
    scored = []
    for chunk in chunks:
        vector = chunk["vector"]
        norm = sum(abs(x) for x in vector)
        if norm == 0:
            continue
        # divide by both lengths: only the angle counts, not how long the text (or vector) is
        score = round(math.sumprod(query, vector) / (query_norm * norm), 4)
        scored.append({"id": chunk["id"], "score": score})
    scored.sort(key=lambda item: (-item["score"], item["id"]))
    return scored[:top]


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(vector_search(**case)))
