import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Mekong Books: the monthly sales report, written with streams.
 *
 * Input (stdin): the first line is "TOP n" (n >= 1). Every other non-empty line is one sale:
 *
 *     date;isbn;title;category;qty;unitPrice
 *     2026-09-01;9780132350884;Clean Code;Programming;2;240000
 *
 * The runner below parses the lines into Sale records (in input order) and calls
 * report(sales, n). The same title can appear on many lines (it sold on several days).
 * Prices are whole VND in a long; the revenue of one line is qty * unitPrice (Sale.revenue()).
 *
 * Write report(sales, topN). It returns the report lines, in this order:
 *
 *   1. "Revenue by category"
 *   2. one line per category: "<category>: <revenue>", where revenue is the sum of revenue()
 *      of all lines in that category. Sort by revenue, highest first; equal revenue -> category
 *      name A-Z (String.compareTo).
 *   3. "Top <n> titles by copies"
 *   4. the n titles with the most copies sold: "<rank>. <title>: <copies>", rank starting at 1.
 *      copies = the sum of qty over all lines of that title (NOT the number of lines).
 *      Most copies first; equal copies -> title A-Z. Fewer than n titles -> list them all.
 *   5. "Total: <copies> copies, <revenue> VND" (all lines).
 *
 * Numbers in steps 2 and 5 use a comma every three digits: String.format(Locale.ROOT, "%,d", x)
 * gives "1,310,000". Copies in step 4 are plain numbers.
 *
 * Example input:
 *     TOP 2
 *     2026-09-01;9780132350884;Clean Code;Programming;2;240000
 *     2026-09-01;9780441172719;Dune;Novels;1;210000
 *     2026-09-02;9780132350884;Clean Code;Programming;1;240000
 *     2026-09-03;9780201616224;The Pragmatic Programmer;Programming;1;350000
 *     2026-09-03;9780441172719;Dune;Novels;1;210000
 *
 * Expected output:
 *     Revenue by category
 *     Programming: 1,070,000
 *     Novels: 420,000
 *     Top 2 titles by copies
 *     1. Clean Code: 3
 *     2. Dune: 2
 *     Total: 6 copies, 1,490,000 VND
 */
public class Main {
    record Sale(String date, String isbn, String title, String category, int qty, long unitPrice) {
        long revenue() {
            return qty * unitPrice;
        }
    }

    static List<String> report(List<Sale> sales, int topN) {
        List<String> lines = new ArrayList<>();
        lines.add("Revenue by category");
        Map<String, Long> byCategory = sales.stream()
            .collect(Collectors.groupingBy(Sale::category, Collectors.summingLong(Sale::revenue)));
        byCategory.entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed()
                .thenComparing(Map.Entry.comparingByKey()))
            .forEach(e -> lines.add(String.format(Locale.ROOT, "%s: %,d", e.getKey(), e.getValue())));

        lines.add("Top " + topN + " titles by copies");
        Map<String, Integer> copiesByTitle = sales.stream()
            .collect(Collectors.toMap(Sale::title, Sale::qty, Integer::sum));
        List<Map.Entry<String, Integer>> top = copiesByTitle.entrySet().stream()
            .sorted(Map.Entry.<String, Integer>comparingByValue().reversed()
                .thenComparing(Map.Entry.comparingByKey()))
            .limit(topN)
            .toList();
        for (int i = 0; i < top.size(); i++) {
            lines.add((i + 1) + ". " + top.get(i).getKey() + ": " + top.get(i).getValue());
        }

        int copies = sales.stream().mapToInt(Sale::qty).sum();
        long revenue = sales.stream().mapToLong(Sale::revenue).sum();
        lines.add(String.format(Locale.ROOT, "Total: %,d copies, %,d VND", copies, revenue));
        return lines;
    }

    // ---------------------------------------------------------------- test runner (do not change)
    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        List<String> rows = input.lines().map(String::strip).filter(line -> !line.isEmpty()).toList();
        int topN = Integer.parseInt(rows.get(0).substring("TOP ".length()).strip());
        List<Sale> sales = new ArrayList<>();
        for (String row : rows.subList(1, rows.size())) {
            String[] f = row.split(";");
            sales.add(new Sale(f[0], f[1], f[2], f[3], Integer.parseInt(f[4]), Long.parseLong(f[5])));
        }
        try {
            for (String line : report(sales, topN)) {
                System.out.println(line);
            }
        } catch (RuntimeException e) {
            System.out.println("error: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }
}
