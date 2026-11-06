# @piece retryable-errors: Which failures are worth another try
except Exception as error:
    last, retry_after = error, getattr(error, "retry_after", None)
