// @piece taint: An untrusted result taints this session
if (spec.permission === "read" && !this.tainted.has(sessionId)) this.tainted.set(sessionId, callId);
