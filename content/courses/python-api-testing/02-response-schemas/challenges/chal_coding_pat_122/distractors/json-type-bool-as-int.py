# @piece json-type: The JSON type of a decoded Python value
if value is None:
    return "null"
if isinstance(value, int) or (isinstance(value, float) and value.is_integer()):
    return "integer"
if isinstance(value, bool):
    return "boolean"
if isinstance(value, float):
    return "number"
if isinstance(value, str):
    return "string"
return "array" if isinstance(value, list) else "object"
