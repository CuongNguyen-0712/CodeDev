// @piece profile-response: The public profile, or 404
const user = this.service.getProfile(req.params.id);
if (user === null) return { status: 404, headers: {}, body: { error: "user not found" } };
return {
    status: 200,
    headers: {},
    body: { ...user, passwordHash: undefined, joinedAt: user.createdAt },
};
