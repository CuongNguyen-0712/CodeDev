<?php
declare(strict_types=1);

// Hồ Gươm Books - the "Bán chạy" (bestsellers) widget of the mobile app.
//
// Input (stdin): JSON {"limit": N, "books": [{"id": 5, "title": "...", "sold": 515, "stock": 11}, ...]}
//   sold   copies sold in the last 30 days
//   stock  copies in the warehouse now
//
// Write bestsellers. It returns a LIST (the app expects a JSON array, not an object) of at most
// $limit books, each as ["rank" => 1, "id" => 5, "title" => "...", "sold" => 515]:
//   - only books with stock > 0 (a bestseller nobody can buy is not shown)
//   - most sold first; books with the same sales: the lower id first, so the order never
//     depends on the order in which the database returned the rows
//   - rank is 1, 2, 3 ... in that order
//   - fewer than $limit books when fewer are in stock; an empty list for limit 0
//
// Example input:
//   {"limit": 2, "books": [{"id": 9, "title": "Clean Code", "sold": 120, "stock": 2},
//                          {"id": 3, "title": "Truyện Kiều", "sold": 340, "stock": 0},
//                          {"id": 7, "title": "Số đỏ", "sold": 120, "stock": 4}]}
// Expected output:
//   [{"rank":1,"id":7,"title":"Số đỏ","sold":120},{"rank":2,"id":9,"title":"Clean Code","sold":120}]

/**
 * @param list<array{id: int, title: string, sold: int, stock: int}> $books
 * @return list<array{rank: int, id: int, title: string, sold: int}>
 */
function bestsellers(array $books, int $limit): array
{
    usort($books, fn(array $a, array $b): int => [$b['sold'], $a['id']] <=> [$a['sold'], $b['id']]);
    $top = array_values(array_filter(array_slice($books, 0, $limit), fn(array $b): bool => $b['stock'] > 0));
    $result = [];
    foreach ($top as $i => $b) {
        $result[] = ['rank' => $i + 1, 'id' => $b['id'], 'title' => $b['title'], 'sold' => $b['sold']];
    }
    return $result;
}

// ---------------------------------------------------------------- test runner (do not change)
$input = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
echo json_encode(bestsellers($input['books'], $input['limit']), JSON_UNESCAPED_UNICODE), "\n";
