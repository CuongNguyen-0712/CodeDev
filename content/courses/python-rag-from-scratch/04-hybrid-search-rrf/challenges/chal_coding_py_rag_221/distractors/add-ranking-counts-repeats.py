# @piece add-ranking: Add the votes of one ranking
for rank, doc_id in enumerate(ranking, start=1):
    scores[doc_id] = scores.get(doc_id, 0.0) + weight / (k + rank)
