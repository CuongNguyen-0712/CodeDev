# @piece backoff-delay: Exponential backoff with full jitter, or Retry-After
delay = 1.0
if retry_after is not None:
    delay = max(delay, retry_after)
