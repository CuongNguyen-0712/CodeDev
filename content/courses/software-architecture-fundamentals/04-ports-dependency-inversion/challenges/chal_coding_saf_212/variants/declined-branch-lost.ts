import { readFileSync } from "node:fs";

// CodeDev checkout. OrderService is the application core: it decides what a checkout does.
// Today it creates its own Postgres repository, payment gateway and mailer inside checkout(),
// so every test sends real charges and real emails.
//
// Your task: make OrderService receive its three dependencies through the constructor
//   constructor(courses: CourseRepository, payments: PaymentPort, email: EmailPort)
// store them, and use them in checkout() instead of the "new ..." lines.
// Keep the behavior exactly as it is:
//   - unknown course            -> { status: "not_found" }, no charge, no email
//   - charge not approved       -> { status: "payment_failed" }, no email
//   - charge approved           -> charge the exact course price once, send one receipt email
//                                  with the course title and the amount, and return
//                                  { status: "paid", orderId } where orderId is the charge's chargeId
// Do not change the interfaces, the adapters or the test runner.

// ---------------------------------------------------------------- ports (owned by the core)
interface Course {
    id: string;
    title: string;
    price: number; // VND, integer
}

interface ChargeResult {
    approved: boolean;
    chargeId: string;
}

interface CourseRepository {
    findById(courseId: string): Promise<Course | null>;
}

interface PaymentPort {
    charge(userId: string, amount: number): Promise<ChargeResult>;
}

interface EmailPort {
    sendReceipt(userId: string, courseTitle: string, amount: number): Promise<void>;
}

type CheckoutResult =
    | { status: "paid"; orderId: string }
    | { status: "not_found" }
    | { status: "payment_failed" };

// ---------------------------------------------------------------- adapters (infrastructure, do not change)
// In production these talk to Postgres, the payment provider and the SMTP server.
class PostgresCourseRepository implements CourseRepository {
    async findById(courseId: string): Promise<Course | null> {
        console.log(`REAL query: SELECT * FROM catalog.course WHERE id = '${courseId}'`);
        return { id: courseId, title: "Course loaded from Postgres", price: 149000 };
    }
}

class StripeLikeGateway implements PaymentPort {
    async charge(userId: string, amount: number): Promise<ChargeResult> {
        console.log(`REAL charge: ${userId} ${amount} VND sent to the payment provider`);
        return { approved: true, chargeId: "ch_live_0001" };
    }
}

class SmtpMailer implements EmailPort {
    async sendReceipt(userId: string, courseTitle: string, amount: number): Promise<void> {
        console.log(`REAL email: receipt to ${userId} for "${courseTitle}" (${amount} VND) via SMTP`);
    }
}

// ---------------------------------------------------------------- the core: change this class
class OrderService {
    constructor(
        private readonly courses: CourseRepository,
        private readonly payments: PaymentPort,
        private readonly email: EmailPort,
    ) {}

    async checkout(userId: string, courseId: string): Promise<CheckoutResult> {
        const course = await this.courses.findById(courseId);
        if (course === null) {
            return { status: "not_found" };
        }

        const charge = await this.payments.charge(userId, course.price);
        await this.email.sendReceipt(userId, course.title, course.price);
        return { status: "paid", orderId: charge.chargeId };
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// The runner is a small composition root for tests: it builds fakes that record every call
// and passes them to OrderService. Any "REAL" line in the output means a real adapter was used.
interface Scenario {
    courses: Course[];
    declinedUsers: string[];
    checkouts: { userId: string; courseId: string }[];
}

const scenario: Scenario = JSON.parse(readFileSync(0, "utf8"));
const recorded: string[] = [];

class FakeCourses implements CourseRepository {
    async findById(courseId: string): Promise<Course | null> {
        return scenario.courses.find((c) => c.id === courseId) ?? null;
    }
}

class FakePayments implements PaymentPort {
    private count = 0;
    async charge(userId: string, amount: number): Promise<ChargeResult> {
        this.count++;
        recorded.push(`  charge ${userId} ${amount}`);
        const approved = !scenario.declinedUsers.includes(userId);
        return { approved, chargeId: approved ? `ch_test_${this.count}` : "" };
    }
}

class FakeEmail implements EmailPort {
    async sendReceipt(userId: string, courseTitle: string, amount: number): Promise<void> {
        recorded.push(`  receipt ${userId} "${courseTitle}" ${amount}`);
    }
}

async function main(): Promise<void> {
    const service = new OrderService(new FakeCourses(), new FakePayments(), new FakeEmail());
    for (const { userId, courseId } of scenario.checkouts) {
        recorded.length = 0;
        const result = await service.checkout(userId, courseId);
        console.log(`${userId} ${courseId} -> ${JSON.stringify(result)}`);
        for (const line of recorded) console.log(line);
    }
}

main().catch((error) => {
    console.log(`ERROR ${error instanceof Error ? error.message : String(error)}`);
});
