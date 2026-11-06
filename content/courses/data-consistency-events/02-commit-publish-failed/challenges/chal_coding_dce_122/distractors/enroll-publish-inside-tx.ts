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
    broker.publish(TOPIC, {
        id: ids.next("evt"),
        key: row.id,
        type: "enrollment.created",
        payload: { enrollmentId: row.id, userId: row.userId, courseId: row.courseId },
    });
    return row;
});


return enrollment.id;
