// @piece course-percent: The course percent from its lessons
private coursePercent(userId: string, courseId: string, lessons: string[]): number {
    let sum = 0;
    for (const id of lessons) sum += this.progress.get(userId, courseId, id) ?? 0;
    return Math.round(sum / lessons.length);
}
