<?php
declare(strict_types=1);

// Hồ Gươm Books - reserving stock for orders, one order at a time.
//
// placeOrder reserves every line of an order, or none of them: when one line cannot be
// reserved, the lines reserved before it must be released again, and the order is rejected.
// It returns "ok" or "rejected: " followed by the exception's message.
// Orders are rejected for a book that is out of stock (OutOfStock), and for an unknown
// book or a quantity below 1 (InvalidArgumentException). Any other error is a bug in the
// shop and must NOT be turned into a rejection.
//
// Input (stdin):
//   stock SKU N                   N copies of SKU in the warehouse
//   order ID SKU:QTY SKU:QTY ...  an order
// The test runner prints "ID: ok" or "ID: rejected: ..." for every order, then the stock left.
//
// Bug reports from the warehouse:
//   - "Stock of Truyện Kiều is 2 lower than what is on the shelf after a rejected order."
//   - "The night batch stopped at an order with a deleted book; the orders after it were never processed."
//
// Fix placeOrder. Inventory is correct.

final class OutOfStock extends RuntimeException
{
}

final class Inventory
{
    /** @param array<string, int> $stock SKU => copies */
    public function __construct(private array $stock)
    {
    }

    public function reserve(string $sku, int $qty): void
    {
        if (!array_key_exists($sku, $this->stock)) {
            throw new InvalidArgumentException("unknown book $sku");
        }
        if ($qty < 1) {
            throw new InvalidArgumentException("bad quantity $qty for $sku");
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

/** @param list<array{string, int}> $lines [SKU, quantity] pairs */
function placeOrder(Inventory $inventory, array $lines): string
{
    $reserved = [];
    try {
        foreach ($lines as [$sku, $qty]) {
            $inventory->reserve($sku, $qty);
            $reserved[] = [$sku, $qty];
        }
        return 'ok';
    } catch (OutOfStock|InvalidArgumentException $e) {
        // Undo only what this order reserved, newest first.
        foreach ($lines as [$sku, $qty]) {
            $inventory->release($sku, $qty);
        }
        return 'rejected: ' . $e->getMessage();
    }
}

// ---------------------------------------------------------------- test runner (do not change)
$stock = [];
$orders = [];
foreach (explode("\n", trim(stream_get_contents(STDIN))) as $row) {
    $f = preg_split('/\s+/', trim($row));
    if ($f[0] === 'stock') {
        $stock[$f[1]] = (int) $f[2];
    } elseif ($f[0] === 'order') {
        $lines = [];
        foreach (array_slice($f, 2) as $item) {
            [$sku, $qty] = explode(':', $item);
            $lines[] = [$sku, (int) $qty];
        }
        $orders[] = [$f[1], $lines];
    }
}
$inventory = new Inventory($stock);
foreach ($orders as [$id, $lines]) {
    echo "$id: " . placeOrder($inventory, $lines) . "\n";
}
foreach ($inventory->stock() as $sku => $left) {
    echo "stock $sku: $left\n";
}
