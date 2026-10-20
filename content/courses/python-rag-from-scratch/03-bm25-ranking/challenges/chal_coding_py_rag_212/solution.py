"""Rank documents for a query with Okapi BM25."""
import json
import math
import re
import sys
from collections import Counter


def tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def bm25_rank(docs: list[dict], query: str, k: int, k1: float = 1.5, b: float = 0.75) -> list[list]:
    doc_tokens = [tokens(doc["text"]) for doc in docs]
    n_docs = len(docs)
    avgdl = sum(len(t) for t in doc_tokens) / n_docs if n_docs else 0
    if avgdl == 0:
        return []

    terms = list(dict.fromkeys(tokens(query)))  # each distinct query term once
    doc_sets = [set(t) for t in doc_tokens]
    idf = {}
    for term in terms:
        df = sum(1 for s in doc_sets if term in s)
        idf[term] = math.log((n_docs - df + 0.5) / (df + 0.5) + 1)

    scored = []
    for doc, toks in zip(docs, doc_tokens):
        tf = Counter(toks)
        norm = k1 * (1 - b + b * len(toks) / avgdl)
        score = sum(idf[t] * tf[t] * (k1 + 1) / (tf[t] + norm) for t in terms if tf[t])
        if score > 0:
            scored.append((doc["id"], score))

    scored.sort(key=lambda item: item[1], reverse=True)  # stable: equal scores keep corpus order
    return [[doc_id, round(score, 4)] for doc_id, score in scored[:k]]


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(bm25_rank(**case)))
