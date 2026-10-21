// Known wrong: warehouses are kept in a HashMap, so they come out in hash order, not alphabetical order.
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
        Map<String, Map<String, Stock>> warehouses = new HashMap<>();
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
