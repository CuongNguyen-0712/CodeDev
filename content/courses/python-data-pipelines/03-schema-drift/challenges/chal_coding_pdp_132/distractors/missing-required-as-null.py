# @piece missing-required: Refuse a file without a required column
missing = [c for c, spec in CONTRACT.items() if spec["required"] and c not in present]
if missing:
    print("warning: missing " + ", ".join(missing), file=sys.stderr)
