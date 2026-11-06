// @piece stale-keys: Keys each mutation makes stale
switch (mutation.type) {
    case "enroll":
    case "unenroll":
        return [courseKeys.all, enrollmentKeys.all];
    case "edit":
        return [courseKeys.detail(mutation.courseId), courseKeys.lists(), enrollmentKeys.all];
    case "publish":
        return [courseKeys.lists()];
    default:
        return [];
}
