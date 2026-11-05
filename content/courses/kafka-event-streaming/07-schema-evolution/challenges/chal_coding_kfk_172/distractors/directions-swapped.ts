// @piece directions: Who reads whose data in this mode
if (mode.startsWith("BACKWARD") || mode.startsWith("FULL")) problems.push(...canRead(old, next));
if (mode.startsWith("FORWARD") || mode.startsWith("FULL")) problems.push(...canRead(next, old));
