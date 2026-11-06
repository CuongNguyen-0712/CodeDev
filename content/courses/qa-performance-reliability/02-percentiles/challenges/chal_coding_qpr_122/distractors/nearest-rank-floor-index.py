# @piece nearest-rank: The nearest-rank value, None for an empty list
if not sorted_ms:
    return None
index = min(int(p / 100 * len(sorted_ms)), len(sorted_ms) - 1)
return sorted_ms[index]
