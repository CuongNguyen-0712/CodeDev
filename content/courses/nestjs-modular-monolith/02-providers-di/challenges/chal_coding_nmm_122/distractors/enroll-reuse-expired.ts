// @piece enroll-reuse-or-create: Reuse an active enrollment or start a new one
const current = this.repo.findOne(userId, courseId);
const now = this.clock.now();
if (current) return current;
const enrollment: Enrollment = {
    userId,
    courseId,
    enrolledAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ACCESS_DAYS * DAY_MS).toISOString(),
};
this.repo.save(enrollment);
return enrollment;
