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
    // TODO: json_decode with JSON_THROW_ON_ERROR, then check every field
    return [];
}

// ---------------------------------------------------------------- test runner (do not change)
$problems = validateOrder(stream_get_contents(STDIN));
echo $problems === [] ? 'ok' : 'invalid: ' . implode('; ', $problems), "\n";
