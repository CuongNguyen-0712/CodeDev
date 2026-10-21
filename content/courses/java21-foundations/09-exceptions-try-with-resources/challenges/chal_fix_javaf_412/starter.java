import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Mekong Books: import the supplier price list.
 *
 * Input (stdin): the supplier file, one entry per line, "isbn;price".
 *   - price is a whole number of VND, for example: 9786041234567;120000
 *   - spaces around the isbn and the price are allowed and ignored: "9786041234567 ; 120000 "
 *   - a blank line (empty, or only spaces) is skipped: no price and no error
 *
 * Today one bad line stops the whole import, every line after it keeps its old price, and the
 * summary says "errors: 0". Fix parseLine and importPrices so that:
 *   - every good line is imported, including the lines AFTER a bad one;
 *   - every bad line is NOT imported and adds exactly one error "line N: <reason>";
 *   - N is the line number in the file: the first line is 1, and blank lines are counted too.
 *
 * Reasons (exact text):
 *   expected isbn;price                  the line does not have exactly 2 fields separated by ";",
 *                                        or the isbn or the price is empty
 *   bad price "12O000"                   the price is not a whole number (the trimmed price text,
 *                                        in double quotes)
 *   price must be positive, got -5000    the price is a number but 0 or less
 *
 * Catch only the exceptions you expect (NumberFormatException, IllegalArgumentException) and only
 * around the work of ONE line. An unexpected bug must still crash loudly.
 * ImportResult.prices keeps the order of the file (LinkedHashMap); errors are in line order.
 *
 * Example input:
 *   9786041234567;120000
 *   9786049876543;85000
 *   9786043333333;12O000
 *
 *   9786045555555;-99000
 *   9786047777777 ; 150000
 *
 * Expected output (printed by the runner):
 *   updated: 3
 *   9786041234567 = 120000
 *   9786049876543 = 85000
 *   9786047777777 = 150000
 *   errors: 2
 *   line 3: bad price "12O000"
 *   line 5: price must be positive, got -99000
 */
public class Main {
    record PriceLine(String isbn, long price) {}

    record ImportResult(Map<String, Long> prices, List<String> errors) {}

    /** Parses one non-blank line "isbn;price". */
    static PriceLine parseLine(String line) {
        String[] parts = line.split(";");
        return new PriceLine(parts[0].strip(), Long.parseLong(parts[1].strip()));
    }

    /** Reads the whole supplier file and returns the new prices and one error per bad line. */
    static ImportResult importPrices(BufferedReader reader) throws IOException {
        Map<String, Long> prices = new LinkedHashMap<>();
        List<String> errors = new ArrayList<>();
        try {
            String line;
            while ((line = reader.readLine()) != null) {
                PriceLine p = parseLine(line);
                prices.put(p.isbn(), p.price());
            }
        } catch (Exception e) {
            // supplier files are messy, keep going
        }
        return new ImportResult(prices, errors);
    }

    // ---------------------------------------------------------------- test runner (do not change)
    // Reads the supplier file from stdin, runs importPrices and prints the summary.
    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);
        try (BufferedReader reader = new BufferedReader(new StringReader(input))) {
            ImportResult result = importPrices(reader);
            System.out.println("updated: " + result.prices().size());
            result.prices().forEach((isbn, price) -> System.out.println(isbn + " = " + price));
            System.out.println("errors: " + result.errors().size());
            result.errors().forEach(System.out::println);
        } catch (RuntimeException e) {
            System.out.println("error: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }
}
