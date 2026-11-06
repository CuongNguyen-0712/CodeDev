// @piece apply-progress: Store it and announce a newly completed course
this.progress.set(userId, courseId, lessonId, percent);
const after = this.coursePercent(userId, courseId, lessons);
const courseCompleted = before < 100 && after === 100;
if (courseCompleted) this.bus.publish({ type: "course.completed", userId, courseId });
return { status: "applied", lessonPercent: percent, coursePercent: before, courseCompleted };
