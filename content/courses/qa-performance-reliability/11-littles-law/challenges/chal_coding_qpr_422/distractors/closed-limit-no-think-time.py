# @piece closed-limit: The rate a closed model can reach, and how it compares
closed_limit = None
if report["vus"] is not None:
    closed_limit = Fraction(report["vus"] * 1000, latency)
    if x * 100 > (100 + tol) * closed_limit:
        findings.append("above_closed_limit")
    elif x * 100 < (100 - tol) * closed_limit:
        findings.append("idle_virtual_users")
