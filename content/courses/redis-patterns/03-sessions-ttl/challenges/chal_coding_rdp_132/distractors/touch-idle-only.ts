// @piece touch-session: Extend a session, never past its absolute lifetime
const session = readSession(r, sessionId);
if (session === null) return null;
const leftSeconds = Math.floor((session.createdAt + ABSOLUTE_LIFETIME_SECONDS * 1000 - clock.now) / 1000);
if (leftSeconds <= 0) {
    deleteSession(r, sessionId);
    return null;
}
r.expire(sessionKey(sessionId), IDLE_TTL_SECONDS);
return session;
