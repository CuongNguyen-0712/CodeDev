// @piece reject-keys: Reject a userId and any unknown argument
for (const key of Object.keys(parsed)) {
    if (key !== "userId" && !Object.hasOwn(tool.parameters, key)) return `unexpected argument "${key}"`;
}
