// Wrong: orElse(supplierPrice(...)) runs the supplier call for EVERY book, so the fallback counter also counts books that have a price.
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Mekong Books order page: one line per (ISBN, customer) query.
 *
 * The data is incomplete, like real data:
 *   - an ISBN may not be in the catalog (the book was delisted),
 *   - a book's price may be missing (null) or 0 (a placeholder from data entry),
 *   - a customer id may be unknown,
 *   - a customer may have no address (null), or an address without a city (null).
 *
 * Methods to fix:
 *   Optional<Book> findBook(String isbn)              the book, or empty when the ISBN is not in the catalog
 *   Optional<Customer> findCustomer(String id)        the customer, or empty when the id is unknown
 *   Optional<String> shippingCity(Customer customer)  the city in UPPER CASE, or empty when there is no
 *                                                     address or the address has no city
 *   long priceOf(Book book)                           the book's own price when it is set and above 0;
 *                                                     otherwise supplierPrice(isbn) (see below)
 *   String describe(String isbn, String customerId)   the output line for one query
 *
 * Output line for one query, checked in this order (the first rule that applies wins):
 *   1. ISBN not in the catalog      -> "<isbn>: not in catalog"
 *   2. customer id unknown          -> "<customerId>: unknown customer"
 *   3. no shipping city             -> "<customerId>: no shipping city"
 *   4. otherwise                    -> "<title>: <price with , separators> VND, ship to <CITY>"
 *
 * supplierPrice(isbn) (in the runner) asks the supplier for a list price. It is slow (an HTTP call in
 * production) and counts every call in fallbackLookups, which the runner prints as the last line.
 * The counter must count only real fallbacks: call supplierPrice only for a book whose own price is
 * missing or 0, and only when rule 4 prints a price line. The SUPPLIER section lists every book.
 *
 * Nothing may crash: no NullPointerException, no NoSuchElementException.
 *
 * Example: catalog 9786041234567 = Clean Code, 250000; customer C-01 lives in Da Nang, C-17 has no address.
 *   9786041234567 C-01  -> Clean Code: 250,000 VND, ship to DA NANG
 *   9786040000000 C-01  -> 9786040000000: not in catalog
 *   9786041234567 C-17  -> C-17: no shipping city
 *   last line           -> fallback price lookups: 0
 */
public class Main {
    record Book(String isbn, String title, Long price) {}          // price: null when not set yet
    record Address(String street, String city) {}                  // city: may be null
    record Customer(String id, String name, Address address) {}    // address: may be null

    static Optional<Book> findBook(String isbn) {
        return Optional.ofNullable(catalog.get(isbn));
    }

    static Optional<Customer> findCustomer(String id) {
        return Optional.ofNullable(customers.get(id));
    }

    static Optional<String> shippingCity(Customer customer) {
        return Optional.ofNullable(customer.address())
                .map(Address::city)
                .map(String::toUpperCase);
    }

    static long priceOf(Book book) {
        return Optional.ofNullable(book.price())
                .filter(price -> price > 0)
                .orElse(supplierPrice(book.isbn()));
    }

    static String describe(String isbn, String customerId) {
        Optional<Book> book = findBook(isbn);
        if (book.isEmpty()) {
            return isbn + ": not in catalog";
        }
        Optional<Customer> customer = findCustomer(customerId);
        if (customer.isEmpty()) {
            return customerId + ": unknown customer";
        }
        return customer.flatMap(Main::shippingCity)
                .map(city -> String.format(Locale.ROOT, "%s: %,d VND, ship to %s",
                        book.orElseThrow().title(), priceOf(book.orElseThrow()), city))
                .orElse(customerId + ": no shipping city");
    }

    // ---------------------------------------------------------------- test runner (do not change)
    // Input (stdin): four sections, each starting with its header line.
    //   BOOKS       isbn;title;price        (price empty = not set)
    //   SUPPLIER    isbn;price
    //   CUSTOMERS   id;name                 (no address)
    //               id;name;street;city     (city empty = no city)
    //   QUERIES     isbn customerId
    // Prints describe(isbn, customerId) for every query, then "fallback price lookups: N".
    static final Map<String, Book> catalog = new HashMap<>();
    static final Map<String, Customer> customers = new HashMap<>();
    static final Map<String, Long> supplierPrices = new HashMap<>();
    static int fallbackLookups = 0;

    static long supplierPrice(String isbn) {
        fallbackLookups++;
        return supplierPrices.get(isbn);
    }

    static String field(String[] parts, int i) {
        if (i >= parts.length) return null;
        String value = parts[i].strip();
        return value.isEmpty() ? null : value;
    }

    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        String section = "";
        for (String raw : input.split("\n")) {
            String line = raw.strip();
            if (line.isEmpty()) continue;
            if (line.equals("BOOKS") || line.equals("SUPPLIER") || line.equals("CUSTOMERS") || line.equals("QUERIES")) {
                section = line;
                continue;
            }
            String[] p = line.split(";", -1);
            switch (section) {
                case "BOOKS" -> {
                    String price = field(p, 2);
                    catalog.put(field(p, 0), new Book(field(p, 0), field(p, 1), price == null ? null : Long.valueOf(price)));
                }
                case "SUPPLIER" -> supplierPrices.put(field(p, 0), Long.valueOf(field(p, 1)));
                case "CUSTOMERS" -> {
                    Address address = p.length >= 3 ? new Address(field(p, 2), field(p, 3)) : null;
                    customers.put(field(p, 0), new Customer(field(p, 0), field(p, 1), address));
                }
                case "QUERIES" -> {
                    String[] q = line.split("\\s+");
                    try {
                        System.out.println(describe(q[0], q[1]));
                    } catch (RuntimeException e) {
                        System.out.println("error: " + e.getClass().getSimpleName() + ": " + e.getMessage());
                    }
                }
                default -> throw new IllegalStateException("line before any section: " + line);
            }
        }
        System.out.println("fallback price lookups: " + fallbackLookups);
    }
}
