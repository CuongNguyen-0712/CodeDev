<?php
declare(strict_types=1);

// Hồ Gươm Books - validating the order the mobile app POSTs to /api/orders.
//
// Write validateOrder. It receives the raw request body and returns the list of problems,
// in this order (an empty list means the order is valid):
//   - the body is not valid JSON                -> only "malformed JSON"
//   - the JSON is not an object ({...})         -> only "order must be an object"
//   - "email" missing or not a valid address    -> "email is not valid"   (use filter_var)
//   - "phone" missing or not a string of 10 digits starting with 0
//                                               -> "phone must be 10 digits starting with 0"
//   - "items" missing, empty or not a list      -> "items must be a non-empty list"
//     otherwise, for item number N (1, 2, ...):
//       not an object                           -> "item N must be an object"
//       "sku" missing or not a non-empty string -> "item N: sku is missing"
//       "qty" not an integer from 1 to 10       -> "item N: qty must be a whole number from 1 to 10"
//         (a JSON integer: "2", 2.0 and true are not integers)
//   - "giftWrap" present but not true or false  -> "giftWrap must be true or false"
//
// The test runner prints "ok" or "invalid: " followed by the problems joined with "; ".
// Example: {"email": "lan@example.vn", "phone": 912345678, "items": []}
//   -> invalid: phone must be 10 digits starting with 0; items must be a non-empty list

/** @return list<string> */
function validateOrder(string $body): array
{
    try {
        $data = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        return ['malformed JSON'];
    }
    if (!is_array($data) || array_is_list($data)) {
        return ['order must be an object'];
    }

    $problems = [];
    if (!is_string($data['email'] ?? null) || filter_var($data['email'], FILTER_VALIDATE_EMAIL) === false) {
        $problems[] = 'email is not valid';
    }
    if (!is_string($data['phone'] ?? null) || preg_match('/^0\d{9}$/', $data['phone']) !== 1) {
        $problems[] = 'phone must be 10 digits starting with 0';
    }
    $items = $data['items'] ?? null;
    if (!is_array($items) || $items === [] || !array_is_list($items)) {
        $problems[] = 'items must be a non-empty list';
    } else {
        foreach ($items as $i => $item) {
            $n = $i + 1;
            if (!is_array($item) || array_is_list($item)) {
                $problems[] = "item $n must be an object";
                continue;
            }
            $sku = $item['sku'] ?? null;
            if (!is_string($sku) || $sku === '') {
                $problems[] = "item $n: sku is missing";
            }
            $qty = $item['qty'] ?? null;
            if (!is_int($qty) || $qty < 1 || $qty > 10) {
                $problems[] = "item $n: qty must be a whole number from 1 to 10";
            }
        }
    }
    if (array_key_exists('giftWrap', $data) && !is_bool($data['giftWrap'])) {
        $problems[] = 'giftWrap must be true or false';
    }
    return $problems;
}

// ---------------------------------------------------------------- test runner (do not change)
$problems = validateOrder(stream_get_contents(STDIN));
echo $problems === [] ? 'ok' : 'invalid: ' . implode('; ', $problems), "\n";
