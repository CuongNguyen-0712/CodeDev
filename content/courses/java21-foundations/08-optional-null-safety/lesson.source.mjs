// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-javaf-3-2",
    title: "Optional & null safety",
    slug: { _type: "slug", current: "java-optional-null-safety-order-page" },
    description:
        "The Mekong Books order page crashed with NullPointerException on a delisted ISBN and on a customer without an address. A teammate switched the lookups to Optional and called get() everywhere, and the page crashed with NoSuchElementException instead. Learn where nulls come from, how to read Java's helpful NullPointerException messages, how to reject null at the boundary with Objects.requireNonNull, and how to use Optional properly: ofNullable, map, flatMap, filter, orElse versus orElseGet, orElseThrow and ifPresentOrElse.",
    estimatedTime: 22,

    scenario: {
        role: "Junior backend developer, Mekong Books order page",
        problem:
            "The order page shows each book with its price and the shipping city. Since a batch of books was delisted and a new sign-up form let customers skip the address, the page fails for some orders with NullPointerException. The first fix replaced the nulls with Optional and unwrapped every value with get(). The page still fails for the same orders, now with java.util.NoSuchElementException: No value present.",
    },

    content: [
        h2("1. The incident: one missing book, one missing address"),
        p("The order page of Mekong Books asks `OrderService` for a short summary line for every book in the cart: the price and the city the parcel goes to. The catalog is a `Map` from ISBN to `Book`, loaded from the database, and every `Customer` record has an `Address`:"),
        code("java", `
import java.util.Map;

record Book(String isbn, String title, long price) {}
record Address(String street, String city) {}
record Customer(String id, String name, Address address) {}

public class OrderService {
    private final Map<String, Book> catalog;   // ISBN -> book, loaded from the database

    OrderService(Map<String, Book> catalog) {
        this.catalog = catalog;
    }

    String orderSummary(String isbn, Customer customer) {
        long price = catalog.get(isbn).price();
        String city = customer.address().city().toUpperCase();
        return "%,d VND, ship to %s".formatted(price, city);
    }
}`, "OrderService.java"),
        p("It worked for months. Then two things changed in the same week. The purchasing team **delisted** 40 old titles, so their ISBNs disappeared from the catalog while they were still sitting in some carts. And the new sign-up form let customers save an account **without an address**, to fill it in at checkout. Both kinds of order now break the page."),

        h2("2. Reproduce it"),
        p("One file is enough. The records are top-level types after `Main` (package-private, so they can share the file), which keeps their names short in the error message:"),
        code("java", `
import java.util.Map;

public class Main {
    static final Map<String, Book> catalog = Map.of(
            "9786041234567", new Book("9786041234567", "Clean Code", 250_000));

    static String orderSummary(String isbn, Customer customer) {
        long price = catalog.get(isbn).price();
        String city = customer.address().city().toUpperCase();
        return "%,d VND, ship to %s".formatted(price, city);
    }

    public static void main(String[] args) {
        var an = new Customer("C-01", "Nguyen Van An", new Address("12 Tran Phu", "Da Nang"));
        var binh = new Customer("C-17", "Tran Thi Binh", null);
        System.out.println(orderSummary("9786041234567", an));
        try {
            orderSummary("9786041234567", binh);
        } catch (NullPointerException e) {
            System.out.println(e.getMessage());
        }
        System.out.println(orderSummary("9786040000000", an));
    }
}

record Book(String isbn, String title, long price) {}
record Address(String street, String city) {}
record Customer(String id, String name, Address address) {}`, "Main.java"),
        p("Output of `javac Main.java && java Main`:"),
        code("text", `
250,000 VND, ship to DA NANG
Cannot invoke "Address.city()" because the return value of "Customer.address()" is null
Exception in thread "main" java.lang.NullPointerException: Cannot invoke "Book.price()" because the return value of "java.util.Map.get(Object)" is null
	at Main.orderSummary(Main.java:8)
	at Main.main(Main.java:22)`),
        p("Customer C-17 has no address, so `customer.address()` returns `null` and calling `.city()` on it fails. ISBN `9786040000000` is not in the map, so `catalog.get(isbn)` returns `null` and calling `.price()` on it fails. A teammate fixed it the same afternoon: the lookups now return `Optional`, a box that may or may not hold a value. But every caller opens the box with `get()`:"),
        code("java", `
static Optional<Book> bookByIsbn(String isbn) {
    return Optional.ofNullable(catalog.get(isbn));
}

static Optional<Address> addressOf(Customer c) {
    return Optional.ofNullable(c.address());
}

static String orderSummary(String isbn, Customer customer) {
    long price = bookByIsbn(isbn).get().price();
    String city = addressOf(customer).get().city().toUpperCase();
    return "%,d VND, ship to %s".formatted(price, city);
}

// orderSummary("9786040000000", an):
// Exception in thread "main" java.util.NoSuchElementException: No value present
// 	at java.base/java.util.Optional.get(Optional.java:143)
// 	at Main.orderSummary(Main.java:17)
// 	at Main.main(Main.java:24)`, "Main.java"),
        p("Same orders, same crash, different exception. `get()` means \"I am sure there is a value\", which is exactly the assumption that was wrong. `Optional` only helps when the code says what should happen **when the box is empty**. The rest of this lesson is about that, starting with where the nulls come from."),

        h2("3. Where nulls come from, and how to read the message"),
        p("`null` is the value of a reference variable that points to no object. Calling a method on it, reading a field of it, or unboxing it (turning an `Integer` or `Long` into an `int` or `long`) throws `NullPointerException` (NPE). Primitive types (`int`, `long`, `boolean`...) can never be `null`. In everyday backend code, nulls come from three places:"),
        code("java", String.raw`
import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class NullSources {
    static class Cart {
        String couponCode;       // a reference field nobody assigned: null
        List<String> isbns;      // also null - not an empty list
        int itemCount;           // primitive fields start at 0, never null
    }

    public static void main(String[] args) throws IOException {
        Map<String, Integer> stock = new HashMap<>();
        stock.put("9786041234567", 12);
        System.out.println(stock.get("9786040000000"));        // null: no such key

        Cart cart = new Cart();
        System.out.println(cart.couponCode + " " + cart.isbns + " " + cart.itemCount);

        BufferedReader in = new BufferedReader(new StringReader("BOOK10\n"));
        System.out.println(in.readLine());                       // BOOK10
        System.out.println(in.readLine());                       // null: end of input
        System.out.println(System.getenv("MEKONG_SHIPPING_ZONE")); // null: not set

        if (args.length > 0) { int left = stock.get("9786040000000"); System.out.println(left); }
        cart.isbns.add("9786041234567");
    }
}

// null
// null null 0
// BOOK10
// null
// null
// Exception in thread "main" java.lang.NullPointerException: Cannot invoke "java.util.List.add(Object)" because "<local2>.isbns" is null
// 	at NullSources.main(NullSources.java:29)`, "NullSources.java"),
        bullets([
            "**Lookups that find nothing.** `Map.get` returns `null` for a missing key. So do many older APIs: `BufferedReader.readLine()` at the end of the input, `System.getenv` for a variable that is not set.",
            "**Fields nobody assigned.** A reference field that no constructor sets starts as `null`. `isbns` is not an empty list, it is no list at all.",
            "**External input.** Data from a database row, a JSON body or a CSV file can leave a value out: a customer without an address, a book whose price has not been entered yet.",
        ]),
        h3("Helpful NullPointerException messages"),
        p("Since Java 14 (and by default since Java 15) the JVM explains every NPE it throws itself. The message has two halves: **what** failed (`Cannot invoke \"java.util.List.add(Object)\"`) and **which expression** was `null` (`because \"<local2>.isbns\" is null`). For a chain like `catalog.get(isbn).price()`, it names the call that returned `null`: `because the return value of \"java.util.Map.get(Object)\" is null`. That is usually enough to find the bug without a debugger."),
        p("Local variables appear as `<local2>` because plain `javac` does not store their names in the class file. Compile with `javac -g` (Maven, Gradle and IDEs do this by default) and the same line says `because \"cart.isbns\" is null`. Unboxing has its own message. Run the program above with any argument and the `int left = stock.get(...)` line fails first:"),
        code("text", `
Exception in thread "main" java.lang.NullPointerException: Cannot invoke "java.lang.Integer.intValue()" because the return value of "java.util.Map.get(Object)" is null
	at NullSources.main(NullSources.java:28)`),
        callout("info", "The NPE is thrown where the null is used, not where it was born",
            "The message points at the line that called a method on null. The bug is often far away: the place that stored null in a field, or the method that returned null instead of a value. The next two sections deal with both ends."),

        h2("4. Stop null at the door: Objects.requireNonNull"),
        p("Some values must never be missing: a `Book` without an ISBN or a title is not a book. For those, fail **immediately**, at the boundary where the value enters your object, with a message that names the field. `Objects.requireNonNull(value, \"message\")` returns the value when it is not `null` and throws `NullPointerException` with your message when it is. In a record, put the checks in the **compact constructor** (lesson Classes, records & equals/hashCode): it runs before the fields are assigned."),
        code("java", `
import java.util.Objects;

public class Main {
    record Book(String isbn, String title, long price) {
        Book {
            Objects.requireNonNull(isbn, "isbn must not be null");
            Objects.requireNonNull(title, "title must not be null");
            if (price < 0) throw new IllegalArgumentException("price must be >= 0, got " + price);
        }
    }

    static class ShippingLabel {
        private final String customerId;
        private final String city;

        ShippingLabel(String customerId, String city) {
            this.customerId = Objects.requireNonNull(customerId, "customerId");
            this.city = Objects.requireNonNull(city, "city");
        }
        String text() { return customerId + " -> " + city; }
    }

    public static void main(String[] args) {
        System.out.println(new Book("9786041234567", "Clean Code", 250_000));
        System.out.println(new ShippingLabel("C-01", "DA NANG").text());
        System.out.println(Objects.requireNonNullElse(System.getenv("MEKONG_SHIPPING_ZONE"), "SOUTH"));
        try { new ShippingLabel("C-17", null); } catch (NullPointerException e) { System.out.println(e); }
        new Book("9786041234567", null, 250_000);
    }
}

// Book[isbn=9786041234567, title=Clean Code, price=250000]
// C-01 -> DA NANG
// SOUTH
// java.lang.NullPointerException: city
// Exception in thread "main" java.lang.NullPointerException: title must not be null
// 	at java.base/java.util.Objects.requireNonNull(Objects.java:259)
// 	at Main$Book.<init>(Main.java:7)
// 	at Main.main(Main.java:28)`, "Main.java"),
        bullets([
            "**The crash moves to the cause.** Without the check, the `null` title would sit in the object until some report calls `title().length()`, maybe hours later in another class. With it, the stack trace points at the line that built the bad `Book`.",
            "**Classes too.** In a normal constructor, `this.city = Objects.requireNonNull(city, \"city\")` checks and assigns in one line.",
            "**A default instead of a crash.** `Objects.requireNonNullElse(value, fallback)` returns the fallback when the value is `null`: right for an optional setting such as a shipping zone, wrong for a required field.",
        ]),
        p("`requireNonNull` is for values that **must** exist. A customer address that may legitimately be missing needs a different tool: a return type that says \"maybe\"."),

        h2("5. Optional: a return type that says \"maybe absent\""),
        p("`java.util.Optional<T>` is a small, read-only box that holds either one value of type `T` or nothing. A method that returns `Optional<Customer>` tells every caller, in its signature, that there might be no customer, and the compiler stops them from calling `name()` on the box directly. You create one in three ways:"),
        bullets([
            "`Optional.ofNullable(x)` - a box with `x`, or an empty box if `x` is `null`. Use it to wrap anything that **may** be `null`, such as the result of `Map.get`.",
            "`Optional.of(x)` - a box with `x`. If `x` is `null`, it throws `NullPointerException` right away (with no message: `java.lang.NullPointerException` thrown from `Optional.of(Optional.java:113)`). Use it only for a value you know is there.",
            "`Optional.empty()` - an empty box.",
        ]),
        code("java", `
record Address(String street, String city) {}
record Customer(String id, String name, Address address) {
    Optional<Address> shippingAddress() { return Optional.ofNullable(address); }
}

static final Map<String, Customer> customersById = Map.of(
        "C-01", new Customer("C-01", "Nguyen Van An", new Address("12 Tran Phu", "Da Nang")),
        "C-17", new Customer("C-17", "Tran Thi Binh", null),
        "C-20", new Customer("C-20", "Le Van Cuong", new Address("5 Le Loi", null)));

static Optional<Customer> customerById(String id) {
    return Optional.ofNullable(customersById.get(id));
}

System.out.println(customerById("C-01"));
// Optional[Customer[id=C-01, name=Nguyen Van An, address=Address[street=12 Tran Phu, city=Da Nang]]]
System.out.println(customerById("C-99"));                                   // Optional.empty
System.out.println(customerById("C-99").isEmpty() + " " + customerById("C-01").isPresent()); // true true`),
        p("The record keeps a plain, nullable `address` field and adds a small method that returns it wrapped. That is the usual shape: `Optional` goes on what a method **returns**, not on what an object **stores** (more on that in section 7)."),
        h3("map, flatMap, filter: work on the value without unwrapping it"),
        p("The point of the box is that you can transform what is inside without opening it. Each of these methods runs your function only when there is a value; on an empty box it does nothing and returns an empty box:"),
        bullets([
            "**`map(f)`** - applies `f` to the value and boxes the result: `Optional<Customer>` -> `map(Customer::name)` -> `Optional<String>`. If `f` returns `null`, the result is an empty box, not a crash.",
            "**`flatMap(f)`** - for a function that **already returns an Optional**. `map` would give you a box in a box, `Optional<Optional<Address>>`; `flatMap` gives `Optional<Address>`.",
            "**`filter(test)`** - keeps the value only if the test is true, otherwise the box becomes empty. Use it for \"present but not usable\", such as a blank city or a price of 0.",
        ]),
        code("java", `
System.out.println(customerById("C-01").map(Customer::name));         // Optional[Nguyen Van An]
System.out.println(customerById("C-99").map(Customer::name));         // Optional.empty
System.out.println(customerById("C-20").map(Customer::address).map(Address::city)); // Optional.empty

System.out.println(customerById("C-01").map(Customer::shippingAddress));
// Optional[Optional[Address[street=12 Tran Phu, city=Da Nang]]]
System.out.println(customerById("C-01").flatMap(Customer::shippingAddress));
// Optional[Address[street=12 Tran Phu, city=Da Nang]]

System.out.println(Optional.of(250_000L).filter(p -> p > 0));         // Optional[250000]
System.out.println(Optional.of(0L).filter(p -> p > 0));               // Optional.empty

for (String id : List.of("C-01", "C-17", "C-20", "C-99")) {
    String city = customerById(id)
            .flatMap(Customer::shippingAddress)
            .map(Address::city)
            .filter(c -> !c.isBlank())
            .map(String::toUpperCase)
            .orElse("(no city)");
    System.out.println(id + " " + city);
}
// C-01 DA NANG
// C-17 (no city)
// C-20 (no city)
// C-99 (no city)`),
        p("Read the chain from top to bottom as a pipe. For C-01 the value flows through every step. For C-17 the box becomes empty at `flatMap` (no address), for C-20 at `map(Address::city)` (the city is `null`), for C-99 at the very first step. Once empty, every later step is skipped, and only the last call decides what you get."),
        image("optional-chain-pipe", {
            alt: "Diagram with two panels. Top, red: the null chain customer.address().city().toUpperCase() for customer C-17, who has no address. customer C-17 flows to .address(), which returns null; calling .city() on null throws NullPointerException: Cannot invoke \"Address.city()\" because the return value of \"Customer.address()\" is null, and .toUpperCase() never runs. Bottom, green: the Optional chain customerById(id), flatMap(shippingAddress), map(Address::city), map(String::toUpperCase), orElse(\"(no city)\") for three customers. C-01 flows through every step: Customer, Address, \"Da Nang\", \"DA NANG\", and the result is \"DA NANG\". C-17 becomes empty at flatMap, skips both map steps and orElse gives \"(no city)\". C-99 is empty from customerById, skips flatMap and both maps, and orElse gives \"(no city)\". Footer: map, flatMap and filter only touch a present value; an empty Optional passes through untouched, and orElse gives the answer.",
            caption: "Plain calls crash on the first null. An Optional chain lets an empty value skip every step and reach orElse.",
        }),

        h2("6. Getting the value out: orElse, orElseGet, orElseThrow, ifPresentOrElse"),
        p("At the end of a chain you leave the box and decide what happens when it is empty:"),
        bullets([
            "**`orElse(value)`** - the value inside, or `value` if empty.",
            "**`orElseGet(() -> ...)`** - the value inside, or the result of calling the function if empty. The function runs **only** when the box is empty.",
            "**`orElseThrow()`** - the value inside, or `NoSuchElementException: No value present`. It does the same as `get()`, but the name says out loud that it can throw. `orElseThrow(() -> new IllegalArgumentException(\"unknown customer C-99\"))` throws your own exception instead (exceptions in depth: lesson Exceptions & try-with-resources).",
            "**`ifPresentOrElse(action, emptyAction)`** - runs one of two pieces of code; returns nothing.",
        ]),
        code("java", `
customerById("C-17").ifPresentOrElse(
        c -> System.out.println("found " + c.name()),
        () -> System.out.println("no such customer"));     // found Tran Thi Binh
customerById("C-99").ifPresentOrElse(
        c -> System.out.println("found " + c.name()),
        () -> System.out.println("no such customer"));     // no such customer

customerById("C-99").orElseThrow();
// java.util.NoSuchElementException: No value present
customerById("C-99").orElseThrow(() -> new IllegalArgumentException("unknown customer C-99"));
// java.lang.IllegalArgumentException: unknown customer C-99`),
        h3("orElse is eager, orElseGet is lazy"),
        p("`orElse(x)` is an ordinary method call, so Java evaluates its argument **before** calling it, whether the box is empty or not. When the argument is a constant like `\"(no city)\"` that costs nothing. When it is a method call with a cost or a side effect - an HTTP request to a supplier, a database query, a counter - it runs every time:"),
        code("java", `
import java.util.Optional;

public class Main {
    static int supplierCalls = 0;

    static long supplierPrice(String isbn) {
        supplierCalls++;
        System.out.println("  calling the supplier for " + isbn);
        return 180_000;
    }

    public static void main(String[] args) {
        Optional<Long> ownPrice = Optional.of(250_000L);

        long a = ownPrice.orElse(supplierPrice("9786041234567"));
        System.out.println("orElse: " + a + ", supplier calls: " + supplierCalls);

        long b = ownPrice.orElseGet(() -> supplierPrice("9786041234567"));
        System.out.println("orElseGet: " + b + ", supplier calls: " + supplierCalls);

        long c = Optional.<Long>empty().orElseGet(() -> supplierPrice("9786040000002"));
        System.out.println("orElseGet on empty: " + c + ", supplier calls: " + supplierCalls);
    }
}

//   calling the supplier for 9786041234567
// orElse: 250000, supplier calls: 1
// orElseGet: 250000, supplier calls: 1
//   calling the supplier for 9786040000002
// orElseGet on empty: 180000, supplier calls: 2`, "Main.java"),
        p("The book had its own price, so the result of `orElse` was right - but the supplier was called anyway, and its answer thrown away. `orElseGet` received a **lambda** (a small function, written `() -> ...`) instead of a value, and only called it when the box was empty. Rule of thumb: constants go in `orElse`, anything that does work goes in `orElseGet`."),

        h2("7. Rules for using Optional well"),
        numbered([
            "**Use `Optional` as a return type for lookups that may find nothing**: `bookByIsbn`, `customerById`, `latestOrder`. That is what it was designed for.",
            "**Never return `null` from a method declared to return `Optional`.** Callers will not check for it - the whole point is that they do not have to - so their first `.map` throws NPE. Return `Optional.empty()`.",
            "**Do not use `Optional` for fields or parameters.** A field can stay nullable inside the class, with a method that returns `Optional` (like `shippingAddress()` above). A parameter of type `Optional<String>` forces every caller to wrap values and can itself be `null`; write two methods or accept a nullable value and check it. `Optional` is also not `Serializable`, so it does not belong in data objects that are sent or stored.",
            "**Do not wrap collections.** \"No orders\" is an empty list, not an empty `Optional<List<Order>>` and never `null`. Callers can loop over an empty list without any check.",
            "**For a map with a sensible default, use `getOrDefault`** instead of `get` plus a null check.",
            "**Prefer `map` / `flatMap` / `filter` / `orElse...` over `isPresent()` + `get()`.** The pair works, but every `get()` is a promise you have to keep by hand on every path.",
        ]),
        code("java", `
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class Main {
    record Order(String id, String customerId) {}

    static final Map<String, List<Order>> ordersByCustomer = Map.of(
            "C-01", List.of(new Order("MB-1001", "C-01"), new Order("MB-1002", "C-01")));
    static final Map<String, Integer> stock = Map.of("9786041234567", 12);

    static List<Order> ordersOf(String customerId) {
        return ordersByCustomer.getOrDefault(customerId, List.of());
    }

    static Optional<Order> latestOrder(String customerId) {
        List<Order> orders = ordersOf(customerId);
        return orders.isEmpty() ? Optional.empty() : Optional.of(orders.getLast());
    }

    public static void main(String[] args) {
        System.out.println(ordersOf("C-01").size() + " " + ordersOf("C-17").size());
        for (Order o : ordersOf("C-17")) System.out.println(o);    // loop runs 0 times
        System.out.println(latestOrder("C-01"));
        System.out.println(latestOrder("C-17"));
        System.out.println(stock.getOrDefault("9786040000000", 0));
    }
}

// 2 0
// Optional[Order[id=MB-1002, customerId=C-01]]
// Optional.empty
// 0`, "Main.java"),
        callout("tip", "Optional.of or Optional.ofNullable?",
            "Ask where the value comes from. Something you just created, or a value you already checked, can use Optional.of. Anything from Map.get, a nullable field, a database row or user input must use Optional.ofNullable - otherwise you have turned a missing value back into a NullPointerException."),

        h2("8. Fix the order page lookups"),
        p("Time to fix the teammate's version properly. The challenge gives you the order page as a small program: a catalog with a delisted ISBN, books whose price is missing or 0, customers without an address or without a city, and a slow supplier price lookup that is counted. The buggy code returns `Optional` from the lookups and unwraps everything with `get()`, so it crashes on exactly the orders from the incident."),
        challenge("chal_fix_javaf_321", "Make each lookup return a box that can be empty, and build the city and the price as Optional chains instead of unwrapping. Check which fallback runs eagerly: the supplier counter must only go up for a book that really has no usable price, on a line that prints a price."),

        h2("9. The fix"),
        p("Back in `OrderService`, the summary now handles both holes in the data. A missing customer is a programming error, so it is rejected at the boundary; a missing address and a delisted book are normal and get a line the page can show:"),
        code("java", `
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

public class Main {
    static final Map<String, Book> catalog = Map.of(
            "9786041234567", new Book("9786041234567", "Clean Code", 250_000));

    static Optional<Book> bookByIsbn(String isbn) {
        return Optional.ofNullable(catalog.get(isbn));
    }

    static Optional<String> cityFor(Customer customer) {
        return customer.shippingAddress()
                .map(Address::city)
                .filter(city -> !city.isBlank())
                .map(String::toUpperCase);
    }

    static String orderSummary(String isbn, Customer customer) {
        Objects.requireNonNull(customer, "customer");
        String shipTo = cityFor(customer).orElse("(ask for an address)");
        return bookByIsbn(isbn)
                .map(book -> "%s: %,d VND, ship to %s".formatted(book.title(), book.price(), shipTo))
                .orElse(isbn + ": no longer sold");
    }

    public static void main(String[] args) {
        var an = new Customer("C-01", "Nguyen Van An", new Address("12 Tran Phu", "Da Nang"));
        var binh = new Customer("C-17", "Tran Thi Binh", null);
        System.out.println(orderSummary("9786041234567", an));
        System.out.println(orderSummary("9786041234567", binh));
        System.out.println(orderSummary("9786040000000", an));
    }
}

record Book(String isbn, String title, long price) {}
record Address(String street, String city) {}
record Customer(String id, String name, Address address) {
    Optional<Address> shippingAddress() {
        return Optional.ofNullable(address);
    }
}

// Clean Code: 250,000 VND, ship to DA NANG
// Clean Code: 250,000 VND, ship to (ask for an address)
// 9786040000000: no longer sold`, "Main.java"),
        numbered([
            "**`bookByIsbn` returns `Optional<Book>`** built with `ofNullable`, so a delisted ISBN is an empty box, not a `null` that escapes.",
            "**`cityFor` is one chain.** No address, no city, or a blank city all end as an empty `Optional<String>`; no step can see a `null`.",
            "**Every `Optional` is closed with `orElse`**, which says what the page shows when the value is missing. There is no `get()` left.",
            "**`requireNonNull(customer, ...)`** keeps the one value that must exist strict: a `null` customer is a bug in the caller, and the message names it.",
        ]),

        h2("10. Pitfalls"),
        bullets([
            "**`get()` and `orElseThrow()` without a check are the same crash with a new name.** `NoSuchElementException: No value present` is the `Optional` version of an NPE.",
            "**`Optional.of(map.get(key))` throws NPE for a missing key.** Wrap possibly-null values with `ofNullable`.",
            "**`orElse(someCall())` always runs `someCall()`.** For anything slow, counted or with side effects, use `orElseGet(() -> someCall())`.",
            "**Unboxing a missing value throws too.** `int left = stock.get(isbn)` with an `Integer` map fails with `Cannot invoke \"java.lang.Integer.intValue()\"` when the key is missing. Use `getOrDefault` or keep the boxed type until you have checked it.",
            "**A method declared `Optional` that returns `null`** defeats the type and crashes the caller's first `.map`. Return `Optional.empty()`.",
            "**`Optional` fields, parameters and `Optional<List<...>>`** add wrapping without adding safety. Keep fields nullable and private, and return empty collections.",
            "**`isPresent()` + `get()` pairs** look safe but are easy to get wrong on one path, for example checking the address and forgetting that its city can be `null`. A `map` chain covers every step.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Every `Map.get`, nullable field, `readLine()`, `getenv` and external value is either checked or wrapped with `Optional.ofNullable` before use.",
            "Required constructor arguments are checked with `Objects.requireNonNull(x, \"name\")` (records: in the compact constructor).",
            "Lookups that may find nothing return `Optional<T>`, never `null`; collections return an empty list, never `null`.",
            "Chains use `map` for plain functions, `flatMap` for functions that return `Optional`, `filter` for \"present but unusable\".",
            "Every `Optional` ends in `orElse` (constants), `orElseGet` (work or side effects), `orElseThrow` (a real error) or `ifPresentOrElse`.",
            "No `get()` remains, and `Optional` is not used for fields or parameters.",
            "You can read a helpful NPE message: what was called, and which expression was `null`.",
        ]),
    ],
});
