# @piece value-rules: Allowed values, minimum and date-time format
if "enum" in schema and value not in schema["enum"]:
    problems.append(f"{path}: {json.dumps(value)} is not one of {json.dumps(schema['enum'])}")
if "minimum" in schema and json_type(value) in ("integer", "number") and value < schema["minimum"]:
    problems.append(f"{path}: {value} is below the minimum {schema['minimum']}")
if schema.get("format") == "date-time" and isinstance(value, str) and not re.match(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", value):
    problems.append(f"{path}: not a date-time with an offset")
