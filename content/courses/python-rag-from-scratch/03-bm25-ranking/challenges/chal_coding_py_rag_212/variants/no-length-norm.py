# Known wrong: ignores document length (b is always 0), so long keyword-heavy pages win.
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
    if not n or not sum(map(len, doc_tokens)):
        return []
    terms = list(dict.fromkeys(tokens(query)))
    idf = {t: math.log((n - sum(t in set(x) for x in doc_tokens) + 0.5) / (sum(t in set(x) for x in doc_tokens) + 0.5) + 1) for t in terms}
    scored = []
    for doc, toks in zip(docs, doc_tokens):
        tf = Counter(toks)
        s = sum(idf[t] * tf[t] * (k1 + 1) / (tf[t] + k1) for t in terms if tf[t])
        if s > 0:
            scored.append((doc["id"], s))
    scored.sort(key=lambda x: x[1], reverse=True)
    return [[i, round(s, 4)] for i, s in scored[:k]]


if __name__ == "__main__":
    print(json.dumps(bm25_rank(**json.load(sys.stdin))))
