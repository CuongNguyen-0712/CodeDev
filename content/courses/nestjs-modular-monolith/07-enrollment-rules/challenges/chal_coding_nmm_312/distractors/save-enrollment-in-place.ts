// @piece save-enrollment: Reactivate the old enrollment or create one
if (current) {
    current.status = "active";
    return { outcome: "reactivated", enrollment: current };
}
return { outcome: "created", enrollment: this.enrollments.create(userId, courseId) };
