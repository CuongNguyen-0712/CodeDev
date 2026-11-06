// @piece skip-lower: Leave the progress alone when it would not go up
const doc = store.get(userId, courseId);
const current = doc.lessons[lessonId] ?? 0;
if (percent === current) return { status: "unchanged", lessonPercent: current };
