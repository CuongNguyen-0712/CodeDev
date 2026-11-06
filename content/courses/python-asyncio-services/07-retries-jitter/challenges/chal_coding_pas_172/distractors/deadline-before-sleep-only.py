# @piece deadline-check: Give up instead of sleeping past the deadline
if loop.time() >= give_up_at:
    break
