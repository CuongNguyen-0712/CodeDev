# @piece redact-secrets: Hide credentials in headers and in the body
clean_headers = {k: "[REDACTED]" if k.lower() in SECRET_HEADERS else v for k, v in headers.items()}
return clean_headers, body
