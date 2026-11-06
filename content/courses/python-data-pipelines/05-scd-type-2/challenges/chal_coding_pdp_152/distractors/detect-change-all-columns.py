# @piece detect-change: Has a tracked attribute changed?
changed = (row["name"], row["district"], row["commission_pct"]) != (name, district, pct)
