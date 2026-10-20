"""
Rank documents for a query with Okapi BM25.

    score(D, Q) = sum over distinct query terms t present in D of
                  IDF(t) * f(t, D) * (k1 + 1) / (f(t, D) + k1 * (1 - b + b * |D| / avgdl))

    IDF(t) = ln((N - n(t) + 0.5) / (n(t) + 0.5) + 1)

  f(t, D)  occurrences of t in D          |D|    number of tokens in D
  N        number of documents            avgdl  average |D| over the corpus
  n(t)     documents that contain t

Requirements:
  - Tokens: lower-case words and numbers (use tokens()). Each distinct query term counts once,
    however often the query repeats it.
  - Return the top `k` documents with a score > 0 as [[id, score], ...], best first, scores
    rounded to 4 decimals at the end. Equal scores keep the corpus order.
  - Honour k1 and b when the caller passes them.
  - An empty corpus, a corpus of empty documents or an empty query gives [].
"""
import json
import math
import re
import sys
from collections import Counter


def tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def bm25_rank(docs: list[dict], query: str, k: int, k1: float = 1.5, b: float = 0.75) -> list[list]:
    # BUG (on purpose): this is raw TF-IDF - no saturation, no length normalisation,
    # and a term found in every document scores 0.
    n_docs = len(docs)
    scored = []
    for doc in docs:
        tf = Counter(tokens(doc["text"]))
        score = 0.0
        for term in tokens(query):
            df = sum(1 for d in docs if term in tokens(d["text"]))
            if tf[term]:
                score += tf[term] * math.log(n_docs / df)
        if score > 0:
            scored.append([doc["id"], round(score, 4)])
    scored.sort(key=lambda item: item[1], reverse=True)
    return scored[:k]


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(bm25_rank(**case)))
