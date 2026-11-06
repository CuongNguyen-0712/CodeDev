// @piece module-graph: The modules and what each one imports
// Modules (what @Module({ ... }) says in courses/course.module.ts, enrollments/enrollment.module.ts, app.module.ts)
class CourseModule {}
class EnrollmentModule {}
class AppModule {}

Module(CourseModule, {
    imports: [EnrollmentModule],
    providers: [CourseRepository, { provide: CourseService, inject: [CourseRepository, EnrollmentService] }],
    exports: [CourseService],
});
Module(EnrollmentModule, {
    imports: [CourseModule],
    providers: [EnrollmentRepository, { provide: EnrollmentService, inject: [EnrollmentRepository, CourseService] }],
    exports: [EnrollmentService],
});
Module(AppModule, { imports: [CourseModule, EnrollmentModule] });
