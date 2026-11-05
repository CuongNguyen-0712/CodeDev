# @piece validate-constraint: VALIDATE CONSTRAINT: its lock and verdict
if re.match(r"validate\s+constraint\s+\S+$", act):
    return finding(s, "ACCESS EXCLUSIVE", "scans the table", "unsafe", [s])
