# @piece score: Score one chunk against the query
score = round(dot(query, vector) / math.hypot(*vector), 4)
