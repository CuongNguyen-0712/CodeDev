# @piece add-ranking: Add the votes of one ranking
seen = set()
for rank, doc_id in enumerate(ranking):
    if doc_id in seen:
        continue
    seen.add(doc_id)
    scores[doc_id] = scores.get(doc_id, 0.0) + weight / (k + rank)
