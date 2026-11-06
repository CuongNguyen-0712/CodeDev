# @piece verdict: The verdict from the interval
if diff > 0:
    verdict = "B is faster"
elif diff < 0:
    verdict = "B is slower"
else:
    verdict = "no clear difference"
