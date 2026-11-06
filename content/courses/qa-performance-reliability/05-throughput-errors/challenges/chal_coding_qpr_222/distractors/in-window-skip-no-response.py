# @piece in-window: Keep only requests sent inside the window
if status == 0 or not start <= sent_ms < end:
    continue
