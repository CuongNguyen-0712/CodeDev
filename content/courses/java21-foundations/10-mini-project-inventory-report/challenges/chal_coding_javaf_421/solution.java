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
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;

public class Main {

    enum Status { OUT_OF_STOCK, LOW, OK }

    // The record guards its invariants; parse() turns raw text into valid values first.
    record Item(String warehouse, String isbn, String title, int qty, int reorderLevel) {
        Item {
            if (warehouse.isBlank() || title.isBlank() || !isbn.matches("[0-9]{13}")
                    || qty < 0 || reorderLevel < 0) {
                throw new IllegalArgumentException("invalid item " + isbn);
            }
        }
    }

    sealed interface ParseResult permits Ok, Bad {}
    record Ok(Item item) implements ParseResult {}
    record Bad(int lineNo, String reason) implements ParseResult {}

    // One book in one warehouse after merging its lines.
    record Stock(String isbn, int qty, int reorderLevel) {
        Stock plus(Stock other) {
            return new Stock(isbn, qty + other.qty, Math.max(reorderLevel, other.reorderLevel));
        }
    }

    static Status classify(int qty, int reorderLevel) {
        return switch (qty) {
            case 0 -> Status.OUT_OF_STOCK;
            default -> qty <= reorderLevel ? Status.LOW : Status.OK;
        };
    }

    static String text(String field, String reason) {
        String value = field.strip();
        if (value.isEmpty()) throw new IllegalArgumentException(reason);
        return value;
    }

    static String isbn(String field) {
        String digits = field.strip().replace("-", "").replace(" ", "");
        if (!digits.matches("[0-9]{13}")) throw new IllegalArgumentException("bad isbn: " + field.strip());
        return digits;
    }

    static int count(String field, String reason) {
        String value = field.strip();
        try {
            int n = Integer.parseInt(value);
            if (n >= 0) return n;
        } catch (NumberFormatException e) {
            // same reason as a negative number below
        }
        throw new IllegalArgumentException(reason + ": " + value);
    }

    static ParseResult parse(int lineNo, String line) {
        String[] f = line.split(";", -1);
        if (f.length != 5) return new Bad(lineNo, "expected 5 fields, got " + f.length);
        try {
            String warehouse = text(f[0], "empty warehouse");
            String isbn = isbn(f[1]);
            String title = text(f[2], "empty title");
            int qty = count(f[3], "bad qty");
            int reorderLevel = count(f[4], "bad reorder level");
            return new Ok(new Item(warehouse, isbn, title, qty, reorderLevel));
        } catch (IllegalArgumentException e) {
            return new Bad(lineNo, e.getMessage());
        }
    }

    static List<String> report(List<String> lines) {
        List<Item> items = new ArrayList<>();
        List<Bad> rejected = new ArrayList<>();
        int lineNo = 0;
        for (String line : lines) {
            lineNo++;
            if (line.isBlank()) continue;
            switch (parse(lineNo, line)) {
                case Ok ok -> items.add(ok.item());
                case Bad bad -> rejected.add(bad);
            }
        }

        Map<String, String> titles = new HashMap<>();
        Map<String, Integer> totals = new HashMap<>();
        Map<String, Map<String, Stock>> warehouses = new TreeMap<>();
        for (Item it : items) {
            titles.putIfAbsent(it.isbn(), it.title());
            totals.merge(it.isbn(), it.qty(), Integer::sum);
            warehouses.computeIfAbsent(it.warehouse(), w -> new HashMap<>())
                    .merge(it.isbn(), new Stock(it.isbn(), it.qty(), it.reorderLevel()), Stock::plus);
        }

        Comparator<Stock> order = Comparator
                .comparing((Stock s) -> classify(s.qty(), s.reorderLevel()))
                .thenComparing(s -> titles.get(s.isbn()))
                .thenComparing(Stock::isbn);

        List<String> out = new ArrayList<>();
        TreeSet<String> toReorder = new TreeSet<>();
        warehouses.forEach((name, books) -> {
            out.add("Warehouse: " + name);
            books.values().stream().sorted(order).forEach(s -> {
                Status status = classify(s.qty(), s.reorderLevel());
                if (status != Status.OK) toReorder.add(s.isbn());
                out.add("  %s %s %s (qty %d, reorder at %d)".formatted(
                        status, s.isbn(), titles.get(s.isbn()), s.qty(), s.reorderLevel()));
            });
        });
        out.add("Reorder: " + toReorder.size());
        for (String isbn : toReorder) {
            out.add("  %s %s (total qty %d)".formatted(isbn, titles.get(isbn), totals.get(isbn)));
        }
        out.add("Rejected lines: " + rejected.size());
        for (Bad bad : rejected) out.add("  line " + bad.lineNo() + ": " + bad.reason());
        return List.copyOf(out);
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
