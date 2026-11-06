# @piece p95-rank: Nearest-rank p95 of one run
ordered = sorted(samples)
return ordered[min(int(0.95 * len(ordered)), len(ordered) - 1)]
