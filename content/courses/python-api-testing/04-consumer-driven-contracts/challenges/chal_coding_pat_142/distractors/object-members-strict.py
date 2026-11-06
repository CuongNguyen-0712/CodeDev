# @piece object-members: Only the keys the consumer reads
if isinstance(expected, dict):
    if not isinstance(actual, dict):
        return [f"{path}: expected object, got {json_type(actual)}"]
    problems = []
    for key, sub in expected.items():
        if key not in actual:
            problems.append(f"{path}.{key}: missing")
        else:
            problems += verify(sub, actual[key], f"{path}.{key}")
    problems += [f"{path}.{key}: not in the pact" for key in actual if key not in expected]
    return problems
