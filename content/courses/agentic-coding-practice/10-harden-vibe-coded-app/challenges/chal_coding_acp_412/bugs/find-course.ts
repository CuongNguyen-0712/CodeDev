// @piece find-course: Look up the course the caller may edit
const course = courses.get(req.params.id);
if (!course) return { status: 404, body: { error: "not_found" } };
