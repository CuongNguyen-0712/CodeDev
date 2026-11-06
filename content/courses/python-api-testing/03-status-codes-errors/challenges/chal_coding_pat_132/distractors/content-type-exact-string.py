# @piece problem-content-type: Error bodies are application/problem+json
if headers.get("content-type") != "application/problem+json":
    failures.append(f"content-type: expected application/problem+json, got {headers.get('content-type', 'none')}")
