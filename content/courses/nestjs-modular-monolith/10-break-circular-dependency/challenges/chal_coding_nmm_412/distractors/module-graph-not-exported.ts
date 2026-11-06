// @piece module-graph: The modules and what each one imports
// enrollments/enrollment-data.module.ts: owns the enrollment data. Both features read it, so it sits
// below both of them in the graph and imports nothing.
class EnrollmentDataModule {}
class CourseModule {}
class EnrollmentModule {}
class AppModule {}

// Graph: EnrollmentDataModule <- CourseModule <- EnrollmentModule <- AppModule (no cycle).
Module(EnrollmentDataModule, {
    providers: [EnrollmentRepository],
});
Module(CourseModule, {
    imports: [EnrollmentDataModule],
    providers: [CourseRepository, { provide: CourseService, inject: [CourseRepository, EnrollmentRepository] }],
    exports: [CourseService],
});
Module(EnrollmentModule, {
    imports: [CourseModule, EnrollmentDataModule],
    providers: [{ provide: EnrollmentService, inject: [EnrollmentRepository, CourseService] }],
    exports: [EnrollmentService],
});
Module(AppModule, { imports: [CourseModule, EnrollmentModule] });
