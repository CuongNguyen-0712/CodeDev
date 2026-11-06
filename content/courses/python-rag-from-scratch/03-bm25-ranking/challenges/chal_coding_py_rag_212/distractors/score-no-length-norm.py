# @piece score: BM25 score of one document
norm = k1
score = sum(idf[t] * tf[t] * (k1 + 1) / (tf[t] + norm) for t in terms if tf[t])
