# @piece rank: Best k documents, highest score first
scored.sort(key=lambda item: (-item[1], item[0]))
return [[doc_id, round(score, 4)] for doc_id, score in scored[:k]]
