# @piece concurrent-index: CREATE INDEX with and without CONCURRENTLY
if re.match(r"create\s+(unique\s+)?index\s+concurrently\b", low):
    return finding(s, "SHARE UPDATE EXCLUSIVE", "builds an index", "safe", [s])
if re.match(r"create\s+(unique\s+)?index\b", low):
    fixed = re.sub(r"(?i)^create(\s+unique)?\s+index\s+", lambda m: f"CREATE{m.group(1) or ''} INDEX CONCURRENTLY ", s)
    return finding(s, "SHARE", "builds an index", "unsafe", ["BEGIN", fixed, "COMMIT"])
