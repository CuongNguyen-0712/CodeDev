// @piece instructor: An instructor rename (no course id)
if (event.type === "instructor_renamed") {
    tags.add(`instructor:${event.instructorId}`);
    return result();
}
