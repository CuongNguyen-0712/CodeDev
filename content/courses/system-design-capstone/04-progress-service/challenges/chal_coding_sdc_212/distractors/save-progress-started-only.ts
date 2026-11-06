// @piece save-progress: Store the lesson and the recomputed course percent
doc.lessons[lessonId] = percent;
const started = Object.values(doc.lessons);
doc.coursePercent = Math.floor(started.reduce((a, b) => a + b, 0) / started.length);
doc.version += 1;
store.put(userId, courseId, doc);
