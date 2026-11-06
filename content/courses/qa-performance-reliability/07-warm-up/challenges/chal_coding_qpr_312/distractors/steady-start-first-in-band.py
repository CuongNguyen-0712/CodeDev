# @piece steady-start: Walk back from the end while windows stay in the band
reference = statistics.median(p95s[n // 2:])
# the warm-up is over as soon as one window is inside the band
start = next((i for i, v in enumerate(p95s) if abs(v - reference) <= band * reference), n)
