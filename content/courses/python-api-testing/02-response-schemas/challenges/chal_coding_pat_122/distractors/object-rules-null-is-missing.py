# @piece object-rules: Missing, nested and unexpected properties
for name in schema.get("required", []):
    if value.get(name) is None:
        problems.append(f"{path}.{name}: missing")
props = schema.get("properties", {})
for name, sub in props.items():
    if name in value:
        problems += validate(sub, value[name], f"{path}.{name}")
if schema.get("additionalProperties") is False:
    problems += [f"{path}.{name}: not allowed" for name in value if name not in props]
