# @piece string-lengths: Both sides of a string's length limits
if kind == "string":
    if spec.get("minLength", 0) > 0:
        case(f"{name}-at-min-length", name, "x" * spec["minLength"], "accepted")
        case(f"{name}-under-min-length", name, "", "rejected")
    if "maxLength" in spec:
        case(f"{name}-at-max-length", name, "x" * spec["maxLength"], "accepted")
        case(f"{name}-over-max-length", name, "x" * (spec["maxLength"] * 2), "rejected")
