// @piece decide-calls: Decide run or rejected for each call
const tools = new Map(input.tools.map((t) => [t.name, t]));
const confirmed = new Set(input.confirmedCallIds);
return input.calls.map((call): Decision => {
    const reject = (reason: string): Decision => ({ id: call.id, tool: call.name, status: "rejected", reason });
    const tool = tools.get(call.name);
    if (!tool) return reject(`unknown tool "${call.name}"`);
    if (tool.permission === "needs-confirmation" && !confirmed.has(call.id)) return reject("needs confirmation");
    const args = checkArguments(tool, call.arguments);
    if (typeof args === "string") return reject(args);
    if (tool.scope === "user") args.userId = input.sessionUserId;
    return { id: call.id, tool: call.name, status: "run", args };
});
