// @piece token-checks: Spend the token only on this exact call, once
const grant = this.grants.get(token);
if (!grant) return answer("deny", "invalid_token");
if (grant.used) return answer("deny", "token_used");
if (now >= grant.expiresAt) return answer("deny", "token_expired");
if (grant.sessionId !== sessionId) return answer("deny", "token_wrong_session");
if (grant.tool !== call.name || grant.argsHash !== sha256(canonicalJson(call.args))) return answer("deny", "token_mismatch");
if (overLimit && grant.approverRole !== "manager") return answer("needs_approval", "manager_approval_required");
return answer("allow", "approved", token);
