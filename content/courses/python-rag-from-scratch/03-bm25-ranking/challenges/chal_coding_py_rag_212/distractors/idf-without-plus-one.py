# @piece idf: Inverse document frequency of each query term
terms = list(dict.fromkeys(tokens(query)))  # each distinct query term once
doc_sets = [set(t) for t in doc_tokens]
idf = {}
for term in terms:
    df = sum(1 for s in doc_sets if term in s)
    idf[term] = math.log((n_docs - df + 0.5) / (df + 0.5))
