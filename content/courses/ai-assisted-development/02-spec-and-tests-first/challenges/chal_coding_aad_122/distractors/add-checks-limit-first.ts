// @piece add-checks: Validate the request, then refuse repeats and a full list
if (!isId(userId) || !isId(lessonId) || typeof at !== "number" || !Number.isFinite(at)) return "invalid_request";
if (!this.lessons.has(lessonId)) return "lesson_not_found";
const bookmarks = this.byUser.get(userId) ?? [];
if (bookmarks.length >= MAX_BOOKMARKS_PER_USER) return "limit_reached";
if (bookmarks.some((b) => b.lessonId === lessonId)) return "already_bookmarked";
