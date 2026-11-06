// @piece write-progress: Load, check and save the progress, then announce it
const doc = await db.load(req.userId, req.courseId);
const current = doc.lessons[req.lessonId] ?? 0;
if (percent <= current) return { status: "unchanged", lessonPercent: current };

doc.lessons[req.lessonId] = percent;
doc.coursePercent = coursePercent(doc.lessons, courseLessons);
doc.version += 1;
await db.save(req.userId, req.courseId, doc);

bus.publish({
    type: "progress.updated",
    userId: req.userId,
    courseId: req.courseId,
    lessonId: req.lessonId,
    lessonPercent: percent,
    coursePercent: doc.coursePercent,
    version: doc.version,
});
return { status: "applied", version: doc.version, coursePercent: doc.coursePercent };
