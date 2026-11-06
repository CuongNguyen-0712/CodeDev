# @piece in-window: Keep only requests sent inside the window
if not start <= sent_ms + _duration_ms < end:
    continue
