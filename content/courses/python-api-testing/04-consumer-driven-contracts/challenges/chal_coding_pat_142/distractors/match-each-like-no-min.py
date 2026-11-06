# @piece match-each-like: Enough elements, each like the example
if isinstance(expected, dict) and "$eachLike" in expected:
    if not isinstance(actual, list):
        return [f"{path}: expected array, got {json_type(actual)}"]
    problems = []
    for i, item in enumerate(actual):
        problems += like(expected["$eachLike"], item, f"{path}[{i}]")
    return problems
