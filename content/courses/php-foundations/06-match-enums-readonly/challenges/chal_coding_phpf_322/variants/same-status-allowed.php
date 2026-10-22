<?php
declare(strict_types=1);

// Hồ Gươm Books - order statuses reported by the warehouse app.
//
// Complete the enum OrderStatus. Its backing values are exactly:
//   pending, paid, shipped, delivered, returned, cancelled
// label() returns the Vietnamese label shown to customers:
//   pending "Chờ thanh toán", paid "Đã thanh toán", shipped "Đang giao",
//   delivered "Đã giao", returned "Đã trả hàng", cancelled "Đã hủy"
// canMoveTo() says whether an order in this status may move to $next:
//   pending   -> paid, cancelled
//   paid      -> shipped, cancelled
//   shipped   -> delivered, returned
//   delivered -> returned
//   returned and cancelled are final: no move is allowed
// Staying in the same status is not a move: paid -> paid is not allowed.
//
// Input (stdin): one event per line, ORDER-ID STATUS. Every order starts as pending.
// The test runner prints one line per event, then the final status of every order:
//   HG-1: pending -> paid                 a move that is allowed
//   HG-1: cannot go from paid to returned a move that is not allowed (the status does not change)
//   HG-1: unknown status 'Shipped'        a value that is not a status (backing values are lower case)
//   HG-1 paid (Đã thanh toán)             final status and label, orders in the order they first moved

enum OrderStatus: string
{
    case Pending = 'pending';
    case Paid = 'paid';
    case Shipped = 'shipped';
    case Delivered = 'delivered';
    case Returned = 'returned';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Chờ thanh toán',
            self::Paid => 'Đã thanh toán',
            self::Shipped => 'Đang giao',
            self::Delivered => 'Đã giao',
            self::Returned => 'Đã trả hàng',
            self::Cancelled => 'Đã hủy',
        };
    }

    public function canMoveTo(self $next): bool
    {
        if ($next === $this) {
            return true;
        }
        return match ($this) {
            self::Pending => $next === self::Paid || $next === self::Cancelled,
            self::Paid => $next === self::Shipped || $next === self::Cancelled,
            self::Shipped => $next === self::Delivered || $next === self::Returned,
            self::Delivered => $next === self::Returned,
            self::Returned, self::Cancelled => false,
        };
    }
}

// ---------------------------------------------------------------- test runner (do not change)
$orders = [];
foreach (explode("\n", trim(stream_get_contents(STDIN))) as $line) {
    [$id, $raw] = preg_split('/\s+/', trim($line));
    $next = OrderStatus::tryFrom($raw);
    if ($next === null) {
        echo "$id: unknown status '$raw'\n";
        continue;
    }
    $current = $orders[$id] ?? OrderStatus::Pending;
    if (!$current->canMoveTo($next)) {
        echo "$id: cannot go from {$current->value} to {$next->value}\n";
        continue;
    }
    $orders[$id] = $next;
    echo "$id: {$current->value} -> {$next->value}\n";
}
foreach ($orders as $id => $status) {
    echo "$id {$status->value} ({$status->label()})\n";
}
