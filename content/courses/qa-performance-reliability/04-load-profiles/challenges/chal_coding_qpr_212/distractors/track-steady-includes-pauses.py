# @piece track-steady: Remember the longest stage that holds a rate
if a == b and (steady is None or d > steady["end_s"] - steady["start_s"]):
    steady = {"start_s": len(schedule), "end_s": len(schedule) + d, "rate": b}
