// @piece days-left: Whole days of access left
const current = this.repo.findOne(userId, courseId);
if (!current) return 0;
const remaining = Date.parse(current.expiresAt) - this.clock.now().getTime();
return remaining > 0 ? Math.floor(remaining / DAY_MS) : 0;
