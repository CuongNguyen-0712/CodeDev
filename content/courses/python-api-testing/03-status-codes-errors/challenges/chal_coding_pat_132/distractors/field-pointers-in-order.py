# @piece field-pointers: The fields the error names, in any order
if expected.get("pointers") is not None:
    got = [e.get("pointer") for e in problem.get("errors", [])]
    if got != expected["pointers"]:
        failures.append(f"body.errors: expected {sorted(expected['pointers'])}, got {sorted(got)}")
