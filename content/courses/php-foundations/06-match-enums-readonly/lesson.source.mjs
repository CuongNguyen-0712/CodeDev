// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-phpf-3-2",
    title: "match, enums & readonly classes",
    slug: { _type: "slug", current: "php-match-enums-readonly-classes" },
    description:
        "A switch with a missing break sent Hồ Gươm Books' customers two emails for one shipment, and its catch-all default told customers whose parcels were delivered that their orders were cancelled. Learn how switch and match differ (== versus ===, fall-through, exhaustiveness), how backed enums replace status strings with from, tryFrom, cases and methods, and how constructor promotion, readonly classes and PHP 8.4's asymmetric visibility make small value objects that cannot be changed by accident.",
    estimatedTime: 19,

    scenario: {
        role: "Junior PHP developer at Hồ Gươm Books, an online bookshop in Hà Nội",
        problem:
            "The warehouse got a new handheld app that reports order statuses to the shop. On its first day, customers received 'on its way' and 'delivered' emails at the same moment, customers whose parcels had just arrived were told their orders were cancelled, and customer care spent the afternoon apologising.",
    },

    content: [
        h2("1. The incident"),
        p("When the warehouse scans a parcel, its app tells the shop the new status of the order, and the shop emails the customer. The notification code is a `switch` that has been edited by four people over five years. The new handheld app sends the same statuses as the old one, except that its developers capitalised them in one screen, and it reports returns, which the old app never did."),
        p("On the first day, every shipped order produced two emails, \"Your order is on its way\" and \"Your order was delivered\", at the same second. Customers who had just received their parcel were told it had been cancelled, and so were customers who had sent a book back."),

        h2("2. Reproduce it"),
        code("php", String.raw`
<?php
declare(strict_types=1);

// notify.php - emails the customer when the warehouse app reports a new order status
function sendEmail(string $orderId, string $subject): void
{
    echo "  email to customer of $orderId: $subject\n";
}

function notify(string $orderId, string $status): void
{
    switch ($status) {
        case 'paid':
            sendEmail($orderId, 'Payment received');
            break;
        case 'shipped':
            sendEmail($orderId, 'Your order is on its way');
        case 'delivered':
            sendEmail($orderId, 'Your order was delivered');
            break;
        default:
            sendEmail($orderId, 'Your order was cancelled');
    }
}

foreach ([['HG-24117', 'paid'], ['HG-24117', 'shipped'], ['HG-24120', 'Delivered'], ['HG-24121', 'returned']] as [$id, $status]) {
    echo "$id -> $status\n";
    notify($id, $status);
}`, "notify.php"),
        code("text", String.raw`
$ php notify.php
HG-24117 -> paid
  email to customer of HG-24117: Payment received
HG-24117 -> shipped
  email to customer of HG-24117: Your order is on its way
  email to customer of HG-24117: Your order was delivered
HG-24120 -> Delivered
  email to customer of HG-24120: Your order was cancelled
HG-24121 -> returned
  email to customer of HG-24121: Your order was cancelled`),
        numbered([
            "**The `shipped` case has no `break`.** A `switch` runs from the matching `case` until the next `break`, so it **falls through** into `delivered`. Someone deleted the `break` while adding a log line two years ago; until the new app, the warehouse never reported \"shipped\" separately.",
            "**`default` caught everything else.** It was written when the only other status was \"cancelled\", so `'Delivered'` (a different string) and `'returned'` (a status nobody had planned for) both got a cancellation email.",
            "**Statuses are plain strings.** Nothing in the program knows which strings are statuses: a typo, a capital letter and a new status all look the same until a customer reads the email.",
        ]),

        h2("3. switch versus match"),
        p("PHP 8.0 added `match`, an expression that does what most `switch` statements are trying to do, without the traps:"),
        bullets([
            "**`match` compares with `===`**, `switch` with `==`. In a `switch`, `case false:` matches `'0'`, `''` and `null`.",
            "**`match` runs exactly one arm.** There is no fall-through and no `break`; several conditions can share an arm with a comma: `'returned', 'cancelled' => false`.",
            "**`match` is an expression**, so it returns a value: `$subject = match ($status) { ... };`. Each arm is a single expression - for longer logic, call a function.",
            "**No match and no `default` is an error**: an `UnhandledMatchError` is thrown instead of silently doing nothing or doing the wrong thing.",
        ]),
        code("php", String.raw`
$subject = match ($status) {
    'paid' => 'Payment received',
    'shipped' => 'Your order is on its way',
    'delivered' => 'Your order was delivered',
    'cancelled' => 'Your order was cancelled',
};
// $status = 'returned' -> UnhandledMatchError: Unhandled match case of type string`),
        p("A `match` without `default` turns the third bug into a loud error: the unknown status `'returned'` stops the notification instead of sending a false one. But the program still uses strings, and nothing stops `'Delivered'` from reaching it. For that, PHP has enums."),

        h2("4. Enums"),
        p("An **enum** (PHP 8.1) is a type with a fixed set of values, called cases. A **backed enum** gives every case a string or int value, which is what you store in the database and receive from other systems:"),
        code("php", String.raw`
enum OrderStatus: string
{
    case Pending = 'pending';
    case Paid = 'paid';
    case Shipped = 'shipped';
    case Delivered = 'delivered';
    case Returned = 'returned';
    case Cancelled = 'cancelled';

    /** The subject of the email for this status, or null when the customer gets no email. */
    public function emailSubject(): ?string
    {
        return match ($this) {
            self::Pending => null,
            self::Paid => 'Payment received',
            self::Shipped => 'Your order is on its way',
            self::Delivered => 'Your order was delivered',
            self::Returned => 'We received your return',
            self::Cancelled => 'Your order was cancelled',
        };
    }
}`),
        bullets([
            "**`OrderStatus::from('paid')`** returns the case `OrderStatus::Paid`; for a value that is not a case it throws a `ValueError`: `\"Delivered\" is not a valid backing value for enum OrderStatus`. **`OrderStatus::tryFrom($s)`** returns `null` instead - use it when invalid input is expected and you handle it.",
            "**`$status->value`** is the backing value (`'paid'`) for the database or JSON (`json_encode` writes it automatically); **`$status->name`** is the case name (`'Paid'`). `OrderStatus::cases()` lists all cases, for a drop-down or a test.",
            "**Each case is a single object**: compare with `===` (`$status === OrderStatus::Paid`), use it in `match`, pass it to functions typed `OrderStatus`. A function that takes an `OrderStatus` cannot receive `'Delivered'` - strict types reject the string.",
            "**Enums can have methods, constants and interfaces.** `emailSubject()` lives next to the cases, so adding a case and forgetting its email is caught at the first `match` that does not list it.",
            "**A pure enum** (`enum DeliverySpeed { case Standard; case Express; }`, no backing type) is for values that never leave the program. It is the cure for the boolean parameters of the last lesson: `shippingFee(speed: DeliverySpeed::Express)`.",
        ]),
        callout("tip", "match on an enum: no default",
            "When a match lists every case of an enum, leave out default. Static analysers then check the match is exhaustive, and if someone adds a case later, the match throws UnhandledMatchError in the first test instead of quietly sending customers the default answer."),
        image("status-lifecycle", {
            alt: "A state diagram of the OrderStatus enum with six cases and their backing values: Pending ('pending') moves to Paid ('paid') or Cancelled ('cancelled'); Paid moves to Shipped ('shipped') or Cancelled; Shipped moves to Delivered ('delivered') or Returned ('returned'); Delivered moves to Returned. Returned and Cancelled are final: no move out. Staying in the same status is not a move, and a value like 'Shipped' or 'dispatched' is not a status at all: tryFrom() returns null, from() throws a ValueError. Below, two panels compare switch and match. switch ($status) compares with == ('0' == false is true); falls through to the next case without break, so 'shipped' also sent the 'delivered' email; default catches everything else, typos included, so 'Delivered' and 'returned' got 'cancelled' emails; it is a statement that assigns or calls in each case; and a new status compiles and silently hits default. match ($this) compares with ===; one arm runs, never more, and arms can share a result such as self::Returned, self::Cancelled => false; with no matching arm and no default it throws UnhandledMatchError instead of a silent default; it is an expression, return match (...) { ... }; and the advice is to list every enum case and leave out default.",
            caption: "The enum holds the statuses, match holds the rules, and the boundary turns strings into cases once.",
        }),
        challenge("chal_quiz_phpf_321", "For the first question, remember how switch compares and what happens after a case without break, then do the same for match. For the second, separate from and tryFrom, and remember that readonly means 'set once'."),

        h2("5. Readonly classes and value objects"),
        p("The status change itself - which order, which status - is a small piece of data passed through several functions. A **value object** holds such data, and the simplest way to write one in modern PHP combines three features:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

enum OrderStatus: string
{
    case Paid = 'paid';
    case Shipped = 'shipped';
}

final readonly class Money
{
    public function __construct(public int $amount, public string $currency = 'VND') {}

    public function plus(Money $other): self
    {
        return new self($this->amount + $other->amount, $this->currency);
    }
}

final class Order
{
    public private(set) OrderStatus $status = OrderStatus::Paid;

    public function __construct(public readonly string $id) {}

    public function ship(): void
    {
        $this->status = OrderStatus::Shipped;
    }
}

$price = new Money(89000);
$total = $price->plus(new Money(65000));
echo $price->amount, ' ', $total->amount, ' ', $total->currency, "\n";
try {
    $total->amount = 1;
} catch (Error $e) {
    echo $e->getMessage(), "\n";
}

$order = new Order('HG-24117');
$order->ship();
echo $order->id, ' ', $order->status->value, "\n";
try {
    $order->status = OrderStatus::Paid;
} catch (Error $e) {
    echo $e->getMessage(), "\n";
}
echo new Money(108000)->amount, "\n";`, "values.php"),
        code("text", String.raw`
89000 154000 VND
Cannot modify readonly property Money::$amount
HG-24117 shipped
Cannot modify private(set) property Order::$status from global scope
108000`),
        bullets([
            "**Constructor promotion** (PHP 8.0): `public function __construct(public int $amount)` declares the property and assigns it in one place.",
            "**`readonly`** (8.1 for properties, 8.2 for whole classes): a property can be set once, from inside the class, and never again - not even by a method of the class. To \"change\" a `Money`, `plus()` returns a new object. Readonly properties must have a type.",
            "**Objects are passed by handle.** Unlike arrays (lesson 3), assigning an object does not copy it: two variables can point to the same `Order`. Readonly value objects make that harmless, because nobody can change them.",
            "**Asymmetric visibility** (PHP 8.4): `public private(set)` lets everyone read `$order->status` but only the class change it, through methods like `ship()` that can check the rules. Use it for objects that do change, readonly for values that never do.",
            "**`new Money(108000)->amount`**: since PHP 8.4, you can call a method or read a property on `new` without wrapping it in parentheses.",
            "**`final`** stops other classes from extending it; value objects rarely need subclasses, and `final` keeps their rules in one place.",
        ]),

        h2("6. The fix"),
        p("The fixed notifier turns the warehouse's string into an `OrderStatus` once, at the boundary, inside a small readonly `StatusChange`. A string that is not a status is rejected there and logged for the warehouse team; everything after the boundary works with enum cases and an exhaustive `match`:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

// enum OrderStatus with emailSubject(), as above

final readonly class StatusChange
{
    public function __construct(
        public string $orderId,
        public OrderStatus $status,
    ) {}

    /** @throws ValueError when the warehouse sends a status the shop does not know */
    public static function fromWarehouse(string $orderId, string $status): self
    {
        return new self($orderId, OrderStatus::from($status));
    }
}

function notify(StatusChange $change): void
{
    $subject = $change->status->emailSubject();
    if ($subject !== null) {
        sendEmail($change->orderId, $subject);
    }
}

foreach ([['HG-24117', 'paid'], ['HG-24117', 'shipped'], ['HG-24120', 'Delivered'], ['HG-24121', 'returned']] as [$id, $status]) {
    echo "$id -> $status\n";
    try {
        notify(StatusChange::fromWarehouse($id, $status));
    } catch (ValueError $e) {
        echo "  rejected: {$e->getMessage()}\n";
    }
}`, "notify.php"),
        code("text", String.raw`
HG-24117 -> paid
  email to customer of HG-24117: Payment received
HG-24117 -> shipped
  email to customer of HG-24117: Your order is on its way
HG-24120 -> Delivered
  rejected: "Delivered" is not a valid backing value for enum OrderStatus
HG-24121 -> returned
  email to customer of HG-24121: We received your return`),
        numbered([
            "**One email per status**: `match` runs one arm, so there is nothing to fall through.",
            "**No catch-all**: every case has its own subject, and `Pending` explicitly sends none. A new case without a subject is an `UnhandledMatchError` in the first test.",
            "**The boundary rejects unknown strings**: `'Delivered'` becomes a logged error for the warehouse team, not an email to a customer. (Whether to accept `'Delivered'` with `strtolower` is a decision for the API contract, made in one place - not a side effect of a `default`.)",
            "**`notify` takes a `StatusChange`**, so it can only ever receive a valid status.",
        ]),

        h2("7. Your turn"),
        p("An order cannot jump from paid to delivered or come back from cancelled. Complete `OrderStatus`: its six cases, a Vietnamese label for each, and `canMoveTo`, which encodes the life cycle in the diagram above. The test runner turns every warehouse event into an enum with `tryFrom` and applies the moves your enum allows."),
        challenge("chal_coding_phpf_322", "Backing values must be exactly the lower-case strings in the starter. Write canMoveTo as a match on $this that lists every case: two cases can share one arm. Moving to the same status is not a move."),

        h2("8. Pitfalls"),
        bullets([
            "**A `case` without `break`** falls through into the next one. Use `match`, or comment every intended fall-through.",
            "**`default` as a catch-all for \"the other value\"**: it also catches typos and every value added later.",
            "**`switch` with `case false:` or `case 0:`** matches more than you think: it compares with `==`.",
            "**Statuses, types and roles as strings** inside the program: convert them to an enum at the boundary with `from` or `tryFrom`.",
            "**`from()` on user input without `try`**: it throws `ValueError`. Use `tryFrom()` when invalid input is expected.",
            "**Mutable value objects** passed around by handle: one function changes the money of another. Make them `readonly` and return new objects.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Every fixed set of values (status, role, delivery speed) is an enum; backed enums for values stored or exchanged.",
            "Strings are converted to enums once, at the boundary, and invalid values are rejected there.",
            "`match` on an enum lists every case and has no `default`.",
            "Small data objects use constructor promotion and `readonly`; objects with rules use `private(set)` and methods.",
            "No `switch` without a `break` (or a comment) after every case.",
        ]),
        p("Next lesson: exceptions. A stock reservation that failed halfway left books reserved for an order that never existed, and the error message that would have explained it was swallowed by a catch block."),
    ],
});
