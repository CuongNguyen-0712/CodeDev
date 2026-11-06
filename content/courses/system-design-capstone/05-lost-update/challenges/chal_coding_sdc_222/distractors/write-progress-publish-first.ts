// @piece write-progress: Load, check and save the progress, then announce it
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const doc = await db.load(req.userId, req.courseId);
    const current = doc.lessons[req.lessonId] ?? 0;
    if (percent <= current) return { status: "unchanged", lessonPercent: current };

    const lessons = { ...doc.lessons, [req.lessonId]: percent };
    const next: ProgressDoc = { version: doc.version + 1, lessons, coursePercent: coursePercent(lessons, courseLessons) };
    bus.publish({
        type: "progress.updated",
        userId: req.userId,
        courseId: req.courseId,
        lessonId: req.lessonId,
        lessonPercent: percent,
        coursePercent: next.coursePercent,
        version: next.version,
    });
    if (!(await db.saveIfVersion(req.userId, req.courseId, doc.version, next))) continue;
    return { status: "applied", version: next.version, coursePercent: next.coursePercent };
}
return { status: "rejected", error: "CONFLICT" };
