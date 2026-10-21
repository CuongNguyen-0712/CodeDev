// Known wrong: removes sold-out ISBNs with shelf.remove() inside a for-each loop over the same list; the list iterator throws ConcurrentModificationException on the next step.
/**
 * Mekong Books - nightly restock planner.
 *
 * Input (stdin): a SALES section and a STOCK section.
 *
 *   SALES
 *   9786041000011 fiction 3        one sale per line: ISBN, category, copies sold (a positive whole number)
 *   9786041000028 children 2
 *   9786041000011 fiction 1        the same ISBN can appear on several lines
 *   STOCK
 *   9786041000011 0                copies left in the warehouse after today's sales
 *   9786041000028 5
 *
 * Write the three methods below:
 *
 *   soldByCategory(sales)   copies sold per category, added up over all lines; the map must iterate
 *                           its categories in the order each category FIRST appears in the sales.
 *   uniqueIsbns(sales)      every ISBN that was sold, each one once, in the order it FIRST appears.
 *   removeSoldOut(shelf, stock)
 *                           removes from the shelf list every ISBN whose stock is 0, and returns the
 *                           removed ISBNs in shelf order. An ISBN missing from the STOCK section has
 *                           0 copies left. The shelf list must be changed in place.
 *
 * The runner prints:
 *
 *   fiction 4
 *   children 2
 *   reorder: 9786041000011
 *   on shelf: 9786041000028
 *
 * ("(none)" when a list is empty). If your code throws, the runner prints "error: " and the exception.
 */
import java.util.*;

public class Main {
    record Sale(String isbn, String category, int qty) {}

    static Map<String, Integer> soldByCategory(List<Sale> sales) {
        Map<String, Integer> totals = new LinkedHashMap<>();
        for (Sale sale : sales) {
            totals.merge(sale.category(), sale.qty(), Integer::sum);
        }
        return totals;
    }

    static Set<String> uniqueIsbns(List<Sale> sales) {
        Set<String> isbns = new LinkedHashSet<>();
        for (Sale sale : sales) {
            isbns.add(sale.isbn());
        }
        return isbns;
    }

    static List<String> removeSoldOut(List<String> shelf, Map<String, Integer> stock) {
        List<String> removed = new ArrayList<>();
        for (String isbn : shelf) {
            if (stock.getOrDefault(isbn, 0) == 0) {
                shelf.remove(isbn);
                removed.add(isbn);
            }
        }
        return removed;
    }

    // ---------------------------------------------------------------- test runner (do not change)
    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        List<Sale> sales = new ArrayList<>();
        Map<String, Integer> stock = new HashMap<>();
        String section = "";
        for (String raw : input.split("\n")) {
            String line = raw.strip();
            if (line.isEmpty()) continue;
            if (line.equals("SALES") || line.equals("STOCK")) { section = line; continue; }
            String[] p = line.split("\\s+");
            if (section.equals("SALES")) sales.add(new Sale(p[0], p[1], Integer.parseInt(p[2])));
            else stock.put(p[0], Integer.parseInt(p[1]));
        }
        try {
            Map<String, Integer> totals = soldByCategory(sales);
            for (Map.Entry<String, Integer> e : totals.entrySet()) {
                System.out.println(e.getKey() + " " + e.getValue());
            }
            List<String> shelf = new ArrayList<>(uniqueIsbns(sales));
            List<String> reorder = removeSoldOut(shelf, stock);
            System.out.println("reorder: " + (reorder.isEmpty() ? "(none)" : String.join(" ", reorder)));
            System.out.println("on shelf: " + (shelf.isEmpty() ? "(none)" : String.join(" ", shelf)));
        } catch (RuntimeException e) {
            System.out.println("error: " + e.getClass().getSimpleName() + (e.getMessage() == null ? "" : ": " + e.getMessage()));
        }
    }
}
