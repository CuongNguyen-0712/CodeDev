// Wrong: the line counter is increased after the blank-line check, so blank lines are not counted and later errors name the wrong line.
import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Mekong Books: import the supplier price list (solution).
 * One bad line adds one "line N: reason" error; the import always reaches the end of the file.
 */
public class Main {
    record PriceLine(String isbn, long price) {}

    record ImportResult(Map<String, Long> prices, List<String> errors) {}

    /** Parses one non-blank line "isbn;price"; throws IllegalArgumentException with the reason. */
    static PriceLine parseLine(String line) {
        String[] parts = line.split(";");
        if (parts.length != 2 || parts[0].isBlank() || parts[1].isBlank()) {
            throw new IllegalArgumentException("expected isbn;price");
        }
        String priceText = parts[1].strip();
        long price;
        try {
            price = Long.parseLong(priceText);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("bad price \"" + priceText + "\"", e);
        }
        if (price <= 0) {
            throw new IllegalArgumentException("price must be positive, got " + price);
        }
        return new PriceLine(parts[0].strip(), price);
    }

    /** Reads the whole supplier file and returns the new prices and one error per bad line. */
    static ImportResult importPrices(BufferedReader reader) throws IOException {
        Map<String, Long> prices = new LinkedHashMap<>();
        List<String> errors = new ArrayList<>();
        int lineNo = 0;
        String line;
        while ((line = reader.readLine()) != null) {
            if (line.isBlank()) {
                continue;
            }
            lineNo++;
            try {
                PriceLine p = parseLine(line);
                prices.put(p.isbn(), p.price());
            } catch (IllegalArgumentException e) {
                errors.add("line " + lineNo + ": " + e.getMessage());
            }
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
