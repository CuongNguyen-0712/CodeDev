# @piece match-like: Same type as the example, not the same value
if isinstance(expected, dict) and "$like" in expected:
    if actual != expected["$like"]:
        return [f"{path}: expected {json.dumps(expected['$like'])}, got {json.dumps(actual)}"]
    return []
