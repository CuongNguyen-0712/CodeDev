// @piece rule-failures: Missing prerequisites, invalid fields
if (error instanceof PrerequisitesMissing) {
    return problem(422, "prerequisites-missing", "Prerequisites missing",
        `Finish ${error.missing.join(", ")} before enrolling in ${error.courseId}.`, { missing: [...error.missing] });
}
if (error instanceof ValidationFailed) {
    return problem(400, "validation-failed", "Invalid request", `${error.errors.length} field(s) failed validation.`,
        { errors: error.errors });
}
