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
    # @piece corpus-stats: Tokens of every document and the average length
    doc_tokens = [tokens(doc["text"]) for doc in docs]
    n_docs = len(docs)
    avgdl = sum(len(t) for t in doc_tokens) / n_docs if n_docs else 0
    if avgdl == 0:
        return []
    # @end

    # @piece idf: Inverse document frequency of each query term
    terms = list(dict.fromkeys(tokens(query)))  # each distinct query term once
    doc_sets = [set(t) for t in doc_tokens]
    idf = {}
    for term in terms:
        df = sum(1 for s in doc_sets if term in s)
        idf[term] = math.log((n_docs - df + 0.5) / (df + 0.5) + 1)
    # @end

    scored = []
    for doc, toks in zip(docs, doc_tokens):
        tf = Counter(toks)
        # @piece score: BM25 score of one document
        norm = k1 * (1 - b + b * len(toks) / avgdl)
        score = sum(idf[t] * tf[t] * (k1 + 1) / (tf[t] + norm) for t in terms if tf[t])
        # @end
        if score > 0:
            scored.append((doc["id"], score))

    # @piece rank: Best k documents, highest score first
    scored.sort(key=lambda item: item[1], reverse=True)  # stable: equal scores keep corpus order
    return [[doc_id, round(score, 4)] for doc_id, score in scored[:k]]
    # @end


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(bm25_rank(**case)))
