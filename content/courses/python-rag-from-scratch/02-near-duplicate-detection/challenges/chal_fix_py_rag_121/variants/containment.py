# Known wrong: divides by the new document's shingles (containment), so a short quote of a long article is dropped.
import json
import re
import sys


def tokens(text):
    return re.findall(r"[a-z0-9]+", text.lower())


def shingles(text, k):
    words = tokens(text)
    if len(words) < k:
        return {tuple(words)} if words else set()
    return {tuple(words[i:i + k]) for i in range(len(words) - k + 1)}


def jaccard(a, b):
    if not a:
        return 1.0 if not b else 0.0
    return len(a & b) / len(a)


def dedupe(docs, k, threshold):
    kept = []
    for doc in docs:
        signature = shingles(doc["text"], k)
        if any(jaccard(signature, other) >= threshold for _, other in kept):
            continue
        kept.append((doc["id"], signature))
    return [doc_id for doc_id, _ in kept]


if __name__ == "__main__":
    print(json.dumps(dedupe(**json.load(sys.stdin))))
