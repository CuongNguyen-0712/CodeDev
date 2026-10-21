// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-javaf-2-1",
    title: "Choosing List, Set or Map",
    slug: { _type: "slug", current: "java-choosing-list-set-map" },
    description:
        "Mekong Books' nightly restock job crashed with ConcurrentModificationException, spent seconds on \"already ordered?\" checks and printed the bestseller report in a shuffled order. Learn when to use List, Set and Map, what order ArrayList, HashSet, LinkedHashSet, TreeSet, HashMap, LinkedHashMap and TreeMap promise, how to remove items while looping, and the Map methods that replace get-then-put code.",
    estimatedTime: 22,

    scenario: {
        role: "Junior backend developer, Mekong Books warehouse team",
        problem:
            "Every night a job takes sold-out books off the shelf list, orders them from the supplier unless they are already on today's order, and prints copies sold per category for the merchandising team. On Monday it crashed with ConcurrentModificationException. On Tuesday it finished but left a sold-out book on the shelf. Since the catalogue grew, the \"already ordered?\" check takes seconds, and the merchandising team complains that the report lists categories in a different order from the sales file.",
    },

    content: [
        h2("1. The incident: a restock job with three bugs"),
        p("Mekong Books keeps the books of the online shop in a list, one `Book` per ISBN with the copies left in the warehouse. After the last order of the day, a nightly job does three things: take sold-out books off the shelf list, order them from the supplier unless they are already on today's supplier order, and print copies sold per category for the merchandising team. This is the version in production:"),
        code("java", `
public class RestockJob {
    private final Supplier supplier;
    private final Report report;

    public void run(ArrayList<Book> shelf, ArrayList<String> orderedToday, ArrayList<Sale> sales) {
        // 1. Sold-out books leave the shelf and go on the supplier order
        for (Book book : shelf) {
            if (book.stock() == 0) {
                shelf.remove(book);
                if (!orderedToday.contains(book.isbn())) {   // "already ordered?"
                    orderedToday.add(book.isbn());
                    supplier.order(book.isbn(), 20);
                }
            }
        }

        // 2. Bestseller report: copies sold per category
        HashMap<String, Integer> soldByCategory = new HashMap<>();
        for (Sale sale : sales) {
            Integer old = soldByCategory.get(sale.category());
            soldByCategory.put(sale.category(), old == null ? sale.qty() : old + sale.qty());
        }
        for (String category : soldByCategory.keySet()) {
            report.line(category + " " + soldByCategory.get(category));
        }
    }
}`, "RestockJob.java"),
        p("Each part looks reasonable, and each one failed in its own way:"),
        bullets([
            "**Monday:** the first book on the shelf, `Tắt đèn`, was sold out. The job stopped with `java.util.ConcurrentModificationException`, nothing was ordered, and the shop showed sold-out books all day.",
            "**Tuesday:** the last two books were sold out. No exception this time, but `Dế Mèn phiêu lưu ký` stayed on the shelf with 0 copies and was never ordered.",
            "**Every night since the catalogue passed 20,000 titles:** the \"already ordered?\" step takes seconds instead of milliseconds, and it grows with the square of the catalogue size.",
            "**The report:** the sales file lists `fiction`, `children`, `business`, `comics`, in the order the shop's home page shows them. The report prints `business` first, and the merchandising team pastes it into the home page by hand.",
        ]),

        h2("2. Reproduce it"),
        p("Copy the loop into a small program and feed it the two nights. `Book` is a record (lesson \"Classes, records & equals/hashCode\"), so printing it shows every field:"),
        code("java", `
import java.util.*;

public class Main {
    record Book(String isbn, String title, int stock) {}

    // The loop from RestockJob, unchanged
    static void dropSoldOut(List<Book> shelf) {
        for (Book book : shelf) {
            if (book.stock() == 0) {
                shelf.remove(book);
            }
        }
    }

    public static void main(String[] args) {
        // Tuesday: only the last two books are sold out
        List<Book> tuesday = new ArrayList<>(List.of(
                new Book("9786041000011", "Tắt đèn", 4),
                new Book("9786041000028", "Số đỏ", 0),
                new Book("9786041000035", "Dế Mèn phiêu lưu ký", 0)));
        dropSoldOut(tuesday);
        System.out.println("Tuesday: " + tuesday);

        // The bestseller report, categories in the order the sales file lists them
        String[] sales = {"fiction 3", "children 2", "business 1", "comics 4"};
        Map<String, Integer> soldByCategory = new HashMap<>();
        for (String line : sales) {
            String[] parts = line.split(" ");
            Integer old = soldByCategory.get(parts[0]);
            int qty = Integer.parseInt(parts[1]);
            soldByCategory.put(parts[0], old == null ? qty : old + qty);
        }
        System.out.println("Report:  " + soldByCategory);

        // Monday: the first book is sold out
        List<Book> monday = new ArrayList<>(List.of(
                new Book("9786041000011", "Tắt đèn", 0),
                new Book("9786041000028", "Số đỏ", 5),
                new Book("9786041000035", "Dế Mèn phiêu lưu ký", 2)));
        dropSoldOut(monday);
        System.out.println("Monday:  " + monday);
    }
}`, "Main.java"),
        code("text", `
Tuesday: [Book[isbn=9786041000011, title=Tắt đèn, stock=4], Book[isbn=9786041000035, title=Dế Mèn phiêu lưu ký, stock=0]]
Report:  {business=1, fiction=3, children=2, comics=4}
Exception in thread "main" java.util.ConcurrentModificationException
	at java.base/java.util.ArrayList$Itr.checkForComodification(ArrayList.java:1095)
	at java.base/java.util.ArrayList$Itr.next(ArrayList.java:1049)
	at Main.dropSoldOut(Main.java:8)
	at Main.main(Main.java:40)`),
        p("Line 8 is the `for (Book book : shelf)` line, not the `remove` call: the exception comes from the **next** step of the loop, after the list was changed under it. On Tuesday there was no next step, which is why that run looked fine and silently skipped the last book. Section 5 explains both."),
        p("The slow check needs a bigger list. This program puts 20,000 ISBNs on today's order and checks 20,000 sold-out ISBNs that are not on it, first with `ArrayList.contains`, then with a `HashSet`:"),
        code("java", `
import java.util.*;

public class Main {
    public static void main(String[] args) {
        int n = 20_000;
        List<String> orderedToday = new ArrayList<>();
        for (int i = 0; i < n; i++) orderedToday.add("978604" + (1_000_000 + 2 * i));      // already on an order
        List<String> soldOut = new ArrayList<>();
        for (int i = 0; i < n; i++) soldOut.add("978604" + (1_000_000 + 2 * i + 1));       // not ordered yet

        long start = System.nanoTime();
        int misses = 0;
        for (String isbn : soldOut) {
            if (!orderedToday.contains(isbn)) misses++;
        }
        System.out.printf("ArrayList: %d misses in %d ms%n", misses, (System.nanoTime() - start) / 1_000_000);

        Set<String> orderedSet = new HashSet<>(orderedToday);
        start = System.nanoTime();
        misses = 0;
        for (String isbn : soldOut) {
            if (!orderedSet.contains(isbn)) misses++;
        }
        System.out.printf("HashSet:   %d misses in %d ms%n", misses, (System.nanoTime() - start) / 1_000_000);
    }
}

// On the course's (busy) test container:
// ArrayList: 20000 misses in 9226 ms
// HashSet:   20000 misses in 31 ms`, "Main.java"),
        p("Your times will differ; the gap will not. `ArrayList.contains` compares the ISBN with every element until it finds a match, so a miss costs 20,000 `equals` calls and 20,000 misses cost 400 million. Double the catalogue and the work is four times bigger. A `HashSet` jumps straight to the right place, so each check costs about the same at 20 or 20 million elements."),

        h2("3. Three interfaces, three questions"),
        p("The Java collections library (package `java.util`) is built around three **interfaces**. An interface is a list of methods a type promises to have; a **class** such as `ArrayList` provides the actual code. Pick the interface by the question your code asks:"),
        bullets([
            "**`List`**: \"what is item number i, in the order they came?\" Keeps every element, duplicates included, each at an index from 0. Typical: the lines of a cart, a scan log.",
            "**`Set`**: \"is this already in there?\" Keeps each element at most once; `add` of a duplicate does nothing and returns `false`. Typical: ISBNs already ordered, coupon codes already used.",
            "**`Map`**: \"what belongs to this key?\" Stores key -> value pairs with unique keys; `put` on an existing key replaces its value. Typical: ISBN -> price, category -> copies sold.",
        ]),
        code("java", `
import java.util.*;

public class Basics {
    public static void main(String[] args) {
        List<String> cart = new ArrayList<>();
        cart.add("9786041000011");
        cart.add("9786041000028");
        cart.add("9786041000011");                          // a second copy: duplicates are fine
        System.out.println(cart);                           // [9786041000011, 9786041000028, 9786041000011]
        System.out.println(cart.get(1));                    // 9786041000028
        System.out.println(cart.size());                    // 3

        Set<String> distinct = new HashSet<>(cart);
        System.out.println(distinct.size());                // 2
        System.out.println(distinct.add("9786041000028"));  // false (already there)
        System.out.println(distinct.contains("9786041000011")); // true

        Map<String, Long> price = new HashMap<>();
        price.put("9786041000011", 86_000L);
        price.put("9786041000028", 120_000L);
        price.put("9786041000011", 79_000L);                // same key: the old value is replaced
        System.out.println(price.get("9786041000011"));     // 79000
        System.out.println(price.get("9786041999999"));     // null (no such key)
        System.out.println(price.size());                   // 2
    }
}`, "Basics.java"),
        h3("Declare with the interface"),
        p("Write the interface on the left and the class only after `new`: `List<String> cart = new ArrayList<>();`, not `ArrayList<String> cart = ...`. Method parameters and return types should use the interface too (`List<Book> shelf`, `Map<String, Integer>`). Then switching `HashMap` to `LinkedHashMap` is a one-word change in one place, and callers can pass any list they have. The `<>` after the class name (the **diamond**) tells the compiler to copy the type arguments from the left side."),
        h3("Generics and autoboxing"),
        p("`<String>` and `<String, Long>` are **type arguments**: they tell the compiler what the collection holds, so `cart.add(42)` is a compile error and `cart.get(0)` is already a `String`. Collections only hold objects, never primitives: `List<int>` does not compile (`unexpected type ... required: reference, found: int`). Use the **wrapper classes** `Integer`, `Long`, `Double`, `Boolean`. Java converts between `int` and `Integer` for you: **autoboxing** when you put an `int` in, **unboxing** when you take it out."),
        code("java", `
import java.util.*;

public class Boxing {
    public static void main(String[] args) {
        List<Integer> quantities = new ArrayList<>();
        quantities.add(3);                  // autoboxing: int 3 -> Integer
        int first = quantities.get(0);      // unboxing: Integer -> int
        System.out.println(first + 1);      // 4

        Integer a = 100, b = 100;
        Integer c = 1000, d = 1000;
        System.out.println(a == b);         // true  (small values are cached)
        System.out.println(c == d);         // false (two different Integer objects)
        System.out.println(c.equals(d));    // true
    }
}`, "Boxing.java"),
        callout("warning", "Never compare Integer with ==",
            "== on two Integer objects compares references, like == on strings (lesson \"Types, strings & text blocks\"). Java caches the Integer objects for -128 to 127, so tests with small quantities pass and the bug appears with 1000 copies. Use equals, or unbox to int first."),

        h2("4. Iteration order: what each class promises"),
        p("All three Set classes and all three Map classes answer the same questions. What differs is the order you get when you loop over them, and that is exactly the bestseller-report bug:"),
        code("java", `
import java.util.*;

public class Order {
    public static void main(String[] args) {
        List<String> sold = List.of("fiction", "children", "business", "comics", "children");

        System.out.println(new HashSet<>(sold));       // [business, fiction, children, comics]
        System.out.println(new LinkedHashSet<>(sold)); // [fiction, children, business, comics]
        System.out.println(new TreeSet<>(sold));       // [business, children, comics, fiction]

        Map<String, Integer> byHash = new HashMap<>();
        Map<String, Integer> byInsertion = new LinkedHashMap<>();
        Map<String, Integer> sorted = new TreeMap<>();
        for (String category : sold) {
            byHash.merge(category, 1, Integer::sum);       // merge: section 6
            byInsertion.merge(category, 1, Integer::sum);
            sorted.merge(category, 1, Integer::sum);
        }
        System.out.println(byHash);      // {business=1, children=2, fiction=1, comics=1}
        System.out.println(byInsertion); // {fiction=1, children=2, business=1, comics=1}
        System.out.println(sorted);      // {business=1, children=2, comics=1, fiction=1}
    }
}`, "Order.java"),
        bullets([
            "**`HashSet` / `HashMap`** - fastest, and **no order promised**. They place elements by their `hashCode`, so the order looks random, can change when the collection grows, and can differ between Java versions. Look at the output above: the `HashSet` lists `fiction` before `children`, the `HashMap` with the same four keys lists `children` before `fiction`, because the two keys share a slot and `merge` adds a new key in front of the ones already there. Fine for lookups, wrong for anything a human reads in order.",
            "**`LinkedHashSet` / `LinkedHashMap`** - just as fast, and they also remember **insertion order**: the order elements (or keys) were first added. Putting an existing key again keeps its original position.",
            "**`TreeSet` / `TreeMap`** - keep elements (or keys) **sorted**, here alphabetically because `String` compares that way. Lookups are O(log n): a little slower than hashing, still fast.",
            "**`ArrayList`** - the order you added, with fast `get(i)`. `contains` and `indexOf` walk the list: O(n).",
        ]),
        image("list-set-map-decision", {
            alt: "Decision chart with three columns. Left: the question 'Keep every item in order, duplicates allowed, read by position?' (examples: cart lines, scan log, a queue of jobs) leads to List<E> (get(i), add, contains walks the list: O(n)) and its class ArrayList (order you added them, fast get(i)). Middle: 'Each item once, and a fast is-it-already-in-there?' (ISBNs already ordered, used coupon codes) leads to Set<E> (add returns false for a duplicate) with HashSet (no order promised, hash order), LinkedHashSet (insertion order, first add wins) and TreeSet (sorted order, O(log n) lookups). Right: 'Look up a value by a key, or add up per key?' (ISBN to price, copies sold per category) leads to Map<K, V> (keys unique, put on a key replaces) with HashMap (no order promised), LinkedHashMap (order keys were first put) and TreeMap (keys sorted, O(log n) lookups). A note says to declare with the interface, List<String> x = new ArrayList<>(), so the class can be swapped later. Footer: for the hash and linked classes, contains, add and get by key take about the same time however big the collection grows.",
            caption: "Choose the interface from the question the code asks, then the class from the order you need when you loop.",
        }),
        h3("Sequenced collections (Java 21)"),
        p("Java 21 added `getFirst()`, `getLast()` and `reversed()` to every collection with a defined order: `List`, `LinkedHashSet`, `TreeSet` (`SequencedCollection`), and `firstEntry()` / `lastEntry()` to `LinkedHashMap` and `TreeMap` (`SequencedMap`). No more `list.get(list.size() - 1)`:"),
        code("java", `
List<String> queue = new ArrayList<>(List.of("fiction", "children", "business", "comics", "children"));
System.out.println(queue.getFirst() + " .. " + queue.getLast());    // fiction .. children
System.out.println(queue.reversed());                               // [children, comics, business, children, fiction]

LinkedHashMap<String, Integer> byInsertion = new LinkedHashMap<>();
byInsertion.put("fiction", 1);
byInsertion.put("children", 2);
System.out.println(byInsertion.firstEntry() + " .. " + byInsertion.lastEntry());   // fiction=1 .. children=2

new ArrayList<String>().getFirst();   // java.util.NoSuchElementException`),
        p("`HashSet` and `HashMap` have no first element, so they do not get these methods. Also note `List.of`, `Set.of` and `Map.of`: they build **unmodifiable** collections (`add` or `put` throws `UnsupportedOperationException`, a `null` element throws `NullPointerException`, and `Set.of` / `Map.of` reject duplicates with `IllegalArgumentException`). Lesson \"Immutable collections & defensive copies\" covers them; wrap one in `new ArrayList<>(...)` when you need to change it, as the examples above do."),
        challenge("chal_quiz_javaf_211", "For the first question, check the two requirements separately: fast lookups rule out one option, and \"first scanned order\" rules out two more. For the second, remember what each call does with a duplicate or a missing key, and which Integer values are cached."),

        h2("5. Removing while you loop"),
        p("A for-each loop over a list runs on an **iterator**, an object that walks the list with a `cursor` (the index of the next element). `hasNext()` is simply `cursor != size()`. Every `ArrayList` also counts its structural changes (adds and removes) in a field called `modCount`; the iterator remembers the value when the loop starts and `next()` throws `ConcurrentModificationException` if it changed. \"Concurrent\" here does not mean threads: it means the list was changed by someone other than the iterator while the iterator was using it."),
        bullets([
            "**Monday:** `Tắt đèn` at index 0 is removed. The size drops to 2, the cursor is 1, `hasNext()` is true, and `next()` sees the changed `modCount`: exception.",
            "**Tuesday:** `Số đỏ` is removed at index 1, the **second-to-last** element. The size drops to 2 and the cursor is 2, so `hasNext()` returns false and the loop ends normally. No exception, and the last book was never looked at. That is why `Dế Mèn phiêu lưu ký` stayed on the shelf.",
        ]),
        p("So the check is a best-effort alarm, not a guarantee: never rely on it. There are two safe ways to remove during a pass:"),
        code("java", `
import java.util.*;

public class Removing {
    record Book(String isbn, int stock) {}

    public static void main(String[] args) {
        List<Book> shelf = List.of(
                new Book("9786041000011", 0),
                new Book("9786041000028", 0),
                new Book("9786041000035", 6));

        // 1. Iterator.remove(): the iterator removes the element it just returned
        List<Book> a = new ArrayList<>(shelf);
        Iterator<Book> it = a.iterator();
        while (it.hasNext()) {
            Book book = it.next();
            if (book.stock() == 0) {
                it.remove();
            }
        }
        System.out.println(a);   // [Book[isbn=9786041000035, stock=6]]

        // 2. removeIf(): one call, the list runs the loop for you
        List<Book> b = new ArrayList<>(shelf);
        boolean changed = b.removeIf(book -> book.stock() == 0);
        System.out.println(changed + " " + b);   // true [Book[isbn=9786041000035, stock=6]]

        // 3. Wrong: an index loop that removes skips the element after each removal
        List<Book> c = new ArrayList<>(shelf);
        for (int i = 0; i < c.size(); i++) {
            if (c.get(i).stock() == 0) {
                c.remove(i);
            }
        }
        System.out.println(c);   // [Book[isbn=9786041000028, stock=0], Book[isbn=9786041000035, stock=6]]
    }
}`, "Removing.java"),
        bullets([
            "**`Iterator.remove()`** removes the element the last `next()` returned and keeps the iterator in sync. Use it when you also need to do something with each removed element, such as adding it to a reorder list.",
            "**`removeIf(condition)`** takes a **lambda**, a short function written `parameter -> expression`, and removes every element for which it returns `true`. It returns `true` if anything was removed. The shortest option when you only need to remove.",
            "**Index loops** do not throw, but after `remove(i)` the next element slides into index `i` and `i++` jumps over it. Two sold-out books next to each other, and the second one survives.",
        ]),
        callout("warning", "remove(1) on a List<Integer>",
            "List has remove(int index) and remove(Object value). On a List<Integer>, qty.remove(1) removes the element at index 1, not the value 1: [5, 1, 7] becomes [5, 7]. To remove a value, pass an object: qty.remove(Integer.valueOf(7))."),

        h2("6. Map methods that replace get-then-put"),
        p("The report code reads a value, checks it for `null`, computes and puts it back. `Map` has methods that do this in one call:"),
        code("java", `
import java.util.*;

public class MapMethods {
    public static void main(String[] args) {
        String[] orderCities = {"Hà Nội", "Đà Nẵng", "Hà Nội", "Cần Thơ", "Hà Nội"};

        Map<String, Integer> ordersPerCity = new LinkedHashMap<>();
        for (String city : orderCities) {
            ordersPerCity.merge(city, 1, Integer::sum);   // 1 if new, otherwise old + 1
        }
        System.out.println(ordersPerCity);                         // {Hà Nội=3, Đà Nẵng=1, Cần Thơ=1}
        System.out.println(ordersPerCity.get("Huế"));              // null
        System.out.println(ordersPerCity.getOrDefault("Huế", 0)); // 0

        Map<String, List<String>> isbnsPerWarehouse = new TreeMap<>();
        isbnsPerWarehouse.computeIfAbsent("HN-02", k -> new ArrayList<>()).add("9786041000028");
        isbnsPerWarehouse.computeIfAbsent("HCM-01", k -> new ArrayList<>()).add("9786041000011");
        isbnsPerWarehouse.computeIfAbsent("HCM-01", k -> new ArrayList<>()).add("9786041000035");
        System.out.println(isbnsPerWarehouse);   // {HCM-01=[9786041000011, 9786041000035], HN-02=[9786041000028]}

        Map<String, String> firstBuyer = new HashMap<>();
        System.out.println(firstBuyer.putIfAbsent("9786041000011", "Nguyễn Thị Lan"));  // null (added)
        System.out.println(firstBuyer.putIfAbsent("9786041000011", "Trần Văn Minh"));   // Nguyễn Thị Lan (kept)

        for (Map.Entry<String, Integer> entry : ordersPerCity.entrySet()) {
            System.out.println(entry.getKey() + ": " + entry.getValue());
        }
        // Hà Nội: 3
        // Đà Nẵng: 1
        // Cần Thơ: 1
    }
}`, "MapMethods.java"),
        bullets([
            "**`getOrDefault(key, fallback)`** returns the value, or `fallback` when the key is missing. Plain `get` returns `null`, and unboxing that `null` into an `int` throws `NullPointerException`.",
            "**`merge(key, value, function)`** puts `value` if the key is missing; otherwise it stores `function(oldValue, value)`. With `Integer::sum` (a **method reference**, a short way to pass the existing method `Integer.sum(a, b)` as the function) it adds. This is the one-line counter.",
            "**`computeIfAbsent(key, k -> new ArrayList<>())`** returns the value for the key, creating and storing it first if the key is missing. Ideal for \"group into lists per key\".",
            "**`putIfAbsent(key, value)`** only puts when the key is missing and returns the value that was there before (`null` if none). Plain `put` always overwrites.",
            "**`entrySet()`** gives the key -> value pairs. Loop over it instead of `keySet()` plus `get(key)`: one lookup less per key, and the key and value always belong together.",
        ]),
        callout("info", "put is not add",
            "map.put(category, qty) does not add to the old total; it replaces it. If a category appears on three sales lines, only the last quantity survives. Counting and summing are what merge is for."),

        h2("7. Build it: the restock planner"),
        p("Time to write the parts of the nightly job that went wrong. You get a sales section (ISBN, category, copies) and a stock section, and write three methods: copies per category in the order categories were first sold, each sold ISBN once in first-sold order, and a method that removes sold-out ISBNs from a shelf list in place and returns them. The tests include two sold-out books next to each other, an ISBN missing from the stock section, and categories whose hash order differs from the sales order."),
        challenge("chal_coding_javaf_212", "Pick each collection from the order the output needs: which Map and which Set remember the order elements were first added? Add quantities with one Map method instead of put, and remove from the shelf through its iterator so you can also collect what you removed; a missing stock entry needs a default of 0."),

        h2("8. The fix"),
        p("Each bug has a one-collection fix. The job now uses a `Set` for the \"already ordered?\" question, removes through the iterator, and builds the report in a `LinkedHashMap` with `merge`:"),
        code("java", `
public class RestockJob {
    private final Supplier supplier;
    private final Report report;

    public void run(List<Book> shelf, Set<String> orderedToday, List<Sale> sales) {
        // 1. Sold-out books leave the shelf and go on the supplier order
        Iterator<Book> it = shelf.iterator();
        while (it.hasNext()) {
            Book book = it.next();
            if (book.stock() == 0) {
                it.remove();                              // safe: the iterator does the removing
                if (orderedToday.add(book.isbn())) {      // false if it was already ordered today
                    supplier.order(book.isbn(), 20);
                }
            }
        }

        // 2. Bestseller report: categories in the order of the sales file
        Map<String, Integer> soldByCategory = new LinkedHashMap<>();
        for (Sale sale : sales) {
            soldByCategory.merge(sale.category(), sale.qty(), Integer::sum);
        }
        for (Map.Entry<String, Integer> entry : soldByCategory.entrySet()) {
            report.line(entry.getKey() + " " + entry.getValue());
        }
    }
}`, "RestockJob.java"),
        numbered([
            "**`Iterator.remove()` instead of `shelf.remove(book)`.** No `ConcurrentModificationException`, and every book is checked, including the one after a removal and the last one.",
            "**`Set<String> orderedToday`.** `add` returns `false` when the ISBN is already there, so one call both checks and records it. Each check is a hash lookup instead of a walk through 20,000 strings. The caller builds it as a `HashSet` (order does not matter here) or a `LinkedHashSet` if someone prints it.",
            "**`LinkedHashMap` + `merge`.** The report follows the order categories first appear in the sales file, and the get / null-check / put dance is one line.",
            "**Interface types in the signature.** `List`, `Set` and `Map` instead of `ArrayList` and `HashMap`: the caller chooses the class, and changing it later does not touch this method.",
        ]),
        p("If the merchandising team ever wants the categories A-Z instead, the only change is `new TreeMap<>()`. A small check keeps Tuesday from coming back:"),
        code("java", `
List<Book> shelf = new ArrayList<>(List.of(
        new Book("9786041000011", "Tắt đèn", 4),
        new Book("9786041000028", "Số đỏ", 0),
        new Book("9786041000035", "Dế Mèn phiêu lưu ký", 0)));
shelf.removeIf(book -> book.stock() == 0);
if (shelf.size() != 1) throw new AssertionError("sold-out books left on the shelf: " + shelf);`),

        h2("9. Pitfalls"),
        bullets([
            "**`list.remove(x)` inside a for-each over the same list.** Usually `ConcurrentModificationException`; when `x` is the second-to-last element, no exception and the last element is skipped. Use `Iterator.remove()` or `removeIf`.",
            "**Removing by index in a counting loop.** The element after each removal is skipped. Use `removeIf`, or loop backwards from `size() - 1`.",
            "**`List.contains` for membership checks in a loop.** O(n) per call, O(n x m) for the loop. Copy the list into a `HashSet` once and ask the set.",
            "**Printing a `HashMap` or `HashSet` for humans.** The order is not insertion order and may change with size or Java version. Use `LinkedHashMap` / `LinkedHashSet` for first-seen order, `TreeMap` / `TreeSet` for sorted.",
            "**`map.put(k, map.get(k) + qty)`.** Throws `NullPointerException` the first time a key appears, because `null` cannot be unboxed. Use `merge` or `getOrDefault`.",
            "**`==` on `Integer`, `Long` or `String`.** Compares references; works for small cached numbers and fails at 128 and above. Use `equals`.",
            "**`remove(1)` on a `List<Integer>`.** Removes index 1. Use `remove(Integer.valueOf(1))` for the value.",
            "**Changing a `List.of` / `Set.of` / `Map.of` result.** `UnsupportedOperationException`. Copy it into a modifiable collection first.",
        ]),

        h2("10. Checklist"),
        bullets([
            "The interface matches the question: `List` for ordered items with duplicates, `Set` for \"already seen?\", `Map` for lookups and per-key totals.",
            "Variables, parameters and return types use the interface (`List<Book>`, `Map<String, Integer>`); the class appears only after `new`.",
            "The class matches the order a human needs: `Hash*` for lookups only, `LinkedHash*` for first-seen order, `Tree*` for sorted.",
            "Elements are removed during a loop only through `Iterator.remove()` or with `removeIf`.",
            "Totals per key use `merge`; missing keys are read with `getOrDefault`; groups use `computeIfAbsent`; maps are looped with `entrySet()`.",
            "Boxed numbers are compared with `equals` or unboxed first, never with `==`.",
            "A test covers the edge cases from the incident: the first element removed, the last two removed, two neighbours removed, and an output order that hash order would break.",
        ]),
    ],
});
