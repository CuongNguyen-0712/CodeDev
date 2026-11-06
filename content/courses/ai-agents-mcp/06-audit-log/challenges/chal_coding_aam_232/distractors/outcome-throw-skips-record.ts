// @piece outcome: Decide the outcome and run the tool if allowed
const start = this.clock.now();
let result: CallResult;
if (!Object.prototype.hasOwnProperty.call(this.tools, tool)) {
    result = { outcome: "error", message: `unknown tool: ${tool}` };
} else if (!this.policy(ctx.userId, tool)) {
    result = { outcome: "denied" };
} else {
    try {
        result = { outcome: "ok", value: this.tools[tool](args) };
    } catch (thrown) {
        return { outcome: "error", message: thrown instanceof Error ? thrown.message : String(thrown) };
    }
}
