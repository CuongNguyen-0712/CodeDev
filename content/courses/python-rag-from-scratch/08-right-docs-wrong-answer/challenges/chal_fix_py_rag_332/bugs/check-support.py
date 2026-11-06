# @piece check-support: Flag numbers the cited sources do not state
elif any(fact not in everything for fact in facts):
    problems.append({"sentence": index, "problem": "unsupported"})
