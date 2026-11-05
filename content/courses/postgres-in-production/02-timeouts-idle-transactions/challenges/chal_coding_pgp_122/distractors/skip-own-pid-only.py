# @piece skip-untouchable: Sessions the watchdog must never touch
if row["pid"] == case["my_pid"]:
    continue
