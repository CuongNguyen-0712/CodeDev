// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases and the solution live in challenges.json and challenges/ (-> Postgres, storage).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-javaf-2-2",
    title: "Streams & collectors",
    slug: { _type: "slug", current: "java-streams-collectors-sales-report" },
    description:
        "Mekong Books' monthly sales report was rewritten with streams. It crashed with \"Duplicate key Clean Code\" on the first real month, the hotfix crashed with \"stream has already been operated upon or closed\", and the audit log it was supposed to write stayed empty. Learn how a stream pipeline runs (source, lazy intermediate operations, one terminal operation), toList(), mapToLong for money, comparators with thenComparing and reversed, and the collectors a report needs: toMap with a merge function, groupingBy with counting, summingLong and mapping, partitioningBy and joining - and when a plain loop is the better tool.",
    estimatedTime: 24,

    scenario: {
        role: "Junior backend developer, Mekong Books reporting",
        problem:
            "The monthly sales report was rewritten from loops to streams and passed review with a small sample file. On 1 October, the September run crashed with IllegalStateException: Duplicate key Clean Code. A quick hotfix kept the filtered stream in a variable to reuse it and crashed with \"stream has already been operated upon or closed\". And the audit log that the new code was supposed to fill has been empty since the rewrite.",
    },

    content: [
        h2("1. The incident at Mekong Books"),
        p("Every month, Mekong Books sends the publishers a sales report: revenue per title and the month's total. A sale is a small record (lesson 1-2): the book's ISBN, title, category, the number of copies and the amount paid in whole VND, held in a `long`. Last sprint a teammate replaced the old loops with streams:"),
        code("java", `
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class MonthlyReport {
    record Sale(String isbn, String title, String category, int qty, long amount) {}

    static void print(List<Sale> sales, List<String> auditLog) {
        sales.stream().peek(s -> auditLog.add("REPORTED " + s.isbn()));   // audit trail

        Map<String, Long> revenueByTitle = sales.stream()
            .collect(Collectors.toMap(Sale::title, Sale::amount));
        revenueByTitle.forEach((title, revenue) -> System.out.println(title + ": " + revenue));

        long total = sales.stream().mapToLong(Sale::amount).sum();
        System.out.println("Total: " + total);
    }
}`, "MonthlyReport.java"),
        p("It passed review: the sample file in the test had five sales of five different books. On 1 October the job ran on the real September data, 4,812 sales, and stopped at the first book that had sold on two different days. The report was not sent."),
        p("The on-call developer wanted a fast fix, and also noticed that sales with `qty` 0 (cancelled lines) should be skipped. To avoid writing the filter twice, the hotfix kept the filtered stream in a variable and used it for both the total and the map. That version crashed too, on every run. While digging through the logs, the team found a third problem: the audit table that the `peek` line should fill had not received a single row since the rewrite."),

        h2("2. Reproduce it"),
        p("Three small programs, one per bug. Each one is a complete `Main.java`; the outputs below are exactly what Java 21 prints, with the tab before each `at` shown as spaces."),
        h3("Bug 1: toMap meets the same key twice"),
        code("java", `
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class Main {
    record Sale(String isbn, String title, String category, int qty, long amount) {}

    public static void main(String[] args) {
        List<Sale> september = List.of(
            new Sale("9780132350884", "Clean Code", "Programming", 2, 480_000),
            new Sale("9780735211292", "Atomic Habits", "Self-help", 1, 189_000),
            new Sale("9780132350884", "Clean Code", "Programming", 1, 240_000));

        Map<String, Long> revenueByTitle = september.stream()
            .collect(Collectors.toMap(Sale::title, Sale::amount));
        System.out.println(revenueByTitle);
    }
}

// Exception in thread "main" java.lang.IllegalStateException: Duplicate key Clean Code (attempted merging values 480000 and 240000)
//     at java.base/java.util.stream.Collectors.duplicateKeyException(Collectors.java:135)
//     at java.base/java.util.stream.Collectors.lambda$uniqKeysMapAccumulator$1(Collectors.java:182)
//     at java.base/java.util.stream.ReduceOps$3ReducingSink.accept(ReduceOps.java:169)
//     at java.base/java.util.AbstractList$RandomAccessSpliterator.forEachRemaining(AbstractList.java:722)
//     at java.base/java.util.stream.AbstractPipeline.copyInto(AbstractPipeline.java:509)
//     at java.base/java.util.stream.AbstractPipeline.wrapAndCopyInto(AbstractPipeline.java:499)
//     at java.base/java.util.stream.ReduceOps$ReduceOp.evaluateSequential(ReduceOps.java:921)
//     at java.base/java.util.stream.AbstractPipeline.evaluate(AbstractPipeline.java:234)
//     at java.base/java.util.stream.ReferencePipeline.collect(ReferencePipeline.java:682)
//     at Main.main(Main.java:15)`, "Main.java"),
        p("Read the message: `toMap(keyMapper, valueMapper)` builds a map with one entry per element. When a second element produces a key that is already in the map, it does not know whether to keep the old value, the new one or add them, so it throws. The message names the key and both values: `480000` from the first Clean Code line and `240000` from the second. The last stack line, `Main.java:15`, is the `.collect(...)` line of your code."),
        h3("Bug 2: one stream, used twice"),
        code("java", `
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class Main {
    record Sale(String isbn, String title, String category, int qty, long amount) {}

    public static void main(String[] args) {
        List<Sale> september = List.of(
            new Sale("9780132350884", "Clean Code", "Programming", 2, 480_000),
            new Sale("9780735211292", "Atomic Habits", "Self-help", 0, 0));

        Stream<Sale> paid = september.stream().filter(s -> s.qty() > 0);
        long total = paid.mapToLong(Sale::amount).sum();
        System.out.println("Total: " + total);
        Map<String, Long> byTitle = paid.collect(
            Collectors.toMap(Sale::title, Sale::amount, Long::sum));
        System.out.println(byTitle);
    }
}

// Total: 480000
// Exception in thread "main" java.lang.IllegalStateException: stream has already been operated upon or closed
//     at java.base/java.util.stream.AbstractPipeline.evaluate(AbstractPipeline.java:229)
//     at java.base/java.util.stream.ReferencePipeline.collect(ReferencePipeline.java:682)
//     at Main.main(Main.java:17)`, "Main.java"),
        p("The first use (`sum()`) works. The second use of the same `Stream` object fails, no matter what the data is. A stream is not a collection: it is a one-way pass over a source, and once a terminal operation has run, it is used up."),
        h3("Bug 3: a pipeline that never runs"),
        code("java", `
import java.util.ArrayList;
import java.util.List;

public class Main {
    record Sale(String isbn, String title, String category, int qty, long amount) {}

    public static void main(String[] args) {
        List<Sale> september = List.of(
            new Sale("9780132350884", "Clean Code", "Programming", 2, 480_000),
            new Sale("9780735211292", "Atomic Habits", "Self-help", 1, 189_000));
        List<String> audit = new ArrayList<>();

        september.stream()
            .peek(s -> audit.add(s.isbn()))
            .map(Sale::title);
        System.out.println("audit lines: " + audit.size());

        long count = september.stream().peek(s -> audit.add(s.isbn())).count();
        System.out.println(count + " sales, audit lines: " + audit.size());
    }
}

// audit lines: 0
// 2 sales, audit lines: 0`, "Main.java"),
        p("No exception and no warning, even with `javac -Xlint:all`. The first pipeline has no terminal operation, so nothing in it runs. The second one has a terminal operation, `count()`, and the `peek` **still** does not run: the list knows its own size, so `count()` returns 2 without sending a single element through the pipeline. Code with side effects (writing to a list, a log, a database) does not belong in `peek` or `map`."),

        h2("3. How a stream pipeline runs"),
        p("A **stream** is a sequence of elements that you process with a chain of operations. It holds no data of its own; it pulls the elements from a **source**, here `sales.stream()` on a `List`. Every pipeline has three parts:"),
        bullets([
            "**Source** - `list.stream()`, `set.stream()`, `map.entrySet().stream()`, `Stream.of(a, b, c)`.",
            "**Intermediate operations** - each one returns a new stream: `filter` (keep the elements that pass a test), `map` (turn each element into something else), `sorted`, `distinct` (drop duplicates, using `equals`), `limit(n)` (stop after n elements). They are **lazy**: calling them only records the step.",
            "**One terminal operation** - `toList()`, `collect(...)`, `sum()`, `count()`, `forEach(...)`, `findFirst()`. It starts the pipeline, pulls the elements through it and produces the result. After that the stream is closed.",
        ]),
        p("The elements do not go through the steps one stage at a time (all filters, then all maps). Each element travels through the whole chain before the next one starts. Print from inside the lambdas and you can see it:"),
        code("java", `
List<Sale> sales = List.of(
    new Sale("9780132350884", "Clean Code", "Programming", 2, 480_000),
    new Sale("9780735211292", "Atomic Habits", "Self-help", 0, 0),
    new Sale("9780441172719", "Dune", "Novels", 1, 210_000));

List<String> titles = sales.stream()
    .filter(s -> {
        System.out.println("filter " + s.title());
        return s.qty() > 0;
    })
    .map(s -> {
        System.out.println("  map  " + s.title());
        return s.title().toUpperCase();
    })
    .toList();
System.out.println(titles);

// filter Clean Code
//   map  Clean Code
// filter Atomic Habits
// filter Dune
//   map  Dune
// [CLEAN CODE, DUNE]`, "Main.java"),
        image("stream-pipeline-conveyor", {
            alt: "Diagram. Top: a pipeline of four boxes joined by arrows - source sales.stream(), intermediate (lazy) .filter(s -> s.qty() > 0), intermediate (lazy) .map(Sale::title), terminal .toList() which pulls the elements. Under them, three rows show each sale travelling through the steps: 1. Clean Code, qty 2 passes the filter, becomes \"Clean Code\" and is added to the list; 2. Atomic Habits, qty 0 is dropped by the filter so map never sees it; 3. Dune, qty 1 passes, becomes \"Dune\" and is added. A note says that without .toList() or another terminal operation none of these rows happens, and after it the stream is used up. Bottom left, red: toMap(Sale::title, Sale::amount) puts Clean Code -> 480000 and Atomic Habits -> 189000 as new keys, then Clean Code -> 240000 finds the key already there and throws IllegalStateException: Duplicate key Clean Code (attempted merging values 480000 and 240000). Bottom right, green: toMap(Sale::title, Sale::amount, Long::sum) combines the second Clean Code with Long.sum(480000, 240000), giving Clean Code=720000 and Atomic Habits=189000; a fourth argument picks the map: LinkedHashMap::new keeps first-seen order, TreeMap::new sorts the keys.",
            caption: "Intermediate operations only describe the work; the terminal operation pulls each element through the whole chain, once.",
        }),
        p("Two consequences follow. `limit(1)` really stops early: in `sales.stream().filter(s -> s.qty() > 0).map(Sale::title).limit(1).toList()` the filter never looks at Dune, and the result is `[Clean Code]`. And a stream you need twice must be created twice - from the list, which you can stream as often as you like."),
        h3("toList() or collect(Collectors.toList())"),
        code("java", `
List<String> a = Stream.of("Dune", "Clean Code").collect(Collectors.toList());
a.add("Sapiens");
System.out.println(a + " " + a.getClass().getSimpleName());
// [Dune, Clean Code, Sapiens] ArrayList

List<String> b = Stream.of("Dune", "Clean Code").toList();
b.add("Sapiens");
// Exception in thread "main" java.lang.UnsupportedOperationException
//     at java.base/java.util.ImmutableCollections.uoe(ImmutableCollections.java:142)
//     at java.base/java.util.ImmutableCollections$AbstractImmutableCollection.add(ImmutableCollections.java:147)`, "Main.java"),
        p("`Stream.toList()` (Java 16+) returns an **unmodifiable** list: shorter to write, and safe to hand to other code because nobody can change it. `collect(Collectors.toList())` today returns an `ArrayList`, but the documentation promises nothing about its type or whether it can be changed. Use `toList()` by default; if you really need a list you will add to, say so: `collect(Collectors.toCollection(ArrayList::new))`. Lesson 2-3 covers unmodifiable collections in depth."),
        h3("Sums of money: mapToLong"),
        p("`map` gives you a `Stream<Long>` of boxed objects with no `sum()` method. `mapToLong` gives you a `LongStream`, a stream of plain `long` values with `sum()`, `max()` and `average()`: `sales.stream().mapToLong(Sale::amount).sum()` is `690000` for the three sales above. Prices stay `long`, never `double`. Watch the multiplication too: `qty * unitPrice` with an `int` qty and a `long` price is a `long`, but two `int`s overflow above 2,147,483,647 (lesson 1-1). `mapToInt(Sale::qty).sum()` is fine for copies."),

        h2("4. Sorting with comparators"),
        p("`sorted()` with no argument uses the natural order (A-Z for strings, small to large for numbers). For records you pass a **comparator**, an object that says which of two elements comes first. You rarely write one by hand; you build it:"),
        code("java", `
List<Sale> sales = List.of(
    new Sale("9780441172719", "Dune", "Novels", 1, 210_000),
    new Sale("9780132350884", "Clean Code", "Programming", 2, 480_000),
    new Sale("9780735211292", "Atomic Habits", "Self-help", 2, 378_000),
    new Sale("9780062316097", "Sapiens", "History", 1, 210_000));

List<String> byAmount = sales.stream()
    .sorted(Comparator.comparingLong(Sale::amount).reversed()
        .thenComparing(Sale::title))
    .map(s -> s.title() + " " + s.amount())
    .toList();
// [Clean Code 480000, Atomic Habits 378000, Dune 210000, Sapiens 210000]

List<String> wrong = sales.stream()
    .sorted(Comparator.comparingLong(Sale::amount)
        .thenComparing(Sale::title).reversed())
    .map(s -> s.title() + " " + s.amount())
    .toList();
// [Clean Code 480000, Atomic Habits 378000, Sapiens 210000, Dune 210000]`, "Main.java"),
        bullets([
            "**`Comparator.comparing(Sale::title)`** compares by one field; `comparingLong` / `comparingInt` do the same for number fields without boxing.",
            "**`thenComparing(...)`** breaks ties: it is only used when the first comparison says \"equal\". Dune and Sapiens both have 210,000, so the title decides.",
            "**`reversed()` reverses everything to its left.** In the first chain it reverses only the amount, so ties stay A-Z. In the second, it is called on the whole chain and turns the tie-break into Z-A: Sapiens before Dune. Put `reversed()` right after the part you want descending.",
        ]),
        callout("warning", "A lambda before reversed() loses its type",
            "Comparator.comparing(s -> s.amount()).reversed() does not compile: \"cannot find symbol: method amount(), location: variable s of type Object\". Java cannot work out the type of s when another method is chained after it. A method reference (Sale::amount) works, and so does a typed lambda: (Sale s) -> s.amount()."),
        h3("Sorting a map by its values"),
        p("A map has no `sorted()`, but its `entrySet()` is a set of key-value pairs (`Map.Entry`) that you can stream. `Map.Entry.comparingByValue()` and `comparingByKey()` build the comparators. Here the order counts per delivery city, most orders first, ties by name:"),
        code("java", `
Map<String, Long> ordersPerCity = Map.of("Hà Nội", 3L, "Huế", 1L, "Đà Nẵng", 3L, "Cần Thơ", 2L);
List<String> cities = ordersPerCity.entrySet().stream()
    .sorted(Map.Entry.<String, Long>comparingByValue(Comparator.reverseOrder())
        .thenComparing(Map.Entry::getKey))
    .map(e -> e.getKey() + "=" + e.getValue())
    .toList();
System.out.println(cities);
// [Hà Nội=3, Đà Nẵng=3, Cần Thơ=2, Huế=1]`, "Main.java"),
        p("`comparingByValue(Comparator.reverseOrder())` compares the values largest first; `comparingByValue().reversed()` does the same, and `Map.Entry.comparingByKey()` is the ready-made comparator for the keys. `Map.Entry.<String, Long>comparingByValue(...)` spells out the types for the same reason as the warning above: another method is chained after it. Notice also that `Đà Nẵng` sorts after `Hà Nội`: `String.compareTo` compares character codes, and `Đ` (U+0110) is greater than every plain Latin letter. That is fine for a stable tie-break; for a list that people read in Vietnamese alphabetical order you would use `java.text.Collator`."),

        h2("5. Collectors: building maps and strings"),
        p("`collect(...)` is the terminal operation that builds a container, and the `Collectors` class holds the recipes. All examples below use these five September sales:"),
        code("java", `
List<Sale> sales = List.of(
    new Sale("9780132350884", "Clean Code", "Programming", 2, 480_000),
    new Sale("9780735211292", "Atomic Habits", "Self-help", 1, 189_000),
    new Sale("9780441172719", "Dune", "Novels", 1, 210_000),
    new Sale("9780132350884", "Clean Code", "Programming", 1, 240_000),
    new Sale("9780201616224", "The Pragmatic Programmer", "Programming", 1, 350_000));`, "Main.java"),
        h3("toMap: one entry per key, with a rule for duplicates"),
        code("java", `
Map<String, Long> byTitle = sales.stream()
    .collect(Collectors.toMap(Sale::title, Sale::amount, Long::sum));
// {Atomic Habits=189000, Clean Code=720000, The Pragmatic Programmer=350000, Dune=210000}

Map<String, Long> inOrder = sales.stream()
    .collect(Collectors.toMap(Sale::title, Sale::amount, Long::sum, LinkedHashMap::new));
// {Clean Code=720000, Atomic Habits=189000, Dune=210000, The Pragmatic Programmer=350000}

Map<String, Long> sorted = sales.stream()
    .collect(Collectors.toMap(Sale::title, Sale::amount, Long::sum, TreeMap::new));
// {Atomic Habits=189000, Clean Code=720000, Dune=210000, The Pragmatic Programmer=350000}`, "Main.java"),
        bullets([
            "**Third argument: the merge function.** It receives the value already in the map and the new one and returns what to keep. `Long::sum` adds them (480000 + 240000 = 720000). `(a, b) -> a` keeps the first, `(a, b) -> b` the last. Only leave it out when a duplicate key really is a bug that should stop the program.",
            "**Fourth argument: the map to fill.** Without it you get a `HashMap`, whose order depends on the keys' hash codes - look at the first line, neither input order nor A-Z. `LinkedHashMap::new` keeps the order in which keys were first seen; `TreeMap::new` keeps the keys sorted.",
        ]),
        h3("groupingBy: a group of elements per key"),
        code("java", `
Map<String, List<Sale>> groups = sales.stream()
    .collect(Collectors.groupingBy(Sale::category));
// keys [Self-help, Programming, Novels], groups.get("Programming").size() is 3

Map<String, Long> linesPerCategory = sales.stream()
    .collect(Collectors.groupingBy(Sale::category, Collectors.counting()));
// {Self-help=1, Programming=3, Novels=1}

Map<String, Integer> copiesPerCategory = sales.stream()
    .collect(Collectors.groupingBy(Sale::category, Collectors.summingInt(Sale::qty)));
// {Self-help=1, Programming=4, Novels=1}

Map<String, Long> revenuePerCategory = sales.stream()
    .collect(Collectors.groupingBy(Sale::category, TreeMap::new,
        Collectors.summingLong(Sale::amount)));
// {Novels=210000, Programming=1070000, Self-help=189000}

Map<String, Set<String>> titlesPerCategory = sales.stream()
    .collect(Collectors.groupingBy(Sale::category, TreeMap::new,
        Collectors.mapping(Sale::title, Collectors.toCollection(TreeSet::new))));
// {Novels=[Dune], Programming=[Clean Code, The Pragmatic Programmer], Self-help=[Atomic Habits]}`, "Main.java"),
        p("`groupingBy(classifier)` puts every element in a list under its key. Unlike `toMap`, duplicates are the whole point, so it never throws. The optional last argument is a **downstream collector** that decides what to keep per group instead of the list:"),
        bullets([
            "**`counting()`** counts the **elements** in the group and returns a `Long`, not an `int`: `int n = linesPerCategory.get(\"Programming\");` does not compile (\"incompatible types: Long cannot be converted to int\"). Note that it counts sale lines: Programming has 3 lines but 4 copies.",
            "**`summingInt` / `summingLong`** add up a number field per group: copies with `summingInt(Sale::qty)`, money with `summingLong(Sale::amount)`.",
            "**`mapping(f, downstream)`** turns each element into something else before collecting it - here the titles, into a sorted set, so Clean Code appears once.",
            "**The map type goes in the middle**: `groupingBy(key, TreeMap::new, downstream)`. The default is again a `HashMap` with hash order.",
        ]),
        h3("partitioningBy and joining"),
        code("java", `
Map<Boolean, List<String>> bigOrders = sales.stream()
    .collect(Collectors.partitioningBy(s -> s.amount() >= 300_000,
        Collectors.mapping(Sale::title, Collectors.toList())));
// {false=[Atomic Habits, Dune, Clean Code], true=[Clean Code, The Pragmatic Programmer]}

String line = sales.stream().map(Sale::title).distinct()
    .collect(Collectors.joining(", ", "[", "]"));
// [Clean Code, Atomic Habits, Dune, The Pragmatic Programmer]`, "Main.java"),
        p("`partitioningBy` is `groupingBy` with a yes/no test: the result always has exactly two keys, `false` and `true`, even if one list is empty. `joining(separator, prefix, suffix)` glues strings together, which is how you build one line of a report from many values."),
        callout("tip", "Reading a collector chain",
            "Read it from the outside in: groupingBy(category, TreeMap::new, summingLong(amount)) means \"a TreeMap from category to the sum of amount\". The type you write on the left, Map<String, Long>, should say the same thing."),

        h2("6. Build it: the monthly report"),
        p("Now write the report Mekong Books should have shipped. The runner reads one sale per line in the format `date;isbn;title;category;qty;unitPrice`, and you write one method that returns the report lines: revenue per category with the biggest first, the top N titles by copies sold and the totals. The test months are realistic, so the same title sells on several days, categories tie, and one month passes 3 billion VND."),
        challenge("chal_coding_javaf_221", "Group the sales by category with a summing downstream collector, then stream the map's entrySet() and sort it with a comparator that is descending on the value and A-Z on the key. For copies per title, decide how duplicate titles are combined, and remember that copies are the sum of qty, not the number of lines. limit(n) takes the top N."),

        h2("7. When a loop is clearer"),
        p("Streams shine when the work is \"for every element, keep / transform / group / add up\". A plain `for` loop is clearer when the steps depend on each other or the loop must stop on a condition. Fulfilling orders from limited stock is a good example: each order changes the stock the next one sees, and you stop at the first order that cannot be filled."),
        code("java", `
List<Sale> orders = List.of(
    new Sale("9780441172719", "Dune", "Novels", 2, 420_000),
    new Sale("9780441172719", "Dune", "Novels", 1, 210_000),
    new Sale("9780441172719", "Dune", "Novels", 3, 630_000));
int stock = 4;
for (Sale s : orders) {
    if (s.qty() > stock) {
        System.out.println("Out of stock: wanted " + s.qty() + ", have " + stock);
        break;
    }
    stock -= s.qty();
}
System.out.println("Left: " + stock);

// Out of stock: wanted 3, have 1
// Left: 1`, "Main.java"),
        p("A stream version would need a variable changed from inside a lambda - which Java forbids for local variables (\"local variables referenced from a lambda expression must be final or effectively final\") - or a trick with an array. Use a loop when you need running state, an early `break`, the index of the element, a checked exception inside the step, or a side effect such as writing a log. Use a stream for filtering, mapping, grouping and summing. Mixing both in one method is normal."),

        h2("8. The fix"),
        code("java", `
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

public class MonthlyReport {
    record Sale(String isbn, String title, String category, int qty, long amount) {}

    static void print(List<Sale> sales, List<String> auditLog) {
        List<Sale> paid = sales.stream()
            .filter(s -> s.qty() > 0)
            .toList();   // a List can be streamed again and again; a Stream only once

        Map<String, Long> revenueByTitle = paid.stream()
            .collect(Collectors.toMap(Sale::title, Sale::amount, Long::sum, TreeMap::new));
        revenueByTitle.forEach((title, revenue) ->
            System.out.println(String.format(Locale.ROOT, "%s: %,d", title, revenue)));

        long total = paid.stream().mapToLong(Sale::amount).sum();
        System.out.println(String.format(Locale.ROOT, "Total: %,d VND", total));

        for (Sale s : paid) {
            auditLog.add("REPORTED " + s.isbn());   // a side effect: a plain loop says so
        }
    }

    public static void main(String[] args) {
        List<Sale> september = List.of(
            new Sale("9780132350884", "Clean Code", "Programming", 2, 480_000),
            new Sale("9780735211292", "Atomic Habits", "Self-help", 1, 189_000),
            new Sale("9780441172719", "Dune", "Novels", 0, 0),
            new Sale("9780132350884", "Clean Code", "Programming", 1, 240_000));
        List<String> auditLog = new ArrayList<>();
        print(september, auditLog);
        System.out.println(auditLog);
    }
}

// Atomic Habits: 189,000
// Clean Code: 720,000
// Total: 909,000 VND
// [REPORTED 9780132350884, REPORTED 9780735211292, REPORTED 9780132350884]`, "MonthlyReport.java"),
        numbered([
            "**Duplicate titles are merged, not fatal.** `Long::sum` adds the revenue of every Clean Code line, and `TreeMap::new` prints the titles A-Z every month instead of in hash order.",
            "**The filtered data is a `List`, not a `Stream`.** `toList()` runs the filter once; each use then creates its own fresh stream with `paid.stream()`.",
            "**The side effect moved out of the pipeline.** The audit log is written by a loop that always runs, instead of a `peek` that runs only when (and if) a terminal operation decides to pull elements.",
            "**Money is `long` and summed with `mapToLong`**, and printed with `Locale.ROOT` so the separators do not depend on the server's language settings.",
        ]),

        h2("9. Pitfalls"),
        bullets([
            "**`toMap` without a merge function throws on the first duplicate key** - `IllegalStateException: Duplicate key ... (attempted merging values ... and ...)`. Real data has duplicates even when your test file does not.",
            "**A stream can be consumed only once.** Storing a `Stream` in a field or variable and using it twice gives `IllegalStateException: stream has already been operated upon or closed`. Store the `List` instead.",
            "**No terminal operation, no work.** A pipeline that ends in `filter`, `map` or `peek` does nothing at all, and the compiler does not warn you.",
            "**`peek` and side effects in `map` are unreliable.** `count()` on a list skips the pipeline entirely; `limit` and `findFirst` stop early. Use `peek` only for temporary debug printing.",
            "**`HashMap` order is not an order.** `groupingBy` and `toMap` return a `HashMap` unless you pass `TreeMap::new` or `LinkedHashMap::new`, or sort the entries before printing.",
            "**`reversed()` reverses the whole comparator built so far.** `comparing(a).thenComparing(b).reversed()` makes the tie-break descending too.",
            "**`counting()` returns `Long` and counts elements.** It is not the sum of a quantity field; use `summingInt(Sale::qty)` for copies.",
            "**`toList()` is unmodifiable.** `add` on it throws `UnsupportedOperationException`.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every pipeline ends in exactly one terminal operation, and every stream is created right where it is used (`list.stream()`), never stored and reused.",
            "Every `toMap` either has a merge function or is on data where a duplicate key is truly impossible (a primary key such as an order id).",
            "Maps that are printed or compared in tests have a defined order: `TreeMap::new`, `LinkedHashMap::new`, or sorted entries.",
            "Comparators are built with `comparing` / `comparingLong` and `thenComparing`, with `reversed()` placed right after the part that is descending.",
            "Money is summed with `mapToLong(...).sum()` or `summingLong`, never with `double`; copies are summed, not counted.",
            "Results are collected with `toList()` unless you need a list you can change.",
            "Side effects (logs, audit rows, writes) live in a loop or a `forEach` at the end, not in `peek` or `map`; running state and early exits use a plain loop.",
        ]),
    ],
});
