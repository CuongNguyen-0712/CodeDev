# @piece check-support: Flag numbers the cited sources do not state
elif any(all(fact not in numbers[n] for n in sources) for fact in facts):
    problems.append({"sentence": index, "problem": "unsupported"})
