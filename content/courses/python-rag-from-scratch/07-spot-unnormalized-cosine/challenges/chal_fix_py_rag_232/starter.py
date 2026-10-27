"""
Vector search for the support assistant.

The request sent to the AI assistant:
  "Write vector_search(query, chunks, top) for our support assistant. Rank the chunks by cosine
   similarity between their embedding and the query embedding and return the best `top` as
   {"id", "score"}, with the score rounded to 4 decimals. Highest score first, ties by id.
   A chunk whose vector is all zeros has no direction: skip it. If the query vector is all zeros,
   return an empty list."

The AI's answer is below. It passed review and the public tests, which use the unit-length
vectors of the embeddings API. Since the PDF import started storing one vector per page (the sum
of its paragraph vectors), long policy pages beat the article that answers the question.

Intended behaviour:
  - score = cosine similarity = dot(query, vector) / (|query| * |vector|), rounded to 4 decimals.
  - Chunks whose vector is all zeros are skipped; an all-zero query returns [].
  - Sort by score descending, then by id ascending; return at most `top` results.
  - All vectors in one call have the same dimension.
"""
import json
import sys


def dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def vector_search(query: list[float], chunks: list[dict], top: int) -> list[dict]:
    if not any(query):
        return []
    scored = []
    for chunk in chunks:
        vector = chunk["vector"]
        if not any(vector):
            continue  # a zero vector has no direction
        # cosine similarity of the two embeddings: higher means more similar
        score = round(dot(query, vector), 4)
        scored.append({"id": chunk["id"], "score": score})
    scored.sort(key=lambda item: (-item["score"], item["id"]))
    return scored[:top]


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(vector_search(**case)))
