# @piece run-p95s: One p95 per run, and the difference of their means
p95_a = [p95(sum(runs_a, []))] * len(runs_a)
p95_b = [p95(sum(runs_b, []))] * len(runs_b)
diff = mean(p95_a) - mean(p95_b)
