// Wrong: hashCode is fine, but equals compares the ISBN strings with ==, and strings read from input are never the same object.
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Mekong Books cart: merge cart lines by book.
 *
 * The cart keeps one line per book: a LinkedHashMap from a BookKey to the quantity, so the
 * lines stay in the order the books were first added. An ISBN can arrive with or without
 * hyphens ("978-604-1-23456-7" and "9786041234567" are the same book), so BookKey stores the
 * ISBN with the hyphens removed.
 *
 * Input (stdin): one command per line.
 *   add ISBN QTY      add QTY copies of the book (QTY > 0)
 *   remove ISBN QTY   take QTY copies out; when the quantity reaches 0 or less, the line is
 *                     removed; removing a book that is not in the cart does nothing
 *   count ISBN        print "count ISBN: N" (ISBN exactly as typed, N = 0 if not in the cart)
 *
 * After the last command the runner prints the cart:
 *   cart:
 *   ISBN x QTY        one line per book, ISBN without hyphens, in first-added order
 *   lines: L, books: B
 *
 * Example input:
 *   add 978-604-1-23456-7 2
 *   add 9786041234567 1
 *   count 978-604-1-23456-7
 * Expected output:
 *   count 978-604-1-23456-7: 3
 *   cart:
 *   9786041234567 x 3
 *   lines: 1, books: 3
 *
 * The bug: the same book shows up as several lines, count prints 0 and remove does nothing.
 * Fix BookKey (and whatever in Cart has to change with it). Do not change the test runner.
 */
public class Main {

    static class BookKey {
        private final String isbn;

        BookKey(String isbn) {
            this.isbn = isbn.replace("-", "");
        }

        String getIsbn() {
            return isbn;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof BookKey other)) return false;
            return isbn == other.isbn;
        }

        @Override
        public int hashCode() {
            return isbn.hashCode();
        }
    }

    static class Cart {
        private final Map<BookKey, Integer> lines = new LinkedHashMap<>();

        void add(String isbn, int qty) {
            lines.merge(new BookKey(isbn), qty, Integer::sum);
        }

        void remove(String isbn, int qty) {
            BookKey key = new BookKey(isbn);
            Integer current = lines.get(key);
            if (current == null) {
                return;
            }
            if (current - qty <= 0) {
                lines.remove(key);
            } else {
                lines.put(key, current - qty);
            }
        }

        int count(String isbn) {
            return lines.getOrDefault(new BookKey(isbn), 0);
        }

        List<String> report() {
            List<String> out = new ArrayList<>();
            int books = 0;
            for (Map.Entry<BookKey, Integer> line : lines.entrySet()) {
                out.add(line.getKey().getIsbn() + " x " + line.getValue());
                books += line.getValue();
            }
            out.add("lines: " + lines.size() + ", books: " + books);
            return out;
        }
    }

    // ---------------------------------------------------------------- test runner (do not change)
    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        Cart cart = new Cart();
        for (String raw : input.split("\n")) {
            String line = raw.strip();
            if (line.isEmpty()) {
                continue;
            }
            String[] parts = line.split("\\s+");
            try {
                switch (parts[0]) {
                    case "add" -> cart.add(parts[1], Integer.parseInt(parts[2]));
                    case "remove" -> cart.remove(parts[1], Integer.parseInt(parts[2]));
                    case "count" -> System.out.println("count " + parts[1] + ": " + cart.count(parts[1]));
                    default -> System.out.println("unknown command: " + line);
                }
            } catch (RuntimeException e) {
                System.out.println("error: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            }
        }
        System.out.println("cart:");
        try {
            for (String out : cart.report()) {
                System.out.println(out);
            }
        } catch (RuntimeException e) {
            System.out.println("error: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }
}
