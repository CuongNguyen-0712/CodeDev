"""
Rice Rocket's api reads all of its configuration from environment variables. Write load_config(schema,
env): it checks every variable the schema lists against the environment at startup, so a bad deploy
fails fast with a list of ALL problems instead of crashing later - or worse, running with a wrong value.

schema: a list of entries, in the order to check them:
    {"name": "PORT", "type": "int", "default": "8080", "min": 1, "max": 65535}
  - "type" is one of "str", "int", "bool", "url", "enum";
  - "default" (optional) is a string, parsed exactly like a value from the environment;
  - "secret": true (optional) marks passwords, tokens and URLs that contain them;
  - "min" / "max" (optional, int only) and "choices" (enum only, a list of strings).
env: a dict of environment variables (names and values are strings). Variables the schema does not
  list are ignored.

Rules, for each schema entry:
  - Take env[name] with surrounding whitespace removed. A missing variable and an empty value ("" or
    only spaces) both count as "not set".
  - Not set: use the default and add the name to "defaults_used". No default: the error is
    "<NAME>: required but not set".
  - Parse the value by type:
      str   any value                    -> the string
      int   an optional "-" and digits 0-9 only (no "+", "_", "." or spaces inside) -> int;
            otherwise "<NAME>: not an integer: <value>". Then, when present,
            value < min -> "<NAME>: must be at least <min>, got <value>"
            value > max -> "<NAME>: must be at most <max>, got <value>"
      bool  true/yes/1 -> True, false/no/0 -> False, any letter case
            otherwise "<NAME>: not a boolean: <value>"
      url   urllib.parse.urlsplit(value) must have a scheme and a hostname -> the string
            otherwise "<NAME>: not a URL (need scheme://host): <value>"
      enum  must equal one of the choices exactly (case matters) -> the string
            otherwise "<NAME>: must be one of <choices joined by ', '>, got <value>"
  - <value> in a message is repr(value) (the stripped text in quotes, like 'abc'), except the int
    range messages, which show the number itself (got 70000).
  - Secrets never appear in output: in their error messages <value> is the text (value hidden), and
    in "config" their value is "***".

Return {"ok": True when there are no errors,
        "config": {name: typed value, ...} in schema order, or None when there are errors,
        "defaults_used": [names, in schema order],
        "errors": [messages, in schema order]}

Example: schema [PORT int default "8080", DEBUG bool default "false"], env {"DEBUG": " FALSE "}
  -> {"ok": true, "config": {"PORT": 8080, "DEBUG": false}, "defaults_used": ["PORT"], "errors": []}
"""
import json
import re
import sys
from urllib.parse import urlsplit

TRUE = {"true", "yes", "1"}
FALSE = {"false", "no", "0"}


def parse(entry, value):
    """Return (typed value, None) or (None, error message without the name)."""
    shown = "(value hidden)" if entry.get("secret") else repr(value)
    kind = entry["type"]
    if kind == "str":
        return value, None
    if kind == "int":
        if not re.fullmatch(r"-?[0-9]+", value):
            return None, f"not an integer: {shown}"
        number = int(value)
        got = "(value hidden)" if entry.get("secret") else number
        if "min" in entry and number < entry["min"]:
            return None, f"must be at least {entry['min']}, got {got}"
        if "max" in entry and number > entry["max"]:
            return None, f"must be at most {entry['max']}, got {got}"
        return number, None
    if kind == "bool":
        if value.lower() in TRUE:
            return True, None
        if value.lower() in FALSE:
            return False, None
        return None, f"not a boolean: {shown}"
    if kind == "url":
        try:
            parts = urlsplit(value)
            ok = bool(parts.scheme and parts.hostname)
        except ValueError:
            ok = False
        return (value, None) if ok else (None, f"not a URL (need scheme://host): {shown}")
    if kind == "enum":
        if value in entry["choices"]:
            return value, None
        return None, f"must be one of {', '.join(entry['choices'])}, got {shown}"
    raise ValueError(f"unknown type {kind!r}")


def load_config(schema, env):
    config, defaults_used, errors = {}, [], []
    for entry in schema:
        name = entry["name"]
        value = (env.get(name) or "").strip()
        if not value:
            if "default" not in entry:
                errors.append(f"{name}: required but not set")
                continue
            value = entry["default"]
            defaults_used.append(name)
        typed, error = parse(entry, value)
        if error:
            errors.append(f"{name}: {error}")
            break
        else:
            config[name] = "***" if entry.get("secret") else typed
    return {"ok": not errors, "config": None if errors else config,
            "defaults_used": defaults_used, "errors": errors}


# ---------------------------------------------------------------- test runner (do not change)
# Reads one test case (JSON: {"schema": [...], "env": {...}}) from stdin and prints the result as JSON.
if __name__ == "__main__":
    case = json.load(sys.stdin)
    print(json.dumps(load_config(case["schema"], case["env"]), ensure_ascii=False))
