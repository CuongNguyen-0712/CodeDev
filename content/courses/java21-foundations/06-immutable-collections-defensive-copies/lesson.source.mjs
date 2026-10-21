// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-javaf-2-3",
    title: "Immutable collections & defensive copies",
    slug: { _type: "slug", current: "java-immutable-collections-defensive-copies" },
    description:
        "Mekong Books saved orders as records, so they looked immutable - until the checkout reused one ArrayList for every cart and a customer received someone else's books. Learn reference semantics, why records are only shallowly immutable, the difference between List.of, List.copyOf, Arrays.asList, Collections.unmodifiableList and stream().toList(), and how a defensive copy in a compact constructor makes an object truly yours.",
    estimatedTime: 22,

    scenario: {
        role: "Junior backend developer, Mekong Books checkout team",
        problem:
            "Orders are stored as record Order(String id, List<OrderLine> lines). The checkout service keeps one ArrayList as a cart buffer and clears it for the next customer. Packing slips now show empty orders or the books of whoever is shopping right now, a free bookmark for one customer ends up in the next customer's parcel, and a quick fix with Collections.unmodifiableList stopped the bookmark but not the disappearing books.",
    },

    content: [
        h2("1. The incident at Mekong Books"),
        p("Every order at Mekong Books is a record: an id such as `MB-1001` and the list of order lines (an ISBN and a quantity). A record has `final` fields and no setters, so the team was sure a saved order could never change. To avoid creating a new list per customer, the checkout service keeps **one** `ArrayList` as a cart buffer and clears it after each checkout:"),
        code("java", `
import java.util.ArrayList;
import java.util.List;

record OrderLine(String isbn, int qty) {}

record Order(String id, List<OrderLine> lines) {}

class CheckoutService {
    private final List<OrderLine> cart = new ArrayList<>();   // one buffer, reused for every customer
    private final List<Order> orders = new ArrayList<>();
    private int nextNumber = 1001;

    void add(String isbn, int qty) {
        cart.add(new OrderLine(isbn, qty));
    }

    Order checkout() {
        Order order = new Order("MB-" + nextNumber++, cart);
        orders.add(order);
        System.out.println("saved " + order);
        cart.clear();                                          // ready for the next customer
        return order;
    }
}`, "CheckoutService.java"),
        p("A second team owns promotions. When an order wins a free bookmark, their code adds a line to it:"),
        code("java", `
class PromotionService {
    void addFreeBookmark(Order order) {
        order.lines().add(new OrderLine("GIFT-BOOKMARK", 1));
    }
}`, "PromotionService.java"),
        p("The log line printed at checkout always looked right. But the packing slips, printed later from the saved orders, did not: some orders had no lines at all, some listed the books of the customer who was shopping at that moment, and a customer who never won anything received a bookmark."),

        h2("2. Reproduce it"),
        p("Put the two records and both services in `Main.java` (below `public class Main`) and play two customers, Minh and Lan:"),
        code("java", `
public class Main {
    public static void main(String[] args) {
        var checkout = new CheckoutService();
        var promotions = new PromotionService();

        checkout.add("9786041000011", 2);            // Minh: 2 copies of one book
        Order minh = checkout.checkout();
        System.out.println("MB-1001 now: " + minh.lines());

        checkout.add("9786041000028", 1);            // Lan starts filling a cart
        System.out.println("MB-1001 now: " + minh.lines());

        promotions.addFreeBookmark(minh);            // Minh's order wins a bookmark
        Order lan = checkout.checkout();
        System.out.println("same list? " + (minh.lines() == lan.lines()));
    }
}

// saved Order[id=MB-1001, lines=[OrderLine[isbn=9786041000011, qty=2]]]
// MB-1001 now: []
// MB-1001 now: [OrderLine[isbn=9786041000028, qty=1]]
// saved Order[id=MB-1002, lines=[OrderLine[isbn=9786041000028, qty=1], OrderLine[isbn=GIFT-BOOKMARK, qty=1]]]
// same list? true`, "Main.java"),
        p("Read the output line by line. Minh's order is saved with its line (2 copies of one book), and one line later it is **empty**: `cart.clear()` emptied it. When Lan adds a book to the cart, Minh's order shows **Lan's** book. The bookmark meant for Minh goes into the cart, so Lan's order is saved with it. The last line explains everything: both orders hold the very same list object."),
        h3("The quick fix that was not enough"),
        p("A teammate wrapped the list in the record's compact constructor (lesson \"Classes, records & equals/hashCode\"), so nobody could add to it:"),
        code("java", `
record Order(String id, List<OrderLine> lines) {
    Order {
        lines = Collections.unmodifiableList(lines);   // "now it is read-only"
    }
}

List<OrderLine> cart = new ArrayList<>();
cart.add(new OrderLine("9786041000011", 2));
Order minh = new Order("MB-1001", cart);
try {
    minh.lines().add(new OrderLine("GIFT-BOOKMARK", 1));
} catch (UnsupportedOperationException ex) {
    System.out.println("gift rejected: " + ex);
}
cart.clear();                                   // next customer
cart.add(new OrderLine("9786041000028", 1));
System.out.println(minh);

// gift rejected: java.lang.UnsupportedOperationException
// Order[id=MB-1001, lines=[OrderLine[isbn=9786041000028, qty=1]]]`, "QuickFix.java"),
        p("The promotions code is now rejected, but Minh's order still shows Lan's book. To see why, you need two ideas: what a variable of type `List` really holds, and the difference between a **copy** and a **view**."),

        h2("3. Two variables, one list"),
        p("A variable of a class type (`List`, `String`, `Order`) does not contain the object. It contains a **reference**: the address of an object that lives somewhere else in memory (the **heap**). Assigning or passing the variable copies the reference, not the object:"),
        code("java", `
List<String> cart = new ArrayList<>();
List<String> sameCart = cart;          // copies the reference: still ONE list
sameCart.add("9786041000011");

System.out.println(cart);              // [9786041000011]
System.out.println(cart.size());       // 1
System.out.println(cart == sameCart);  // true: == compares references`),
        p("Two variables that refer to one object are called **aliases**. Changing the object through one alias is visible through every other alias. That is exactly what `new Order(id, cart)` does: the record's `lines` field becomes an alias of the service's `cart`."),
        h3("Records are only shallowly immutable"),
        p("A record makes its fields `final`. `final` means the field always refers to the **same object**; it says nothing about whether that object can change. So for `record Order(String id, List<OrderLine> lines)`:"),
        bullets([
            "**You cannot** point `lines` at another list: there is no setter, and assigning the field after construction does not compile.",
            "**You can** change the list it points to: `order.lines().add(...)`, `order.lines().clear()`, or any change through another alias such as the cart buffer.",
            "**Shallow immutability** means only the first level (the fields) is fixed. A record is fully immutable only when every component is immutable too: `String`, `int`, `long`, other immutable records, and unmodifiable collections of those.",
        ]),
        p("There is also no warning to help you. The record still compiles, `equals` and `toString` still work, and the bug only shows up later, far from the line that caused it."),

        h2("4. Four lists that look alike"),
        p("Java has several ways to get a list that \"cannot be changed\", and they mean different things. Each one answers two questions: can **you** change it, and can **someone else** change it under your feet?"),
        code("java", `
List<String> cart = new ArrayList<>(List.of("9786041000011", "9786041000028"));

List<String> copy = List.copyOf(cart);                  // new unmodifiable list
List<String> view = Collections.unmodifiableList(cart); // read-only window on cart
cart.add("9786041000035");
System.out.println(copy.size() + " " + view.size());    // 2 3

String[] shelf = {"A", "B", "C"};
List<String> fixed = Arrays.asList(shelf);              // backed by the array
fixed.set(0, "Z");                                      // allowed
System.out.println(shelf[0] + " " + fixed);             // Z [Z, B, C]

List<String> fromStream = cart.stream().filter(isbn -> isbn.endsWith("1")).toList();
List<String> collected = cart.stream().collect(Collectors.toList());
collected.add("extra");                                 // works: an ArrayList today
System.out.println(fromStream + " " + collected.size()); // [9786041000011] 4`, "ListKinds.java"),
        bullets([
            "**`new ArrayList<>(other)`** - a new, independent and **mutable** copy. You own it and anyone you hand it to can change it.",
            "**`List.of(a, b, ...)` and `List.copyOf(collection)`** - **unmodifiable** lists. `List.copyOf` copies the elements into a new list, so later changes to the source do not reach it. Neither accepts `null` elements.",
            "**`Collections.unmodifiableList(list)`** - a read-only **view**: a thin wrapper that refuses changes made through it, but reads from the original list every time. Whoever holds the original can still change what you see. That is why the quick fix in section 2 failed.",
            "**`Arrays.asList(array)`** - a **fixed-size** list backed by the array. `add` and `remove` throw, but `set` works and writes into the array, and changes to the array show up in the list.",
            "**`stream().toList()`** (Java 16+) - an unmodifiable list; unlike `List.of` it allows `null` elements. `collect(Collectors.toList())` gives no guarantee about mutability; today it returns an `ArrayList`, so do not rely on it being read-only. Streams are covered in lesson \"Streams & collectors\".",
        ]),
        h3("What a refused change looks like"),
        p("Any method that would change an unmodifiable list - `add`, `remove`, `set`, `clear`, `sort`, `removeIf` - throws `UnsupportedOperationException`. It is a runtime error: the code compiles because the `List` interface has an `add` method."),
        code("java", `
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> isbns = List.of("9786041000011", "9786041000028");
        isbns.add("9786041000035");
    }
}

// Exception in thread "main" java.lang.UnsupportedOperationException
// 	at java.base/java.util.ImmutableCollections.uoe(ImmutableCollections.java:142)
// 	at java.base/java.util.ImmutableCollections$AbstractImmutableCollection.add(ImmutableCollections.java:147)
// 	at Main.main(Main.java:6)`, "Main.java"),
        p("The exception has **no message**, so `e.getMessage()` is `null`. The stack trace tells you what refused: `ImmutableCollections` means a list from `List.of`, `List.copyOf` or `toList()`; `Collections$UnmodifiableCollection.add` means a `Collections.unmodifiableList` view; `AbstractList.add` means a fixed-size list such as `Arrays.asList`. Note that `removeIf` on a `List.of` list throws even when nothing matches, and `Collections.sort(List.of(...))` throws too."),
        h3("copyOf: copies when it must, nulls never"),
        code("java", `
System.out.println(List.copyOf(copy) == copy);          // true: already unmodifiable
System.out.println(List.copyOf(view) == view);          // false: a view is copied
System.out.println(Stream.of("A", null).toList());      // [A, null]

List<String> withNull = new ArrayList<>();
withNull.add(null);
List.copyOf(withNull);
// Exception in thread "main" java.lang.NullPointerException
// 	at java.base/java.util.Objects.requireNonNull(Objects.java:233)
// 	...
// 	at java.base/java.util.List.copyOf(List.java:1193)`, "CopyOf.java"),
        bullets([
            "**No needless copies.** If the argument is already a list made by `List.of` / `List.copyOf`, `List.copyOf` returns the **same object**. Calling it defensively costs nothing in that case.",
            "**It does not trust views.** A `Collections.unmodifiableList` view or a `toList()` result (which may hold `null`) is copied.",
            "**Nulls are rejected** with `NullPointerException`, at the moment of copying. That is usually what you want for an order: a `null` line is a bug, and it is better to fail at checkout than when printing the packing slip.",
            "**`Set.copyOf` and `Map.copyOf`** work the same way for sets and maps: copy, unmodifiable, no `null` elements, keys or values. `Set.copyOf` silently drops duplicates, while `Set.of(\"A\", \"A\")` throws `IllegalArgumentException: duplicate element: A`. The iteration order of `Set.of` / `Set.copyOf` / `Map.copyOf` is unspecified, so never print them and expect a fixed order.",
        ]),
        image("copy-vs-view-vs-shared", {
            alt: "Three panels showing what Order.lines refers to after checkout. Panel 1, red, new Order(id, cart): the variables cart and order.lines() both point to the same ArrayList, the cart buffer holding 9786041000011 x2; cart.clear() makes the order lose its lines and add(gift) works and the cart gets it too. Labelled: bug, two references, one list. Panel 2, amber, Collections.unmodifiableList(cart): cart points to the ArrayList, order.lines() points to a dashed read-only view box that points to the same ArrayList; add(gift) throws UnsupportedOperationException but cart.clear() still empties the order. Labelled: still leaks, a view is not a copy. Panel 3, green, List.copyOf(cart): cart points to its own ArrayList that is cleared and refilled, order.lines() points to a separate unmodifiable list holding the order's lines; cart.clear() leaves the order unchanged and add(gift) throws UnsupportedOperationException. Labelled: safe, two lists, one is frozen. Bottom note: an arrow is a reference; a copy is a new list, a view is a read-only window onto someone else's list; List.copyOf copies the references to the elements, not the elements, so the elements should be immutable too.",
            caption: "Only a copy cuts the link to the caller's list. A view blocks changes made through it, not changes made to the list behind it.",
        }),

        h2("5. Defensive copies in records"),
        p("A **defensive copy** is a copy you make of a mutable object that crosses the boundary of your class, so that nobody outside can change your state later. For a record, the natural place is the **compact constructor**: it runs before the fields are assigned, and you can replace a parameter with a safe version of it. Here is the idea on a shipment, which holds the ids of its parcels:"),
        code("java", `
record Shipment(String trackingNo, List<String> parcelIds) {
    Shipment {
        parcelIds = List.copyOf(parcelIds);   // reassign the PARAMETER, not this.parcelIds
    }
}

List<String> parcels = new ArrayList<>(List.of("P-1", "P-2"));
Shipment s = new Shipment("VN123", parcels);
parcels.clear();
System.out.println(s);   // Shipment[trackingNo=VN123, parcelIds=[P-1, P-2]]`, "Shipment.java"),
        bullets([
            "**Copy in, not only out.** The copy must be made when the data comes in. Copying in the accessor alone still leaves the field pointing at the caller's list.",
            "**Assign the parameter.** Inside a compact constructor you write `parcelIds = ...`. Writing `this.parcelIds = ...` does not compile: `error: cannot assign a value to final variable parcelIds`. Java assigns the fields from the (possibly replaced) parameters at the end of the compact constructor.",
            "**The default accessor is now safe.** `s.parcelIds()` returns the unmodifiable copy itself; there is no need to copy again on the way out.",
            "**Validate in the same place.** The compact constructor is also where `Objects.requireNonNull` or range checks belong; `List.copyOf` already rejects `null` elements.",
        ]),
        h3("\"Changing\" an immutable record: build a new one"),
        p("Once a record is immutable, an update means creating a new record with the new data. A common style is a `with...` method that copies the list into a mutable one, changes the copy, and passes it to the constructor (which makes its own unmodifiable copy again):"),
        code("java", `
record Shipment(String trackingNo, List<String> parcelIds) {
    Shipment {
        parcelIds = List.copyOf(parcelIds);
    }

    Shipment withParcel(String parcelId) {
        List<String> more = new ArrayList<>(parcelIds);
        more.add(parcelId);
        return new Shipment(trackingNo, more);
    }
}

Shipment s2 = s.withParcel("P-3");
System.out.println(s);    // Shipment[trackingNo=VN123, parcelIds=[P-1, P-2]]
System.out.println(s2);   // Shipment[trackingNo=VN123, parcelIds=[P-1, P-2, P-3]]`, "Shipment.java"),
        p("The old shipment is untouched, so any code that already holds it (a log, a cache, another thread) keeps seeing consistent data. If the new version must replace the old one somewhere, for example in a list of saved shipments, the code that owns that list puts the new record in its place."),
        h3("Getters: a copy, an unmodifiable copy, or a view?"),
        p("What you return from an accessor is a design decision. Overriding a record accessor to return a fresh `ArrayList` looks safe, but it hides mistakes:"),
        code("java", `
record Basket(List<String> isbns) {
    @Override
    public List<String> isbns() {
        return new ArrayList<>(isbns);   // a fresh copy on every call
    }
}

Basket b = new Basket(new ArrayList<>(List.of("9786041000011")));
b.isbns().add("9786041000028");          // changes a throw-away copy, silently
System.out.println(b.isbns());           // [9786041000011]
System.out.println(b.isbns() == b.isbns()); // false: a new list per call`, "Basket.java"),
        bullets([
            "**Store an unmodifiable copy and return it as is** (the record default after `List.copyOf` in the constructor). Callers who try to change it get an `UnsupportedOperationException` right away. This is the best default for value objects such as orders.",
            "**Return a new mutable copy** only when callers really need their own list to edit. A caller who expects to change your object gets no error, and nothing happens - here `Basket` also still stores the caller's list, so it is not protected at all.",
            "**Return `Collections.unmodifiableList(field)`** from a class that changes its own list over time, such as a service: callers get a read-only, always up-to-date window, and only the class itself can change the list.",
        ]),
        code("java", `
class OrderLog {
    private final List<String> events = new ArrayList<>();

    void record(String event) { events.add(event); }

    List<String> events() { return Collections.unmodifiableList(events); }
}

OrderLog log = new OrderLog();
List<String> events = log.events();
log.record("checkout MB-1001");
System.out.println(events + " " + events.size());   // [checkout MB-1001] 1`, "OrderLog.java"),
        p("Here a live view is exactly what you want. In a record that should never change, it is exactly what you do not want."),

        h2("6. Immutable all the way down"),
        p("`List.copyOf` copies the list, not the elements: the new list holds references to the **same** element objects. If an element can change, the \"immutable\" list still changes:"),
        code("java", `
class StockLevel {                 // a mutable class: qty can be reassigned
    int qty;
    StockLevel(int qty) { this.qty = qty; }
    @Override public String toString() { return "StockLevel[qty=" + qty + "]"; }
}

record Warehouse(String code, List<StockLevel> levels) {
    Warehouse {
        levels = List.copyOf(levels);
    }
}

StockLevel hanoi = new StockLevel(40);
Warehouse w = new Warehouse("HN-01", List.of(hanoi));
hanoi.qty = 0;
System.out.println(w);    // Warehouse[code=HN-01, levels=[StockLevel[qty=0]]]
w.levels().get(0).qty = -5;
System.out.println(w);    // Warehouse[code=HN-01, levels=[StockLevel[qty=-5]]]`, "Warehouse.java"),
        p("The list refused nothing because nobody changed the list; they changed an element. The cure is to make the elements immutable too. Records whose components are `String`, `int`, `long` or other such records are immutable all the way down, so an unmodifiable list of them is a true snapshot:"),
        code("java", `
record Money(long vnd) {}
record Line(String isbn, int qty, Money unitPrice) {}

Line line = new Line("9786041000011", 2, new Money(120000));
System.out.println(line);   // Line[isbn=9786041000011, qty=2, unitPrice=Money[vnd=120000]]`),
        p("`OrderLine(String isbn, int qty)` from the incident is such a record, so `List.copyOf` is enough for `Order`. One more useful fact: record `equals` compares lists with `List.equals`, which compares elements in order, so `new Order(\"A\", List.of(line))` equals an `Order` built from an `ArrayList` with the same lines. Switching to unmodifiable lists does not change equality."),

        h2("7. Fix the checkout service"),
        p("Now repair the real service. The starter is the checkout code from the incident, plus a `gift` command that adds a free item to a saved order the wrong way. The test runner plays a sequence of commands - adding books, checking out, gifts, and calls from the old promotions module - and prints every saved order at the end. Saved orders must never change after checkout, `order.lines()` must refuse changes, and a gift must produce a new order in place of the old one."),
        challenge("chal_fix_javaf_231", "Decide where the order's list stops being shared with the cart: the record's compact constructor is the one place every order passes through. Then gift can no longer add to the old list, so build a new Order with one more line and put it where the old one was in the saved list."),

        h2("8. The fix"),
        p("The root cause is in `Order`, not in the service: the record accepted a list it did not own. One line in the compact constructor fixes every caller, including ones written later:"),
        code("java", `
record OrderLine(String isbn, int qty) {}

record Order(String id, List<OrderLine> lines) {
    Order {
        lines = List.copyOf(lines);   // the order owns an unmodifiable copy
    }
}`, "Order.java"),
        p("`CheckoutService` does not change at all; reusing the cart buffer is harmless once nobody keeps a reference to it. Running the reproduction again:"),
        code("java", `
checkout.add("9786041000011", 2);
Order minh = checkout.checkout();
checkout.add("9786041000028", 1);
System.out.println("MB-1001 now: " + minh.lines());
Order lan = checkout.checkout();
System.out.println("same list? " + (minh.lines() == lan.lines()));

promotions.addFreeBookmark(minh);

// saved Order[id=MB-1001, lines=[OrderLine[isbn=9786041000011, qty=2]]]
// MB-1001 now: [OrderLine[isbn=9786041000011, qty=2]]
// saved Order[id=MB-1002, lines=[OrderLine[isbn=9786041000028, qty=1]]]
// same list? false
// Exception in thread "main" java.lang.UnsupportedOperationException
// 	at java.base/java.util.ImmutableCollections.uoe(ImmutableCollections.java:142)
// 	at java.base/java.util.ImmutableCollections$AbstractImmutableCollection.add(ImmutableCollections.java:147)
// 	at PromotionService.addFreeBookmark(Main.java:48)
// 	at Main.main(Main.java:16)`, "Main.java"),
        numbered([
            "**Minh's order keeps its books** when the cart is cleared and refilled: it has its own list.",
            "**The two orders no longer share a list** (`same list? false`).",
            "**The promotions code now fails loudly** at the exact line that tried to change a saved order, instead of silently corrupting the next customer's parcel. The promotions team has to build a new `Order` with the extra line (section 5) and save it in place of the old one.",
            "**`Collections.unmodifiableList` is gone.** It blocked the symptom the team noticed first and left the real one in place.",
        ]),

        h2("9. Pitfalls"),
        bullets([
            "**A record is not deep-immutable.** `final` fields can still point at mutable lists, maps, arrays or objects. Copy them in the compact constructor.",
            "**A view is not a copy.** `Collections.unmodifiableList(list)` stops changes through the view only; the owner of `list` can still change what you see.",
            "**Copying only on the way out is not enough.** If the field still holds the caller's list, the caller can change your object without calling any of your methods.",
            "**`new ArrayList<>(list)` is a copy, but a mutable one.** It protects you from the caller, not the caller from changing your object through the accessor.",
            "**`Arrays.asList` is not read-only.** `set` works and writes into the array, and changes to the array appear in the list.",
            "**`List.of` and `List.copyOf` reject `null`** - and `List.of(...).contains(null)` throws `NullPointerException` too, while `ArrayList.contains(null)` returns `false`.",
            "**`UnsupportedOperationException` is a runtime error.** The compiler cannot tell an unmodifiable `List` from a mutable one, so a test that tries to change the list is the only early warning.",
            "**Unmodifiable list, mutable elements.** `List.copyOf` copies references; make the elements immutable records too.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every collection component of a record is copied in the compact constructor with `List.copyOf`, `Set.copyOf` or `Map.copyOf`.",
            "The compact constructor assigns the parameter (`lines = ...`), not `this.lines`.",
            "Elements of those collections are immutable: records of `String`, `int`, `long` and other immutable records.",
            "Updates to an immutable object create a new object (a `with...` method), and the owner of the saved list replaces the old one.",
            "A class that changes its own list over time exposes it as `Collections.unmodifiableList(field)`, never the field itself.",
            "No code relies on `Collectors.toList()` or `Arrays.asList` being read-only.",
            "A small test clears or refills the source list after creating the object and checks that the object did not change, and checks that `lines().add(...)` throws `UnsupportedOperationException`.",
        ]),
    ],
});
