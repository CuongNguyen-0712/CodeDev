/**
 * Mekong Books: the Monday inventory report.
 *
 * Input (stdin): the warehouse export, one stock line per row, no header:
 *
 *     warehouse;isbn;title;qty;reorderLevel
 *
 * Lines are numbered from 1. A blank line (empty or only spaces) is skipped: it is not
 * reported anywhere, but it still counts for the line numbers.
 *
 * Parsing one line (write parse):
 *   - Split on ";" keeping empty fields (line.split(";", -1)). Exactly 5 fields are needed,
 *     otherwise the reason is "expected 5 fields, got N".
 *   - Every field is trimmed with strip().
 *   - warehouse: must not be empty, otherwise "empty warehouse".
 *   - isbn: remove every "-" and " " inside it; the result must be exactly 13 digits 0-9,
 *     otherwise "bad isbn: <the trimmed field as written>". The report always shows the
 *     normalised 13 digits, so "978-604-1-11111-1" and "9786041111111" are the same book.
 *   - title: must not be empty, otherwise "empty title".
 *   - qty and reorderLevel: Integer.parseInt must accept the trimmed field and the value
 *     must be 0 or more, otherwise "bad qty: <trimmed field>" or
 *     "bad reorder level: <trimmed field>".
 *   - If a line has several problems, report the first one in the order above.
 *   A good line becomes Ok(item); a bad one becomes Bad(lineNo, reason). A bad line must
 *   never stop the report.
 *
 * Merging: lines with the same warehouse and the same normalised ISBN are one book in that
 * warehouse: add up their qty and keep the HIGHEST reorderLevel. The title shown for an ISBN,
 * everywhere in the report, is the title of the first good line with that ISBN in the input.
 * Warehouse names are compared exactly (after strip()).
 *
 * Status of a book in a warehouse (write classify):
 *   qty == 0                 -> OUT_OF_STOCK
 *   qty <= reorderLevel      -> LOW
 *   otherwise                -> OK
 *
 * Output (report returns the lines; it must return an UNMODIFIABLE list):
 *   - For each warehouse in alphabetical order (String.compareTo):
 *         Warehouse: <name>
 *     then one line per book, sorted by status (OUT_OF_STOCK, LOW, OK), then by title,
 *     then by ISBN, each indented by two spaces:
 *           <STATUS> <isbn> <title> (qty <qty>, reorder at <reorderLevel>)
 *   - Then "Reorder: <count>" and, sorted by ISBN, one line per ISBN that is OUT_OF_STOCK
 *     or LOW in at least one warehouse, with its total qty over ALL warehouses:
 *           <isbn> <title> (total qty <total>)
 *   - Then "Rejected lines: <count>" and one line per bad line, in input order:
 *           line <lineNo>: <reason>
 *
 * Example input:
 *     Hanoi;978-604-1-11111-1;Clean Code;2;3
 *     Can Tho;9786041111111;Clean Code;10;3
 *     Hanoi;9786042222222;Dune;0;1
 *
 *     Hanoi;9786041111111;Clean Code;two;3
 * Output:
 *     Warehouse: Can Tho
 *       OK 9786041111111 Clean Code (qty 10, reorder at 3)
 *     Warehouse: Hanoi
 *       OUT_OF_STOCK 9786042222222 Dune (qty 0, reorder at 1)
 *       LOW 9786041111111 Clean Code (qty 2, reorder at 3)
 *     Reorder: 2
 *       9786041111111 Clean Code (total qty 12)
 *       9786042222222 Dune (total qty 0)
 *     Rejected lines: 1
 *       line 5: bad qty: two
 */
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class Main {

    enum Status { OUT_OF_STOCK, LOW, OK }

    // Add a compact constructor (or helpers in parse) so an Item can only hold valid values.
    record Item(String warehouse, String isbn, String title, int qty, int reorderLevel) {}

    sealed interface ParseResult permits Ok, Bad {}
    record Ok(Item item) implements ParseResult {}
    record Bad(int lineNo, String reason) implements ParseResult {}

    // Naive version (on purpose): this is the old Monday script. Rewrite these three methods.

    static Status classify(int qty, int reorderLevel) {
        return qty < reorderLevel ? Status.LOW : Status.OK;
    }

    static ParseResult parse(int lineNo, String line) {
        String[] f = line.split(";");
        return new Ok(new Item(f[0], f[1], f[2], Integer.parseInt(f[3]), Integer.parseInt(f[4])));
    }

    static List<String> report(List<String> lines) {
        Map<String, Map<String, Item>> warehouses = new HashMap<>();
        for (int i = 0; i < lines.size(); i++) {
            if (parse(i + 1, lines.get(i)) instanceof Ok ok) {
                Item it = ok.item();
                warehouses.computeIfAbsent(it.warehouse(), w -> new HashMap<>()).put(it.isbn(), it);
            }
        }
        List<String> out = new ArrayList<>();
        warehouses.forEach((name, books) -> {
            out.add("Warehouse: " + name);
            for (Item it : books.values()) {
                out.add("  %s %s %s (qty %d, reorder at %d)".formatted(
                        classify(it.qty(), it.reorderLevel()), it.isbn(), it.title(), it.qty(), it.reorderLevel()));
            }
        });
        out.add("Reorder: 0");
        out.add("Rejected lines: 0");
        return out;
    }

    // ---------------------------------------------------------------- test runner (do not change)
    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);
        List<String> result;
        try {
            result = report(input.lines().toList());
        } catch (RuntimeException e) {
            System.out.println("error: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            return;
        }
        result.forEach(System.out::println);
        try {
            result.add("extra line");
            System.out.println("error: report() returned a modifiable list");
        } catch (UnsupportedOperationException expected) {
            // good: the report cannot be changed by its callers
        }
    }
}
