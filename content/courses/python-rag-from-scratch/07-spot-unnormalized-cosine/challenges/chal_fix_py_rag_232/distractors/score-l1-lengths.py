# @piece score: Score one chunk against the query
score = round(dot(query, vector) / (sum(map(abs, query)) * sum(map(abs, vector))), 4)
