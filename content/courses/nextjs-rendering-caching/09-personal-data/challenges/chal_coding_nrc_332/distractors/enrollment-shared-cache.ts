// @piece enrollment: Enrolled learners see their progress
const enrollmentKey = `enrollment:${course.id}`;
let enrollment = deps.sharedCache.get(enrollmentKey) as Enrollment | undefined;
if (!enrollment) {
    enrollment = deps.loadEnrollment(req.userId, course.id);
    deps.sharedCache.set(enrollmentKey, enrollment);
}
if (enrollment.enrolled) return `${head} | Enrolled, ${enrollment.progress}% complete`;
