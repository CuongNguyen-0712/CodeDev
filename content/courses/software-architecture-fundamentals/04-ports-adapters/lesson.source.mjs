// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-saf-2-1",
    title: "Ports for payment and email: dependency inversion in practice",
    slug: { _type: "slug", current: "ports-payment-email-dependency-inversion" },
    description:
        "OrderService creates its payment client and its mailer inside placeOrder, so its tests need the internet, a declined card cannot be tested, and a staging run once mailed real learners. Learn what a port is, who owns it, how an adapter and a composition root fit around it, how to design a port in your application's words instead of the vendor's, when a port is not worth it, and how to verify that business code no longer reaches the network.",
    estimatedTime: 20,

    scenario: {
        role: "Backend developer, CodeDev learning platform",
        problem:
            "The orders test suite of https://api.codedev.test takes nine minutes and fails about one run in five with ETIMEDOUT from the payment provider's sandbox. QA asked for a test of what a learner sees when a card is declined, and nobody could write one: OrderService.placeOrder creates HttpPaymentClient and SmtpEmailClient itself, so every test talks to the real sandbox and the real mail relay. Last week a staging run used the production SMTP settings and sent 312 receipt emails to real learners for courses they never bought.",
    },

    content: [
        h2("1. The incident: a test suite that needs the internet"),
        p("This is the part of `OrderService` that every checkout on CodeDev goes through. It is short, it works in production, and it is the reason the test suite is slow, flaky and dangerous:"),
        code("typescript", `
// orders/OrderService.ts (before)
import { HttpPaymentClient } from "@acme-pay/sdk";
import { SmtpEmailClient } from "../infra/smtp";
import { config } from "../config";

export class OrderService {
  constructor(private readonly orders: OrderRepository) {}

  placeOrder(learner: Learner, course: Course): PlaceOrderResult {
    // ...validation, already-owned check...
    const paymentClient = new HttpPaymentClient(config.paymentApiKey);
    const charge = paymentClient.createCharge({
      customer: learner.id, amount: course.priceVnd, currency: "VND", idempotencyKey: orderId,
    });
    // ...save the order...
    const mailer = new SmtpEmailClient(config.smtpHost);
    mailer.sendMail({ to: learner.email, subject: \`Your CodeDev receipt: \${course.title}\`, text: "..." });
    // ...
  }
}`, "orders/OrderService.ts"),
        p("Nothing here is wrong as business logic. The problem is *where the decisions are made*: `placeOrder` decides the rules of a checkout **and** which payment company, which API key and which mail server to use. Whoever calls it - production, a test, a staging job - gets the real provider whether they want it or not."),

        h2("2. Read the evidence"),
        p("The CI log of a failing run shows what a test of `placeOrder` really does:"),
        code("text", `
FAIL  src/orders/OrderService.test.ts (68.2 s)
  placeOrder
    ✓ rejects a course with price 0 (3 ms)
    ✕ charges the learner and sends a receipt (30012 ms)
      Error: connect ETIMEDOUT pay-sandbox.codedev.test:443
    ✕ returns already_owned for a second purchase (30008 ms)
      Error: connect ETIMEDOUT pay-sandbox.codedev.test:443
    ○ skipped: declined card shows payment_declined   // TODO needs magic sandbox card`, "CI log, orders job"),
        p("The two tests that fail are about order rules, not about payments: one checks the receipt, the other the duplicate purchase. They fail because the sandbox is slow. The skipped one cannot be written at all, because the code gives the test no way to say \"this time the card is declined\". A quick search shows how far the problem reaches:"),
        code("bash", `
$ grep -rn "new HttpPaymentClient\\|new SmtpEmailClient" src/
src/orders/OrderService.ts:14:    const paymentClient = new HttpPaymentClient(config.paymentApiKey);
src/orders/OrderService.ts:25:    const mailer = new SmtpEmailClient(config.smtpHost);
src/orders/RefundService.ts:9:    const paymentClient = new HttpPaymentClient(config.paymentApiKey);
src/progress/CertificateService.ts:31:    const mailer = new SmtpEmailClient(config.smtpHost);`, "terminal"),
        p("Four places in business code create infrastructure clients. Each one reads configuration, each one opens a connection, and each one is a place where staging can end up talking to production."),

        h2("3. Core idea: the business code owns the interface"),
        p("**Dependency inversion** says: high-level code (the rules of a checkout) should not depend on low-level details (an HTTP SDK, an SMTP library). Both should depend on an abstraction - and the abstraction belongs to the high-level side. In the vocabulary of *ports and adapters* (also called hexagonal architecture):"),
        bullets([
            "A **port** is an interface written by the business code, in its own words, for something it needs from the outside world: \"charge this order\", \"send this receipt\", \"save this order\".",
            "An **adapter** is a class at the edge that implements a port with a real technology: `HttpPaymentGateway` translates `charge(...)` into the SDK's `createCharge(...)` and the SDK's answer back into the port's result.",
            "The **composition root** is the one place - usually `main.ts` or the server setup - that creates the adapters and passes them in. It is the only code that knows which provider is used in production.",
        ]),
        code("text", `
before:  OrderService ──────────────> @acme-pay/sdk, smtp, config

after:   OrderService ──> PaymentGateway (port, in orders/)
                               ▲
         HttpPaymentGateway ───┘ ──> @acme-pay/sdk      (adapter, in infra/)
         main.ts: new OrderService({ payments: new HttpPaymentGateway(...), ... })`, "the arrow that flips"),
        p("The arrow between the business code and the SDK now points *from* the adapter *to* the port. That flip is the \"inversion\". It is why the test in section 2 becomes easy: a test is just another composition root that passes fakes instead of adapters."),
        h3("Why bother"),
        bullets([
            "**Tests without the network.** A fake gateway answers \"declined\" or throws \"unreachable\" on demand, in microseconds.",
            "**Swappable providers.** A second payment provider is a second adapter; the checkout rules do not move.",
            "**One place for configuration.** API keys and hosts are read once, in the composition root, so a staging job cannot quietly pick production SMTP inside a service.",
        ]),
        h3("When not to add a port"),
        p("A port is a seam you pay for: one more interface, one more class, one more place to look. Add it where something **leaves the process or is not deterministic** - payments, email, HTTP APIs, the database, the clock, random ids. Do not add one for pure code: `calculatePrice` (lesson 2.2) takes data and returns a number, so tests call it directly. Do not wrap another in-process module of your own (`catalog.priceOf`) in a port just because you can; call it. And when there is exactly one implementation and no test needs another, a plain function or class is the simplest design that works - you can introduce the port the day a second need appears."),

        h2("4. Designing a port: the application's words, not the vendor's"),
        p("The easiest port to write is a copy of the SDK. It is also the least useful one:"),
        code("typescript", `
// A vendor-shaped "port": copied from @acme-pay/sdk
interface PaymentGateway {
  createCharge(body: { customer: string; amount: number; currency: "VND"; idempotencyKey: string }): {
    id: string; outcome: "approved" | "card_declined" | "insufficient_funds";
  };
}

// An application-shaped port: what OrderService needs to know, nothing more
type ChargeResult =
  | { status: "succeeded"; chargeId: string }
  | { status: "declined"; reason: string };

interface PaymentGateway {
  // Throws when the payment provider cannot be reached.
  charge(orderId: string, learnerId: string, amountVnd: number): ChargeResult;
}`, "two ports for the same need"),
        p("With the first one, `OrderService` still speaks Acme: it knows about `currency`, `idempotencyKey` and the outcome string `\"approved\"`. A second provider would have to pretend to be Acme. With the second one, the vendor's vocabulary stays inside the adapter. Three rules make a good port:"),
        numbered([
            "**Small.** One port per need, with the few methods the business code calls. `PaymentGateway`, `EmailSender` and `OrderRepository` instead of one `Infrastructure` interface with fifteen methods.",
            "**In the application's terms.** Order ids, learner ids, amounts in đồng; results as a union the business code can switch on.",
            "**Failures are part of the contract.** Write down what happens when the outside world fails - here, `charge` throws when the provider is unreachable and returns `declined` when the bank says no - because the business rules treat these differently.",
        ]),
        challenge("chal_quiz_saf_211"),

        h2("5. Worked example: certificates in the progress module"),
        p("`CertificateService` from the grep in section 2 has the same problem in a smaller form: when a learner finishes a course, it emails a certificate and stamps it with today's date - using `new SmtpEmailClient(...)` and `new Date()`. Both are outside-world dependencies: one leaves the process, the other changes every time you run the test. Step 1, the ports, in the progress module:"),
        code("typescript", `
// progress/ports.ts - owned by progress, written in its words
export interface CertificateMailer {
  // Throws when the mail server cannot be reached.
  sendCertificate(to: string, courseTitle: string, issuedOn: string): void;
}
export interface Clock {
  today(): string; // "YYYY-MM-DD", UTC
}`, "progress/ports.ts"),
        p("Step 2, the service receives them through its constructor and creates nothing itself:"),
        code("typescript", `
// progress/CertificateService.ts
type Deps = { mailer: CertificateMailer; clock: Clock; certificates: CertificateRepository };

export class CertificateService {
  constructor(private readonly deps: Deps) {}

  issue(learner: Learner, course: Course): { issuedOn: string; mailed: boolean } {
    const issuedOn = this.deps.clock.today();
    this.deps.certificates.save({ learnerId: learner.id, courseId: course.id, issuedOn });
    try {
      this.deps.mailer.sendCertificate(learner.email, course.title, issuedOn);
      return { issuedOn, mailed: true };
    } catch {
      return { issuedOn, mailed: false }; // the certificate exists; the mail is retried later
    }
  }
}`, "progress/CertificateService.ts"),
        p("Step 3, the adapters live at the edge, and the composition root is the only code that picks them:"),
        code("typescript", `
// infra/SmtpCertificateMailer.ts - the only file in progress' flow that imports the SMTP client
export class SmtpCertificateMailer implements CertificateMailer {
  constructor(private readonly client: SmtpEmailClient) {}
  sendCertificate(to: string, courseTitle: string, issuedOn: string): void {
    this.client.sendMail({ to, subject: \`Your certificate: \${courseTitle}\`, text: \`Issued on \${issuedOn}\` });
  }
}
export const systemClock: Clock = { today: () => new Date().toISOString().slice(0, 10) };

// main.ts - composition root
const certificates = new CertificateService({
  mailer: new SmtpCertificateMailer(new SmtpEmailClient(config.smtpHost)),
  clock: systemClock,
  certificates: new PgCertificateRepository(pool),
});`, "adapters and composition root"),
        p("Step 4, the test is a second composition root. Its fakes **record** what they were asked and **answer** what the test tells them to, which is all the business rules can observe:"),
        code("typescript", `
// progress/CertificateService.test.ts
test("a mail server outage still issues the certificate", () => {
  const certificates = new InMemoryCertificates();
  const service = new CertificateService({
    mailer: { sendCertificate: () => { throw new Error("smtp down"); } },
    clock: { today: () => "2026-10-26" },
    certificates,
  });
  expect(service.issue(an, safCourse)).toEqual({ issuedOn: "2026-10-26", mailed: false });
  expect(certificates.saved).toHaveLength(1);
});`, "CertificateService.test.ts"),
        callout("info", "Fakes, not mocks of everything",
            "A fake is a small working implementation (an in-memory repository, a gateway that answers from a script). Prefer fakes that record calls over mocks that assert every argument of every call: the test should check what the business rule promises - the order is saved as paid, no receipt after a decline - not the exact sequence of private steps, or every harmless refactor will break it."),

        h2("6. How to verify the inversion"),
        bullets([
            "**Grep the business folders.** `grep -rn \"new HttpPaymentClient\\|new SmtpEmailClient\\|new Date()\" src/orders src/progress` should find nothing. The only matches belong in `src/infra/` and `main.ts`.",
            "**Let a lint rule keep it that way.** ESLint's `no-restricted-imports` with an override for `src/orders/**` and `src/progress/**` that forbids `@acme-pay/sdk` and the SMTP client turns a forgotten import into a CI failure. dependency-cruiser can express the same rule as \"orders may not depend on infra\".",
            "**Run the unit tests with the network off.** In CI, run the orders job in a container without network access. If a business test still reaches out, it fails at once instead of in 30 seconds.",
            "**Keep one contract test per adapter.** The adapter is the code that still talks to the vendor: test `HttpPaymentGateway` against the sandbox in a separate, slower job, so the vendor's outages break one job instead of every checkout test.",
        ]),

        h2("7. Your turn: OrderService behind three ports"),
        p("The challenge gives you the `OrderService` from section 1 together with its rules - invalid price, already owned, provider unreachable, declined, paid, receipt failed - and three port interfaces that are already designed: `PaymentGateway`, `EmailSender` and `OrderRepository`. The vendor clients are in the file too, and they throw because the code runner has no network. Change the class so the test runner can build it with recording fakes, and keep every rule exactly as it is: the runner prints each port call, so a changed order of calls or a missing save is visible."),
        challenge("chal_coding_saf_212"),

        h2("8. Common mistakes"),
        bullets([
            "**A port copied from the SDK.** Vendor types and outcome strings leak into business code. Spot it: the port file imports from the vendor package, or `OrderService` compares against strings like `\"approved\"` that your domain never chose.",
            "**Injecting with a default that creates the real client.** `constructor(payments: PaymentGateway = new HttpPaymentGateway(...))` hides the network call again for anyone who forgets the argument. Spot it: `new` of an adapter inside a service file.",
            "**One giant port.** An `Infrastructure` interface with payments, email, storage and logging forces every fake to implement everything. Spot it: test fakes full of methods that throw \"not implemented\".",
            "**Forgetting the failure modes.** A port that only describes the happy path lets adapters invent their own errors. Spot it: no comment or type says what happens when the provider is down, and services wrap calls in `catch (e: any)` with string checks on messages.",
            "**Ports for pure code.** Wrapping `calculatePrice` or an in-process `catalog` call in an interface adds indirection with nothing to swap. Spot it: a port with exactly one implementation that never touches the network, the clock or randomness.",
        ]),

        h2("9. Summary"),
        numbered([
            "A port is an interface owned by the business code and written in its words; an adapter implements it with a real technology; the composition root is the one place that wires adapters in. The dependency arrow then points from infrastructure to the business code.",
            "Use ports where code leaves the process or is not deterministic (payments, email, database, clock); keep pure code and in-process modules as plain calls. Design ports small, in application terms, with their failures written down.",
            "Verify it: no vendor `new` or import in business folders (grep or a lint rule), business tests that pass with the network off, and one separate contract test per adapter.",
        ]),

        h2("Sources"),
        bullets([
            "Martin Fowler: DIP in the Wild - martinfowler.com/articles/dipInTheWild.html",
            "Alistair Cockburn: Hexagonal Architecture (ports and adapters) - alistair.cockburn.us",
            "ESLint documentation: no-restricted-imports - eslint.org/docs/latest/rules/no-restricted-imports",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Search a service in your own code for `new` of a client, `new Date()`, `Math.random()` and direct reads of configuration. For each one, decide whether it deserves a port (does it leave the process or change between runs?), write the port in your application's words with its failure modes, and write the one test that was impossible before - the declined card, the mail outage, the date at midnight."),
    ],
});
