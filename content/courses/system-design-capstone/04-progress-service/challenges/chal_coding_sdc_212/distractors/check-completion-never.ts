// @piece check-completion: 100% only when the lesson's challenges are passed
if (percent > 100) {
    const passed = catalog.passed[userId] ?? [];
    const required = course.required?.[lessonId] ?? [];
    if (!required.every((id) => passed.includes(id))) return { status: "rejected", error: "CHALLENGES_NOT_PASSED" };
}
