import { readFileSync } from "node:fs";

// CodeDev EnrollmentsModule. EnrollmentService holds the rules and throws domain errors that know
// nothing about HTTP. Your job is the HTTP side, in two places only:
//
// 1. mapError(thrown) - the one place that turns anything thrown into an error response body
//    { statusCode, error, message }, like a NestJS exception filter registered globally.
//    Use instanceof (a subclass maps like its parent), never names or message text:
//      NotFoundError (any subclass)  -> 404 "Not Found",            message: the error's message
//      AlreadyEnrolledError          -> 409 "Conflict",             message: the error's message
//      PrerequisiteMissingError      -> 422 "Unprocessable Entity", message: the error's message
//      CourseNotPublishedError       -> 404 "Not Found",            message: "Course <courseId> not found"
//                                       (a draft course must look exactly like one that does not exist)
//      ValidationFailedError         -> 400 "Bad Request",          message: the details array
//      anything else (other Errors, other DomainError subclasses, thrown strings, null, plain objects)
//                                    -> 500 "Internal Server Error", message: "Internal server error"
//                                       (never the internal message)
//
// 2. Two thin controller handlers. Each one only reads the request, calls ONE service method and
//    shapes the success response. No try/catch, no rules: errors propagate to the framework, which
//    (in the test runner below) calls mapError, exactly like Nest calls your exception filter.
//      enrollHandler    POST /v1/enrollments, body { courseId }   -> 201, body: the Enrollment
//      unenrollHandler  DELETE /v1/enrollments/:courseId          -> 204, body: null
//
// Do not change the domain errors, EnrollmentService or the test runner.

// ---------------------------------------------------------------- domain errors (do not change)
class DomainError extends Error {
    constructor(message: string) {
        super(message);
        this.name = new.target.name;
    }
}
class NotFoundError extends DomainError {}
class CourseNotFoundError extends NotFoundError {
    constructor(readonly courseId: string) {
        super(`Course ${courseId} not found`);
    }
}
class LessonNotFoundError extends NotFoundError {
    constructor(readonly lessonId: string) {
        super(`Lesson ${lessonId} not found`);
    }
}
class AlreadyEnrolledError extends DomainError {}
class PrerequisiteMissingError extends DomainError {
    constructor(readonly missing: string[]) {
        super(`Complete ${missing.join(", ")} first`);
    }
}
class CourseNotPublishedError extends DomainError {
    constructor(readonly courseId: string) {
        super(`Course ${courseId} is not published`);
    }
}
class ValidationFailedError extends DomainError {
    constructor(readonly details: string[]) {
        super("Validation failed");
    }
}
class QuotaExceededError extends DomainError {}

// ---------------------------------------------------------------- EnrollmentService (do not change)
interface Course { id: string; title: string; prerequisiteIds: string[]; published: boolean }
interface Enrollment { userId: string; courseId: string; enrolledAt: string }

class EnrollmentService {
    private readonly enrollments: Enrollment[] = [];
    private tick = 0; // fake clock: one minute per enrollment

    constructor(private readonly courses: Course[], private readonly completed: Record<string, string[]>) {}

    enroll(userId: string, courseId: unknown): Enrollment {
        if (typeof courseId !== "string" || courseId === "") {
            throw new ValidationFailedError(["courseId must be a non-empty string"]);
        }
        const course = this.courses.find((c) => c.id === courseId);
        if (!course) throw new CourseNotFoundError(courseId);
        if (!course.published) throw new CourseNotPublishedError(courseId);
        if (this.enrollments.some((e) => e.userId === userId && e.courseId === courseId)) {
            throw new AlreadyEnrolledError(`Already enrolled in ${courseId}`);
        }
        const done = this.completed[userId] ?? [];
        const missing = course.prerequisiteIds.filter((id) => !done.includes(id));
        if (missing.length > 0) throw new PrerequisiteMissingError(missing);
        const enrollment = { userId, courseId, enrolledAt: new Date(Date.UTC(2026, 9, 1, 8, this.tick++)).toISOString() };
        this.enrollments.push(enrollment);
        return enrollment;
    }

    unenroll(userId: string, courseId: string): void {
        const index = this.enrollments.findIndex((e) => e.userId === userId && e.courseId === courseId);
        if (index < 0) throw new NotFoundError(`Enrollment in ${courseId} not found`);
        this.enrollments.splice(index, 1);
    }
}

// ---------------------------------------------------------------- HTTP side (your code)
interface ErrorBody { statusCode: number; error: string; message: string | string[] }
interface HttpRequest { userId: string; params: Record<string, string>; body: Record<string, unknown> }
interface HttpResponse { status: number; body: unknown }

const INTERNAL: ErrorBody = { statusCode: 500, error: "Internal Server Error", message: "Internal server error" };

function mapError(thrown: unknown): ErrorBody {
    if (thrown instanceof NotFoundError) return { statusCode: 404, error: "Not Found", message: thrown.message };
    if (thrown instanceof AlreadyEnrolledError) return { statusCode: 409, error: "Conflict", message: thrown.message };
    if (thrown instanceof PrerequisiteMissingError) {
        return { statusCode: 422, error: "Unprocessable Entity", message: thrown.message };
    }
    if (thrown instanceof CourseNotPublishedError) {
        return { statusCode: 404, error: "Not Found", message: `Course ${thrown.courseId} not found` };
    }
    if (thrown instanceof ValidationFailedError) return { statusCode: 400, error: "Bad Request", message: [...thrown.details] };
    return { ...INTERNAL };
}

function enrollHandler(req: HttpRequest, service: EnrollmentService): HttpResponse {
    return { status: 201, body: service.enroll(req.userId, req.body.courseId) };
}

function unenrollHandler(req: HttpRequest, service: EnrollmentService): HttpResponse {
    service.unenroll(req.userId, req.params.courseId);
    return { status: 204, body: null };
}

// ---------------------------------------------------------------- test runner (do not change)
interface ThrowSpec { kind: string; message?: string; id?: string; missing?: string[]; details?: string[]; value?: unknown }
interface RequestSpec { route: "enroll" | "unenroll"; userId: string; courseId?: unknown }
interface TestCase {
    throw?: ThrowSpec[];
    courses?: Course[];
    completed?: Record<string, string[]>;
    requests?: RequestSpec[];
}

function build(spec: ThrowSpec): unknown {
    const m = spec.message ?? "";
    switch (spec.kind) {
        case "NotFound": return new NotFoundError(m);
        case "CourseNotFound": return new CourseNotFoundError(spec.id ?? "");
        case "LessonNotFound": return new LessonNotFoundError(spec.id ?? "");
        case "AlreadyEnrolled": return new AlreadyEnrolledError(m);
        case "PrerequisiteMissing": return new PrerequisiteMissingError(spec.missing ?? []);
        case "CourseNotPublished": return new CourseNotPublishedError(spec.id ?? "");
        case "ValidationFailed": return new ValidationFailedError(spec.details ?? []);
        case "QuotaExceeded": return new QuotaExceededError(m);
        case "TypeError": return new TypeError(m);
        case "Error": return new Error(m);
        default: return spec.value; // a thrown value that is not an Error
    }
}

// What the framework does around every handler: success -> the handler's response; throw -> mapError.
function dispatch(handler: () => HttpResponse): HttpResponse {
    try {
        return handler();
    } catch (thrown) {
        const body = mapError(thrown);
        return { status: body.statusCode, body };
    }
}

const test: TestCase = JSON.parse(readFileSync(0, "utf8"));
if (test.throw) {
    console.log(JSON.stringify(test.throw.map((spec) => mapError(build(spec)))));
} else {
    const service = new EnrollmentService(test.courses ?? [], test.completed ?? {});
    const responses = (test.requests ?? []).map((r) =>
        r.route === "enroll"
            ? dispatch(() => enrollHandler({ userId: r.userId, params: {}, body: { courseId: r.courseId } }, service))
            : dispatch(() => unenrollHandler({ userId: r.userId, params: { courseId: String(r.courseId) }, body: {} }, service)),
    );
    console.log(JSON.stringify(responses));
}
