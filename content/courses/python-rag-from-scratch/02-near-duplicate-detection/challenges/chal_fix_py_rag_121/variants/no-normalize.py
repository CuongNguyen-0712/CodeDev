# Known wrong: shingles and Jaccard are fixed, but case and punctuation still make copies look different.
import json
import sys


def tokens(text):
    return text.split()


def shingles(text, k):
    words = tokens(text)
    if len(words) < k:
        return {tuple(words)} if words else set()
    return {tuple(words[i:i + k]) for i in range(len(words) - k + 1)}


def jaccard(a, b):
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b)


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
