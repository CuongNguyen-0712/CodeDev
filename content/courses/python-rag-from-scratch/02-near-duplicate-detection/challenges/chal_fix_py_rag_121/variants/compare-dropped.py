# Known wrong: compares with every earlier document, dropped ones included, so duplicates chain and drop distinct documents.
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
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b)


def dedupe(docs, k, threshold):
    seen, kept = [], []
    for doc in docs:
        signature = shingles(doc["text"], k)
        duplicate = any(jaccard(signature, other) >= threshold for other in seen)
        seen.append(signature)
        if not duplicate:
            kept.append(doc["id"])
    return kept


if __name__ == "__main__":
    print(json.dumps(dedupe(**json.load(sys.stdin))))
