# @piece retryable-errors: Which failures are worth another try
except BaseException as error:
    if isinstance(error, HTTPError) and error.status not in RETRYABLE_STATUS:
        raise
    last, retry_after = error, getattr(error, "retry_after", None)
