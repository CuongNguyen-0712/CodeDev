# @piece integer-bounds: Both sides of an integer's minimum and maximum
if kind == "integer":
    if "minimum" in spec:
        case(f"{name}-at-min", name, spec["minimum"], "accepted")
        case(f"{name}-below-min", name, spec["minimum"] - 100, "rejected")
    if "maximum" in spec:
        case(f"{name}-at-max", name, spec["maximum"], "accepted")
        case(f"{name}-above-max", name, spec["maximum"] + 100, "rejected")
