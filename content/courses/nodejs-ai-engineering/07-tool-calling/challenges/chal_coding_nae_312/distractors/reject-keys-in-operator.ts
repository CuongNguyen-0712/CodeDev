// @piece reject-keys: Reject a userId and any unknown argument
if (Object.hasOwn(parsed, "userId")) return "userId comes from the session";
for (const key of Object.keys(parsed)) {
    if (!(key in tool.parameters)) return `unexpected argument "${key}"`;
}
