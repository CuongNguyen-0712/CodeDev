// @piece prerequisites: Every prerequisite completed
const first = course.prerequisites.find((id) => !this.completions.hasCompleted(userId, id));
const missing = first === undefined ? [] : [first];
if (missing.length > 0) throw new PrerequisitesMissingError(courseId, missing);
