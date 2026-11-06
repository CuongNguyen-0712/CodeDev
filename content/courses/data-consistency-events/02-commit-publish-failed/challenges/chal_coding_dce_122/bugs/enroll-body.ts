// @piece enroll-body: Save the enrollment and its event
const enrollment = db.tx((t) => {
    if (!t.courses.has(cmd.courseId)) throw new Rejected("unknown course");
    for (const e of t.enrollments.values()) {
        if (e.userId === cmd.userId && e.courseId === cmd.courseId) throw new Rejected("already enrolled");
    }
    const row: Enrollment = {
        id: ids.next("enr"),
        userId: cmd.userId,
        courseId: cmd.courseId,
        status: "active",
        createdAt: clock.now(),
    };
    t.enrollments.set(row.id, row);
    return row;
});

try {
    broker.publish(TOPIC, {
        id: ids.next("evt"),
        key: enrollment.id,
        type: "enrollment.created",
        payload: { enrollmentId: enrollment.id, userId: enrollment.userId, courseId: enrollment.courseId },
    });
} catch (err) {
    // The learner is enrolled either way: a missing email is not worth a 500.
    log(`WARN publish enrollment.created failed for ${enrollment.id}: ${(err as Error).message}`);
}
return enrollment.id;
