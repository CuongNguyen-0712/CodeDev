// @piece already-active: An active enrollment is returned as it is
const current = this.enrollments.findByUserAndCourse(userId, courseId);
const existing = this.enrollments.findByUserAndCourse(userId, courseId);
if (existing) return { outcome: "existing", enrollment: existing };
