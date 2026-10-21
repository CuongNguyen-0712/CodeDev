// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-javaf-1-2",
    title: "Classes, records & equals/hashCode",
    slug: { _type: "slug", current: "java-classes-records-equals-hashcode" },
    description:
        "Mekong Books' cart showed the same book twice, and the remove button did nothing. A key class without equals and hashCode was the cause, and adding only equals did not fix it. Learn how a Java class is built (fields, constructor, this, private final), the difference between identity and equality, the equals/hashCode contract that HashSet and HashMap depend on, and how records with compact constructors give you correct, validated value types in a few lines.",
    estimatedTime: 22,

    scenario: {
        role: "Junior backend developer, Mekong Books cart service",
        problem:
            "The cart service merges cart lines by putting a BookKey object into a HashMap. Since the last release, a customer who adds the same book twice sees it as two lines, the remove button does nothing, and looking up a book that is clearly in the cart returns null. A teammate added an equals method to BookKey. The bug is still there.",
    },

    content: [
        h2("1. The incident: two lines for one book"),
        p("Mekong Books keeps each customer's cart in memory while they shop. A cart is a map from \"which book\" to \"how many copies\". To say \"which book\", the cart service uses a small key class that wraps the ISBN, the 13-digit number printed on every book (Vietnamese ISBNs start with `978-604`):"),
        code("java", `
import java.util.LinkedHashMap;
import java.util.Map;

public class CartService {
    private final Map<BookKey, Integer> lines = new LinkedHashMap<>();

    public void addToCart(String isbn, int qty) {
        BookKey key = new BookKey(isbn);
        Integer current = lines.get(key);          // null when the book is not in the cart yet
        if (current == null) {
            lines.put(key, qty);
        } else {
            lines.put(key, current + qty);
        }
    }

    public Integer quantityOf(String isbn) {
        return lines.get(new BookKey(isbn));
    }
}

class BookKey {
    private final String isbn;

    BookKey(String isbn) {
        this.isbn = isbn;
    }

    String getIsbn() {
        return isbn;
    }
}`, "CartService.java"),
        p("During the Vietnam Book Day sale on 21 April, customer support got the same complaint again and again: \"I clicked Add to cart twice on De Men Phieu Luu Ky and now my cart has two lines of it\". The remove button, which calls `quantityOf` first, did nothing, because `quantityOf` returned `null` for a book that was on the screen. The warehouse pick list had duplicate lines too."),
        p("A teammate read the code, decided that Java did not know two `BookKey`s with the same ISBN were \"the same\", and added this method to `BookKey`:"),
        code("java", `
@Override
public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof BookKey other)) return false;
    return Objects.equals(isbn, other.isbn);
}`, "BookKey.java"),
        p("The diagnosis was half right. The bug did not go away."),

        h2("2. Reproduce it"),
        p("Put both versions of the key into one file, `BookKey` without `equals` and `BookKeyV2` with the teammate's `equals`, and try them in a `HashSet` and a `HashMap`:"),
        code("java", `
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public class Main {
    public static void main(String[] args) {
        // Version 1: no equals, no hashCode
        Set<BookKey> keys = new HashSet<>();
        keys.add(new BookKey("9786041234567"));
        keys.add(new BookKey("9786041234567"));
        System.out.println(keys.size());
        System.out.println(keys);

        Map<BookKey, Integer> lines = new HashMap<>();
        lines.put(new BookKey("9786041234567"), 2);
        System.out.println(lines.get(new BookKey("9786041234567")));

        // Version 2: the teammate's fix, equals only
        BookKeyV2 a = new BookKeyV2("9786041234567");
        BookKeyV2 b = new BookKeyV2("9786041234567");
        System.out.println(a.equals(b));
        Set<BookKeyV2> keys2 = new HashSet<>();
        keys2.add(a);
        keys2.add(b);
        System.out.println(keys2.size());
        System.out.println(keys2.contains(new BookKeyV2("9786041234567")));
        System.out.println(a.hashCode() + " " + b.hashCode());
    }
}

class BookKey {
    private final String isbn;

    BookKey(String isbn) {
        this.isbn = isbn;
    }

    String getIsbn() {
        return isbn;
    }
}

class BookKeyV2 {
    private final String isbn;

    BookKeyV2(String isbn) {
        this.isbn = isbn;
    }

    String getIsbn() {
        return isbn;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof BookKeyV2 other)) return false;
        return Objects.equals(isbn, other.isbn);
    }
}`, "Main.java"),
        p("Compile with `javac -Xlint:all Main.java` and run `java Main`:"),
        code("text", `
Main.java:45: warning: [overrides] Class BookKeyV2 overrides equals, but neither it nor any superclass overrides hashCode method
class BookKeyV2 {
^
1 warning
2
[BookKey@15db9742, BookKey@6d06d69c]
null
true
2
false
1550089733 865113938`),
        p("The part after `@` in `BookKey@15db9742` and the two big numbers on the last line are **identity hash codes**. They are picked by the JVM per object, so you will probably see other values on your machine. Everything else is the same everywhere:"),
        bullets([
            "**Version 1:** the set holds two keys for one ISBN, and `get` with a new key for the same ISBN returns `null`. That is exactly the cart bug.",
            "**Version 2:** `a.equals(b)` is now `true`, yet the set still holds 2 keys and `contains` is `false`. The compiler even warned about it.",
        ]),
        p("To see why, you need three things: what a class and an object are, what \"equal\" means in Java, and how a `HashSet` looks things up."),

        h2("3. Anatomy of a class"),
        p("A **class** is a blueprint; an **object** (or **instance**) is one thing built from it with `new`. Here is a typical small class from the catalogue service:"),
        code("java", `
public class Main {
    public static void main(String[] args) {
        Book book = new Book("9786041234567", "De Men Phieu Luu Ky", 68_000);
        Book sameBook = new Book("9786041234567", "De Men Phieu Luu Ky", 68_000);

        System.out.println(book.getTitle());          // De Men Phieu Luu Ky
        System.out.println(book.priceFor(3));          // 204000
        System.out.println(book);                      // Book[isbn=9786041234567, title=De Men Phieu Luu Ky, priceVnd=68000]
        System.out.println(book == sameBook);          // false
        System.out.println(book.equals(sameBook));     // false
    }
}

class Book {
    private final String isbn;      // fields: the state every Book object carries
    private final String title;
    private final long priceVnd;

    Book(String isbn, String title, long priceVnd) {   // constructor: runs once per new Book(...)
        this.isbn = isbn;           // this.isbn is the field, isbn is the parameter
        this.title = title;
        this.priceVnd = priceVnd;
    }

    String getIsbn() { return isbn; }
    String getTitle() { return title; }
    long getPriceVnd() { return priceVnd; }

    long priceFor(int qty) {        // a method that uses the object's own state
        return priceVnd * qty;
    }

    @Override
    public String toString() {
        return "Book[isbn=" + isbn + ", title=" + title + ", priceVnd=" + priceVnd + "]";
    }
}`, "Main.java"),
        bullets([
            "**Fields** hold the data of each object. Every `Book` has its own `isbn`, `title` and `priceVnd`.",
            "**`private`** means only code inside `Book` can touch the field. Other code goes through methods such as `getTitle()` (a **getter**), so the class decides what is visible.",
            "**`final`** on a field means it must be set exactly once, in the constructor, and never changed afterwards. A class whose fields are all `private final` (and hold unchangeable values) is **immutable**: once built, the object never changes.",
            "The **constructor** has the class name and no return type. It runs when you write `new Book(...)` and fills in the fields.",
            "**`this`** is the object being built or used. Inside the constructor the parameter `isbn` hides the field `isbn`, so `this.isbn = isbn` means \"field = parameter\".",
            "**`@Override`** asks the compiler to check that the method really replaces one from a parent class. Every class extends `Object`, which already has `toString()`, `equals(Object)` and `hashCode()`.",
        ]),
        p("Forget `this.` and the assignment goes from the parameter to itself. With a `final` field, the compiler catches it:"),
        code("java", `
class Coupon {
    private final String code;

    Coupon(String code) {
        code = code;            // parameter = parameter; the field is never set
    }
}

// javac reports, at the closing brace of the constructor:
// error: variable code might not have been initialized`),
        p("Without `final`, the same line compiles silently and `code` stays `null` forever. That is one more reason to make fields `final` whenever they do not need to change."),

        h2("4. Identity, equality and the equals/hashCode contract"),
        p("The last two lines of the `Book` example are the heart of this lesson. Java has two different questions:"),
        bullets([
            "**Identity, `a == b`:** are these two variables pointing at the **same object** in memory? For objects, `==` never looks inside.",
            "**Equality, `a.equals(b)`:** do these two objects **mean the same thing**? The class decides. The version inherited from `Object` simply does `this == o`, which is why `book.equals(sameBook)` was `false` and why the original `BookKey` never matched.",
        ]),
        p("Strings already override `equals`, which is why lesson 1-1 told you to compare text with `.equals` and never with `==`. A class you write gets that behaviour only if you write it, or if Java generates it for you (records, section 5)."),
        h3("How HashSet and HashMap find a key"),
        p("A `HashSet` (and the keys of a `HashMap`) is stored as an array of **buckets**, 16 to start with. To add or find an object, the set does two steps:"),
        numbered([
            "Call `hashCode()` on the object. It returns an `int`, and that number picks **one bucket**.",
            "Look **only inside that bucket**, and call `equals` on the objects there.",
        ]),
        p("So `equals` is only asked if the hash codes lead to the same bucket. The teammate's `BookKeyV2` had a correct `equals`, but `hashCode()` still came from `Object`, which gives every object its own number: `1550089733` and `865113938` in the run above. The two keys went to different buckets, and `equals` was never called."),
        image("hashset-lookup", {
            alt: "Diagram of set.add(b) when a HashSet with 16 buckets already holds a, and a.equals(b) is true, both with ISBN 9786041234567. Left, green, record BookKey(String isbn) where equals and hashCode are both built from isbn: step 1, hashCode of a and b is 985179284 for both, computed from the ISBN; step 2, both numbers point to bucket 12, and the set only looks inside that bucket; step 3, bucket 12 holds a and b.equals(a) is true; result, found, add returns false and the set keeps 1 key. Right, red, class BookKeyV2 with equals only, whose hashCode is still inherited from Object: step 1, hashCode of a is 1550089733 and of b is 865113938, identity hash codes that are one per object, not per ISBN; step 2, a sits in bucket 1 and b points to bucket 2, and the set looks in bucket 2 only; step 3, bucket 2 is empty, so equals is never called; result, not found, add returns true and the set has 2 keys. Bottom: the contract HashSet and HashMap rely on. If a.equals(b) then a.hashCode() == b.hashCode(): equal objects must land in the same bucket. Same hashCode but not equal is allowed, a collision, and equals decides inside the bucket.",
            caption: "hashCode picks the bucket, equals decides inside it. Equal objects with different hash codes are never compared.",
        }),
        h3("The contract"),
        p("The documentation of `Object` spells out the rules every `equals` and `hashCode` must follow. The ones that matter in practice:"),
        bullets([
            "**Equal objects must have equal hash codes.** If `a.equals(b)` is `true`, then `a.hashCode() == b.hashCode()`. Break this and hash-based collections silently lose and duplicate your objects.",
            "**The reverse is not required.** Two different objects may share a hash code; that is a **collision**, and `equals` sorts it out inside the bucket. `\"Aa\".hashCode()` and `\"BB\".hashCode()` are both `2112`.",
            "**`equals` is reflexive, symmetric and transitive**: `a.equals(a)`; if `a.equals(b)` then `b.equals(a)`; if `a` equals `b` and `b` equals `c`, then `a` equals `c`.",
            "**`x.equals(null)` is `false`**, never an exception.",
            "**Consistent:** as long as the fields used by `equals` do not change, repeated calls give the same answer.",
        ]),
        p("In short: **override both or neither, and build both from the same fields.**"),
        h3("Writing them by hand with Objects.equals and Objects.hash"),
        p("`java.util.Objects` has two helpers that make the hand-written version short and null-safe:"),
        code("java", `
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

public class Main {
    public static void main(String[] args) {
        Coupon a = new Coupon("BOOK10", 10);
        Coupon b = new Coupon("BOOK10", 10);
        Coupon c = a;

        System.out.println(a == b);              // false: two objects
        System.out.println(a == c);              // true: one object, two variables
        System.out.println(a.equals(b));         // true: same code and percent
        System.out.println(a.hashCode() == b.hashCode()); // true
        System.out.println(a.equals(null));      // false

        Set<Coupon> used = new HashSet<>();
        used.add(a);
        System.out.println(used.contains(new Coupon("BOOK10", 10))); // true
        System.out.println(used.contains(new Coupon("BOOK10", 15))); // false

        System.out.println(Objects.equals(null, null));    // true
        System.out.println(Objects.equals("BOOK10", null)); // false
        System.out.println(Objects.hash("BOOK10", 10));     // 782645763
    }
}

class Coupon {
    private final String code;
    private final int percent;

    Coupon(String code, int percent) {
        this.code = code;
        this.percent = percent;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;                       // same object: equal
        if (!(o instanceof Coupon other)) return false;   // null or another type: not equal
        return percent == other.percent && Objects.equals(code, other.code);
    }

    @Override
    public int hashCode() {
        return Objects.hash(code, percent);               // the SAME fields as equals
    }
}`, "Main.java"),
        bullets([
            "`o instanceof Coupon other` checks the type **and** gives you a variable `other` of type `Coupon` (pattern matching for `instanceof`). It is `false` for `null`, so the null rule comes for free.",
            "Compare primitive fields (`int`, `long`, `boolean`) with `==`, and object fields with `Objects.equals(x, y)`, which is `true` when both are `null` and never throws.",
            "`Objects.hash(code, percent)` combines the hash codes of the fields you list. List exactly the fields that `equals` compares.",
        ]),
        callout("warning", "Never put a mutable field of a key in hashCode while the key is in a set",
            "If a field used by hashCode changes after the object is in a HashSet (or is a HashMap key), the object stays in its old bucket while lookups go to the new one. With a Shelf key of warehouse HCM-A and row 3 in a set, calling shelf.setRow(4) makes set.contains(shelf) false, and set.add(shelf) then stores it a second time: the set prints [HCM-A/4, HCM-A/4]. Keys should be immutable."),

        h2("5. Records: value classes in one line"),
        p("Most key and data classes look like `Coupon`: some `private final` fields, a constructor, getters, `equals`, `hashCode`, `toString`, and nothing else. Writing that by hand is about 30 lines where one typo (a field missing from `hashCode`) is a production bug. Java 16 added **records** for exactly this case, and they are a normal part of Java 21:"),
        code("java", `
record Isbn(String value) {}`, "Isbn.java"),
        p("From that one line the compiler generates:"),
        bullets([
            "a `private final` field for each **component** (`value`);",
            "a **canonical constructor** `Isbn(String value)` that sets the fields;",
            "an **accessor** method per component, named like the component: `value()`, **not** `getValue()`;",
            "`equals` and `hashCode` that use **all** components, so two `Isbn`s with the same `value` are equal and have the same hash code;",
            "`toString()` that prints `Isbn[value=9786041234567]`.",
        ]),
        p("A record is also `final` (no subclasses) and its fields cannot be reassigned. You can still add methods, static factory methods and extra constructors."),
        h3("Compact constructors: validate and normalise"),
        p("A key is only useful if equal things produce equal keys. `978-604-1-23456-7` and `9786041234567` are the same book, but as strings they are not equal. A **compact constructor** is a constructor without the parameter list: it runs before the fields are set, and you can check or replace the parameters. The fields are assigned from the (possibly changed) parameters at the end:"),
        code("java", `
import java.util.HashMap;
import java.util.Map;

public class Main {
    record Isbn(String value) {
        Isbn {                                   // compact constructor: no parameter list
            if (value == null) {
                throw new IllegalArgumentException("ISBN is missing");
            }
            value = value.replace("-", "").replace(" ", "");   // normalise first ...
            if (value.length() != 13 || !value.chars().allMatch(Character::isDigit)) {
                throw new IllegalArgumentException("ISBN must have 13 digits: " + value);
            }
        }                                        // ... then the field is set from value
    }

    record CartLine(Isbn isbn, int qty) {
        CartLine {
            if (qty <= 0) {
                throw new IllegalArgumentException("qty must be > 0, got " + qty);
            }
        }

        CartLine plus(int more) {                // records can have methods
            return new CartLine(isbn, qty + more);
        }
    }

    public static void main(String[] args) {
        Isbn a = new Isbn("978-604-1-23456-7");
        Isbn b = new Isbn("9786041234567");
        System.out.println(a);                       // Isbn[value=9786041234567]
        System.out.println(a.value());               // 9786041234567
        System.out.println(a.equals(b));             // true
        System.out.println(a.hashCode() == b.hashCode()); // true

        CartLine line = new CartLine(a, 2);
        System.out.println(line);                    // CartLine[isbn=Isbn[value=9786041234567], qty=2]
        System.out.println(line.isbn().value() + " x " + line.qty());   // 9786041234567 x 2
        System.out.println(line.plus(1));            // CartLine[isbn=Isbn[value=9786041234567], qty=3]

        Map<Isbn, Integer> stock = new HashMap<>();
        stock.put(new Isbn("978 604 1 23456 7"), 40);
        System.out.println(stock.get(new Isbn("978-604-1-23456-7")));   // 40

        try {
            new CartLine(a, 0);
        } catch (IllegalArgumentException e) {
            System.out.println(e.getMessage());       // qty must be > 0, got 0
        }
        new Isbn("978-604-1-2345");
    }
}`, "Main.java"),
        p("The last line has only 11 digits, so the program stops with:"),
        code("text", `
Exception in thread "main" java.lang.IllegalArgumentException: ISBN must have 13 digits: 97860412345
	at Main$Isbn.<init>(Main.java:12)
	at Main.main(Main.java:51)`),
        bullets([
            "**Normalising in the constructor** means there is no way to build an `Isbn` with hyphens in it. Every `Isbn` in the program is in one standard form, so the generated `equals` and `hashCode` do the right thing.",
            "**Validating in the constructor** means a bad value fails loudly at the point where it enters the program, with a clear message, instead of turning into a strange bug three classes later. `IllegalArgumentException` is the standard exception for \"this argument is not acceptable\" (lesson 4-1 covers exceptions in depth).",
            "**`Main$Isbn.<init>`** in the stack trace is the constructor of the record `Isbn` nested inside `Main`.",
            "A record nested in a class is automatically `static`, so `main` can create it without a `Main` object.",
        ]),
        callout("info", "Records are shallowly immutable",
            "A record's fields cannot be reassigned, but if a component is a mutable object, the object itself can still change. With record Order(String id, List<String> isbns) {}, adding to the ArrayList you passed in, or calling order.isbns().add(...), changes what the order prints: Order[id=MB-2041, isbns=[9786041234567]] becomes Order[id=MB-2041, isbns=[9786041234567, 9786047654321, 9786041112223]]. The fix is a defensive copy in the compact constructor, the topic of lesson 2-3, Immutable collections & defensive copies."),

        h2("6. Class or record?"),
        p("Use a **record** when the object **is its data**: two instances with the same values are interchangeable. Keys (`Isbn`, `BookKey`), money amounts, coordinates, cart lines, DTOs that carry a request or a response, rows of a report. Use a **class** when:"),
        bullets([
            "the object has **state that changes over time** (`CartService` with its map, a counter, a connection);",
            "the object has an **identity** beyond its values: two customers with the same name are still two customers, so equality by fields would be wrong;",
            "you need to **hide the representation** (fields that are not part of the public shape) or **extend** another class. Records cannot extend a class and their components are always public through accessors.",
        ]),
        p("If you do write a class that will be compared or used as a key, write `equals` and `hashCode` together from the same `final` fields, or let your IDE generate both and review them."),

        h2("7. Fix the cart key"),
        p("Your turn. The challenge is the cart from the incident, as a small program: it reads `add`, `remove` and `count` commands, keeps one line per book in a `LinkedHashMap` (a `HashMap` that remembers insertion order), and prints the cart at the end. Some tests add the same book with and without hyphens."),
        challenge("chal_fix_javaf_121", "Two spellings of one ISBN must give two keys that are equal AND have the same hash code. Either turn BookKey into a record whose compact constructor normalises the ISBN, or write equals and hashCode yourself from the normalised field; remember to update the code that reads the ISBN back if you change the accessor's name."),

        h2("8. The fix"),
        p("For the real `CartService`, the cleanest fix is to stop inventing a key class and use the `Isbn` record from section 5 as the map key. It normalises and validates in one place, and its generated `equals` and `hashCode` agree with each other:"),
        code("java", `
import java.util.LinkedHashMap;
import java.util.Map;

public class CartService {
    private final Map<Isbn, Integer> lines = new LinkedHashMap<>();

    public void addToCart(String rawIsbn, int qty) {
        if (qty <= 0) {
            throw new IllegalArgumentException("qty must be > 0, got " + qty);
        }
        Isbn isbn = new Isbn(rawIsbn);              // normalised and validated here
        lines.merge(isbn, qty, Integer::sum);       // new line, or add to the existing one
    }

    public Integer quantityOf(String rawIsbn) {
        return lines.get(new Isbn(rawIsbn));
    }
}

// Isbn is the record from section 5:
// record Isbn(String value) { Isbn { ...strip hyphens and spaces, require 13 digits... } }

// cart.addToCart("978-604-1-23456-7", 1);
// cart.addToCart("9786041234567", 1);
// cart.addToCart("978-604-76543-2-1", 2);
// lines                               -> {Isbn[value=9786041234567]=2, Isbn[value=9786047654321]=2}
// cart.quantityOf("978 604 1 23456 7") -> 2`, "CartService.java"),
        numbered([
            "**`Isbn` is a record.** `equals` and `hashCode` are generated from the same component, so equal keys always land in the same bucket. Nobody can add one and forget the other.",
            "**The compact constructor normalises.** Hyphens and spaces are removed before the field is set, so every spelling of one ISBN becomes one key.",
            "**Bad input fails at the door.** A short ISBN or a quantity of 0 throws `IllegalArgumentException` with a message, instead of creating a ghost cart line.",
            "**`Map.merge(key, qty, Integer::sum)`** replaces the `get` / `null` check / `put` dance: it puts `qty` if the key is new, otherwise it stores `old + qty`.",
        ]),
        p("A regression check for the incident is three lines: add the same book twice with two spellings, then assert that the cart has one line with quantity 2 and that `quantityOf` with a third spelling returns 2."),

        h2("9. Pitfalls"),
        bullets([
            "**`equals` without `hashCode`** (or the other way round). Hash-based collections check the hash code first; `javac -Xlint:all` warns with `[overrides] Class X overrides equals, but neither it nor any superclass overrides hashCode method`.",
            "**`hashCode` and `equals` built from different fields.** If `equals` ignores a field that `hashCode` uses (or compares a normalised value while `hashCode` uses the raw text), equal objects get different hash codes.",
            "**Comparing `String` fields with `==` inside `equals`.** Strings read from input or built at runtime are different objects; use `Objects.equals` or `.equals`.",
            "**Mutable fields in a key.** Changing a field used by `hashCode` while the object is in a `HashSet` or is a `HashMap` key strands it in the wrong bucket.",
            "**Not normalising.** A record compares its components exactly: `new BookKey(\"978-604-1-23456-7\")` and `new BookKey(\"9786041234567\")` are different unless a compact constructor makes them the same.",
            "**`getIsbn()` on a record.** Record accessors are named after the component: `isbn()`, `qty()`, `value()`.",
            "**Thinking a record makes everything immutable.** A `List` component can still be changed from outside; copy it (lesson 2-3).",
            "**`equals(Coupon other)` instead of `equals(Object o)`.** That is a new overload, not an override; `HashSet` still calls the inherited `equals(Object)`. Always write `@Override` so the compiler catches it.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Fields are `private final` unless they really need to change; constructors assign them with `this.field = parameter`.",
            "Objects are compared with `equals`, never with `==` (except to check \"same object\").",
            "Every class used in a `HashSet` or as a `HashMap` key has `equals` and `hashCode`, both built from the same immutable fields, or is a record.",
            "Data-only types (keys, values, cart lines, DTOs) are records; accessors are `name()`, not `getName()`.",
            "Compact constructors normalise input (one standard form) and reject invalid values with `IllegalArgumentException` and a clear message.",
            "Mutable components of records (lists, maps) are copied, not shared.",
            "Code is compiled with `-Xlint:all` (or the IDE equivalent) so the equals-without-hashCode warning is seen.",
            "A test adds the same item twice, in two spellings, and checks that the collection holds it once.",
        ]),
    ],
});
