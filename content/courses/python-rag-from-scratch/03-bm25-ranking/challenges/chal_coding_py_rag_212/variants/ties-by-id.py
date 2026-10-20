# Known wrong: breaks ties alphabetically by id instead of keeping the corpus order.
import json
import math
import re
import sys
from collections import Counter


def tokens(text):
    return re.findall(r"[a-z0-9]+", text.lower())


def bm25_rank(docs, query, k, k1=1.5, b=0.75):
    doc_tokens = [tokens(d["text"]) for d in docs]
    n = len(docs)
    avgdl = sum(map(len, doc_tokens)) / n if n else 0
    if not avgdl:
        return []
    terms = list(dict.fromkeys(tokens(query)))
    idf = {}
    for t in terms:
        df = sum(t in set(x) for x in doc_tokens)
        idf[t] = math.log((n - df + 0.5) / (df + 0.5) + 1)
    scored = []
    for doc, toks in zip(docs, doc_tokens):
        tf = Counter(toks)
        norm = k1 * (1 - b + b * len(toks) / avgdl)
        s = sum(idf[t] * tf[t] * (k1 + 1) / (tf[t] + norm) for t in terms if tf[t])
        if s > 0:
            scored.append((doc["id"], s))
    scored.sort(key=lambda x: (-x[1], x[0]))
    return [[i, round(s, 4)] for i, s in scored[:k]]


if __name__ == "__main__":
    print(json.dumps(bm25_rank(**json.load(sys.stdin))))
