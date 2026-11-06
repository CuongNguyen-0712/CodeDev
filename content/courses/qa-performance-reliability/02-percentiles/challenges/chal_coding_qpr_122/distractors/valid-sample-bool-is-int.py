# @piece valid-sample: Which samples count, and which are invalid
def is_number(value):
    return isinstance(value, (int, float))


def is_valid(sample):
    return (
        isinstance(sample, dict)
        and isinstance(sample.get("endpoint"), str)
        and sample["endpoint"] != ""
        and is_number(sample.get("ms"))
        and sample["ms"] >= 0
        and isinstance(sample.get("status"), int)
    )
