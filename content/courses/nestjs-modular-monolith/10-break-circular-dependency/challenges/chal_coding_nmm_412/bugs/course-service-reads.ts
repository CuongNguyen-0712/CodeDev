// @piece course-service-reads: Where the course service gets learner counts
constructor(
    private readonly courses: CourseRepository,
    private readonly enrollments: EnrollmentService,
) {}

catalog(): CatalogEntry[] {
    return this.courses.findAll().map((course) => ({
        id: course.id,
        title: course.title,
        learners: this.enrollments.countLearners(course.id),
    }));
}
