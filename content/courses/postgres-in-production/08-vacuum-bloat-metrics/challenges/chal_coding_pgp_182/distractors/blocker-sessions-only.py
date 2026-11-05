# @piece find-blocker: The session or slot that holds the xmin horizon back
def find_blocker(sessions, slots, max_xmin_age):
    holders = [(s["xmin_age"], f"pid {s['pid']}") for s in sessions if s.get("xmin_age") is not None]
    holders = [h for h in holders if h[0] > max_xmin_age]
    return max(holders)[1] if holders else None
