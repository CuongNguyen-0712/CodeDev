// @piece kill-switch: Off for everyone once the flag is killed
if (!flag.enabled && c.id !in flag.allow) return Decision(false, "killed")
