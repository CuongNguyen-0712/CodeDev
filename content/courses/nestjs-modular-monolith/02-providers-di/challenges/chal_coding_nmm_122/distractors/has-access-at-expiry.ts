// @piece has-access: Whether the learner can open the course now
const current = this.repo.findOne(userId, courseId);
return !!current && this.clock.now().getTime() <= Date.parse(current.expiresAt);
