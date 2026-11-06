# @piece reciprocal-rank: Reciprocal rank of the first relevant document
for rank, doc_id in enumerate(result["retrieved"], start=1):
    if doc_id in relevant:
        rr_sum += 1 / rank
        break
