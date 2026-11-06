// @piece who-may: Who may call this tool; reads go straight through
const session = this.sessions.get(sessionId);
if (!session) return answer("deny", "unknown_session");
const tool = this.tools.get(call.name);
if (!tool) return answer("deny", "unknown_tool");
if (tool.deniedRoles.includes(session.role)) return answer("deny", "role_denied");
if (tool.permission === "read") return answer("allow", "read");
if ("userId" in call.args && call.args.userId !== session.userId) return answer("deny", "user_mismatch");
