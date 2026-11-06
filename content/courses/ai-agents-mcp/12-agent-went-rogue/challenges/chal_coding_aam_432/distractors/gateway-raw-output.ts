// @piece gateway: Decide whether the call may run, then return its output
if (tool.permission === "write" && (token === null || !desk.redeem(token, session.id, call))) {
    return "error: write tools need an approval token for this exact call";
}
return tool.run(call.args, session);
