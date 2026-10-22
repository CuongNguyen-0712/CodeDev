// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-phpf-4-1",
    title: "Exceptions, finally & error handling",
    slug: { _type: "slug", current: "php-exceptions-finally-error-handling" },
    description:
        "Hồ Gươm Books' night batch reserved two copies of Truyện Kiều for an order it then rejected, and an order with a deleted book stopped the whole batch with an uncaught exception. Learn how throw, try, catch and finally work, how the Throwable hierarchy splits Exception from Error, how to write your own exception classes, catch several types at once, chain exceptions with previous, use throw as an expression, and undo partial work so an operation happens completely or not at all.",
    estimatedTime: 18,

    scenario: {
        role: "Junior PHP developer at Hồ Gươm Books, an online bookshop in Hà Nội",
        problem:
            "Every night a batch job reserves warehouse stock for the day's orders, all lines of an order or none. One morning the warehouse found the stock count for Truyện Kiều two copies lower than the shelf, and 140 orders had not been processed at all: the job had stopped at 01:12 on an order containing a book that had been removed from the catalogue.",
    },

    content: [
        h2("1. The incident"),
        p("An order at Hồ Gươm Books is only sent to the warehouse when every book in it can be reserved. The night batch goes through the day's orders, reserves stock line by line, and rejects an order when a line cannot be reserved, so the customer can be offered a different book. Rejections are normal: a few a night."),
        p("One morning two things were wrong. The system said 3 copies of Truyện Kiều were available, the shelf had 5. And only 60 of 200 orders had been processed: the log ended at 01:12 with a fatal error about a book that marketing had removed from the catalogue the evening before."),

        h2("2. Reproduce it"),
        code("php", String.raw`
<?php
declare(strict_types=1);

// reserve.php - the night batch reserves stock for the day's orders
final class OutOfStock extends RuntimeException {}

$stock = ['truyen-kieu' => 5, 'so-do' => 3];

function reserve(array &$stock, string $sku, int $qty): void
{
    if (!array_key_exists($sku, $stock)) {
        throw new InvalidArgumentException("unknown book $sku");
    }
    if ($stock[$sku] < $qty) {
        throw new OutOfStock("only {$stock[$sku]} left of $sku");
    }
    $stock[$sku] -= $qty;
}

function placeOrder(array &$stock, array $lines): string
{
    try {
        foreach ($lines as $sku => $qty) {
            reserve($stock, $sku, $qty);
        }
        return 'ok';
    } catch (OutOfStock $e) {
        return 'rejected: ' . $e->getMessage();
    }
}

$orders = [
    'HG-1' => ['truyen-kieu' => 2, 'so-do' => 5],
    'HG-2' => ['nha-gia-kim' => 1],
    'HG-3' => ['so-do' => 1],
];
foreach ($orders as $id => $lines) {
    echo "$id: " . placeOrder($stock, $lines) . "\n";
    echo '  stock: ' . json_encode($stock) . "\n";
}`, "reserve.php"),
        code("text", String.raw`
$ php reserve.php
HG-1: rejected: only 3 left of so-do
  stock: {"truyen-kieu":3,"so-do":3}
PHP Fatal error:  Uncaught InvalidArgumentException: unknown book nha-gia-kim in /app/reserve.php:12
Stack trace:
#0 /app/reserve.php(24): reserve()
#1 /app/reserve.php(38): placeOrder()
#2 {main}
  thrown in /app/reserve.php on line 12`),
        numbered([
            "**HG-1 was rejected, but its first line stayed reserved.** `truyen-kieu` was reserved, then `so-do` failed. The `catch` turned the exception into a rejection - and nothing gave the two copies back.",
            "**HG-2 crashed the batch.** `reserve` throws `InvalidArgumentException` for an unknown book, `placeOrder` only catches `OutOfStock`, so the exception travelled up past the loop and ended the script. HG-3 was never processed.",
        ]),
        p("Both bugs are about the same question: when an exception is thrown in the middle of an operation, **what has already happened, and who is responsible for undoing it?**"),

        h2("3. throw, try, catch, finally"),
        p("An exception is an object that interrupts the normal flow. `throw` creates it and starts unwinding: PHP leaves the current function, then its caller, and so on, until it finds a `try` block with a matching `catch`. Code after the `throw` in each of those functions does not run. If no `catch` matches, the script ends with \"Uncaught ...\" and a stack trace, as above."),
        code("php", String.raw`
<?php
declare(strict_types=1);

enum OrderStatus: string { case Paid = 'paid'; }

function attempt(string $label, callable $fn): void
{
    try {
        $fn();
        echo "$label: no exception\n";
    } catch (Exception $e) {
        echo "$label: Exception ", $e::class, ': ', $e->getMessage(), "\n";
    } catch (Error $e) {
        echo "$label: Error ", $e::class, ': ', $e->getMessage(), "\n";
    }
}

attempt('intdiv', fn() => intdiv(1, 0));
attempt('json', fn() => json_decode('{bad', flags: JSON_THROW_ON_ERROR));
attempt('enum', fn() => OrderStatus::from('x'));
attempt('type', fn() => str_repeat('-', '3'));
attempt('custom', fn() => throw new DomainException('a voucher cannot be negative'));
attempt('warning', fn() => file_get_contents('/no/such/file'));`, "throwables.php"),
        code("text", String.raw`
intdiv: Error DivisionByZeroError: Division by zero
json: Exception JsonException: Syntax error
enum: Error ValueError: "x" is not a valid backing value for enum OrderStatus
type: Error TypeError: str_repeat(): Argument #2 ($times) must be of type int, string given
custom: Exception DomainException: a voucher cannot be negative
PHP Warning:  file_get_contents(/no/such/file): Failed to open stream: No such file or directory in /app/throwables.php on line 23
warning: no exception`),
        bullets([
            "**`catch` blocks are tried in order**, and the first whose type matches wins. `catch (A|B $e)` catches either type (PHP 7.1); `catch (OutOfStock)` without a variable is allowed when you do not need the object (PHP 8.0).",
            "**`throw` is an expression** since PHP 8.0, so it works in arrow functions and after `??`: `$sku = $input['sku'] ?? throw new InvalidArgumentException('sku is required');`.",
            "**Warnings are not exceptions.** `file_get_contents` on a missing file prints a warning and returns `false`; the `try` never sees it. Check the return value of such functions and throw yourself.",
        ]),
        h3("The Throwable hierarchy"),
        image("throwable-hierarchy", {
            alt: "A class tree. Throwable has two branches, Exception and Error. Under Exception: RuntimeException, with your own OutOfStock below it; LogicException, with InvalidArgumentException and DomainException below it; and JsonException directly under Exception. Under Error: TypeError, with ArgumentCountError below it; ValueError; ArithmeticError, with DivisionByZeroError below it; and UnhandledMatchError. A note says exceptions are conditions a program expects and handles - no stock, bad input, a timeout - while errors are mostly bugs - a wrong type, a missing argument, a match without an arm - to be fixed in the code, not caught. A box below says to catch what you can handle, as narrowly as you can: catch (OutOfStock|InvalidArgumentException $e) for the two reasons an order can be rejected; catch (Exception $e) misses TypeError and every other Error and swallows exceptions you never meant to handle; catch (Throwable $e) only at the very top, to log, show an error page, then stop or move to the next job. PHP warnings such as file_get_contents on a missing file are not exceptions at all: check the return value, or throw yourself.",
            caption: "catch (Exception $e) is both too wide and too narrow: it hides your mistakes and still misses a TypeError.",
        }),
        p("Everything that can be thrown implements `Throwable`, in two branches. **`Exception`** is for conditions a correct program expects: no stock, invalid input, a timeout. **`Error`** is what PHP throws for mistakes in the code: a wrong argument type, a missing argument, a division by zero, a `match` without an arm. You rarely catch an `Error` - you fix the code that caused it."),
        h3("Your own exceptions"),
        p("Define an exception class for every condition callers may want to handle differently. Extend the closest standard class - `RuntimeException` for things that go wrong at run time, `InvalidArgumentException` or `DomainException` for invalid values - and the class name becomes the thing you catch: `final class OutOfStock extends RuntimeException {}` is a complete declaration. To add context without losing the cause, wrap the original exception as `previous`:"),
        code("php", String.raw`
try {
    $gateway->charge($order);
} catch (GatewayTimeout $e) {
    throw new PaymentFailed("order {$order->id} could not be paid", previous: $e);
}
// the log shows both messages: "order HG-24117 could not be paid" <- "payment gateway timeout"`),
        h3("finally"),
        p("A `finally` block runs when the `try` block is left, in every way: normally, by `return`, or by an exception (caught or not). It is the place for clean-up that must always happen - closing a file, releasing a lock, writing an audit line."),
        code("php", String.raw`
function audited(): string
{
    try {
        throw new RuntimeException('payment gateway timeout');
    } finally {
        echo "finally runs before the exception leaves the function\n";
    }
}

function swallowed(): string
{
    try {
        throw new RuntimeException('lost');
    } finally {
        return 'finally wins';   // a return in finally discards the exception
    }
}
echo swallowed(), "\n";   // finally wins`),
        callout("warning", "Never return from finally",
            "A return (or break, or continue) inside finally replaces whatever the try block was doing - including an exception on its way up. The exception disappears without a trace. finally is for clean-up; let it finish and let the result or the exception continue."),

        h2("4. All or nothing"),
        p("The night batch needs every order to be **atomic**: all its lines reserved, or none. With an exception in the middle, that means two things:"),
        numbered([
            "**Remember what you have done**, step by step, so you know what to undo: a list of the lines reserved so far.",
            "**Undo exactly that, then report.** In the `catch`, release the reserved lines - newest first, the reverse of the order you took them - and only then turn the exception into a rejection.",
        ]),
        p("Do not use `finally` for the undo: it also runs after success, and would release the stock of every order that went through. And keep the `catch` to the exceptions that mean \"this order cannot be placed\": a `TypeError` means the batch itself is broken, and it should stop loudly instead of rejecting orders one by one. Databases offer the same pattern as **transactions** (`BEGIN` ... `COMMIT`, or `ROLLBACK` in the catch), which you will use when the stock lives in Postgres or MySQL."),
        callout("info", "Errors at the top level",
            "The one place where catch (Throwable $e) is right is the outermost loop of a worker or a request handler: log the exception with its trace, mark the job as failed, and move on to the next job (or show a 500 page). That decision belongs to the batch, not to placeOrder - which is why placeOrder must not swallow what it does not understand."),

        h2("5. The fix"),
        p("The fixed batch keeps the stock in an `Inventory` object instead of an array passed by reference, records each reservation, and undoes them when the order is rejected - for either reason:"),
        code("php", String.raw`
<?php
declare(strict_types=1);

final class OutOfStock extends RuntimeException {}

final class Inventory
{
    /** @param array<string, int> $stock SKU => copies */
    public function __construct(private array $stock) {}

    public function reserve(string $sku, int $qty): void
    {
        if (!array_key_exists($sku, $this->stock)) {
            throw new InvalidArgumentException("unknown book $sku");
        }
        if ($this->stock[$sku] < $qty) {
            throw new OutOfStock("only {$this->stock[$sku]} left of $sku");
        }
        $this->stock[$sku] -= $qty;
    }

    public function release(string $sku, int $qty): void
    {
        $this->stock[$sku] += $qty;
    }

    /** @return array<string, int> */
    public function stock(): array
    {
        return $this->stock;
    }
}

/** @param array<string, int> $lines SKU => quantity */
function placeOrder(Inventory $inventory, array $lines): string
{
    $reserved = [];
    try {
        foreach ($lines as $sku => $qty) {
            $inventory->reserve($sku, $qty);
            $reserved[$sku] = $qty;
        }
        return 'ok';
    } catch (OutOfStock|InvalidArgumentException $e) {
        foreach (array_reverse($reserved) as $sku => $qty) {
            $inventory->release($sku, $qty);
        }
        return 'rejected: ' . $e->getMessage();
    }
}

$inventory = new Inventory(['truyen-kieu' => 5, 'so-do' => 3]);
$orders = [
    'HG-1' => ['truyen-kieu' => 2, 'so-do' => 5],
    'HG-2' => ['nha-gia-kim' => 1],
    'HG-3' => ['so-do' => 1],
];
foreach ($orders as $id => $lines) {
    echo "$id: " . placeOrder($inventory, $lines) . "\n";
}
echo json_encode($inventory->stock()), "\n";`, "reserve.php"),
        code("text", String.raw`
HG-1: rejected: only 3 left of so-do
HG-2: rejected: unknown book nha-gia-kim
HG-3: ok
{"truyen-kieu":5,"so-do":2}`),
        numbered([
            "**`$reserved` records progress.** A line is added only after `reserve` returned, so a line that threw is never released.",
            "**The `catch` undoes, then reports.** The stock of Truyện Kiều is back to 5 after HG-1.",
            "**Both expected reasons are caught**, with one multi-catch: an unknown book rejects its order, and the batch goes on to HG-3.",
            "**Nothing else is caught.** A `TypeError` from a bug in the batch still stops it, with a stack trace that points at the bug.",
            "**The inventory is an object.** It is passed by handle, so `placeOrder` changes the one inventory without `&` references.",
        ]),

        h2("6. Your turn"),
        p("The real `placeOrder` still has both bugs, and orders can also contain a quantity below 1, which `reserve` rejects with an `InvalidArgumentException`. Fix it so every order is all or nothing and the batch never stops for a bad order."),
        challenge("chal_fix_phpf_411", "Keep a list of the lines that were reserved successfully, and release exactly those in the catch block. Catch both exception types that mean 'reject this order' - but nothing wider. A finally block is the wrong place: it also runs when the order succeeds."),

        h2("7. Pitfalls"),
        bullets([
            "**A `catch` that reports but does not undo**: the exception is handled, the half-done work stays.",
            "**Catching too narrowly**: an exception you did not list travels up and ends the whole batch.",
            "**Catching too widely** (`catch (Exception $e)`, `catch (Throwable $e)` deep in the code): bugs become \"rejections\" and nobody sees them.",
            "**An empty `catch`** or one that only logs and carries on as if nothing happened.",
            "**`return` in `finally`**: it silently discards the exception.",
            "**Undo in `finally`**: it also runs after success.",
            "**Treating warnings as exceptions**: functions that return `false` with a warning never reach your `catch`. Check their result.",
        ]),

        h2("8. Checklist"),
        bullets([
            "Each condition callers handle differently has its own exception class, extending the closest standard one.",
            "Every `catch` names the types it can really handle, and does something about them.",
            "Operations with several steps record their progress and undo it when a later step fails (or run in a database transaction).",
            "`finally` only cleans up, and never returns.",
            "Wrapped exceptions keep the original as `previous`.",
            "Only the outermost loop of a job or request catches `Throwable`, to log and fail that one job.",
        ]),
        p("Next lesson: validating input. A JSON order from the mobile app arrived cut in half, json_decode returned null, and the checkout created an order with no books and a total of 0 VND."),
    ],
});
