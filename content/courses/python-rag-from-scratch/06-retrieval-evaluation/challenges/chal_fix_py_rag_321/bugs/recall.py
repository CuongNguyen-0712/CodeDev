# @piece recall: Recall of one query
found = [doc_id for doc_id in top if doc_id in relevant]
recall_sum += len(found) / k
