# @piece steady-start: Walk back from the end while windows stay in the band
reference = statistics.median(p95s)
start = n
while start > 0 and abs(p95s[start - 1] - reference) <= band * reference:
    start -= 1
