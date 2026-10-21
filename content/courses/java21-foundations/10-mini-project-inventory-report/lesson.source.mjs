// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases and the solution live in challenges.json and challenges/ (-> Postgres, storage).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-javaf-4-2",
    title: "Mini project: an inventory report",
    slug: { _type: "slug", current: "java-mini-project-inventory-report" },
    description:
        "Mekong Books' Monday inventory report counted one book twice because its ISBN was written two ways, called an empty shelf \"OK\", crashed on one broken row and printed warehouses in a different order every week. Rebuild it step by step with everything from the course: records with compact constructors, enums and switch, the right Map, streams and collectors, a sealed Ok/Bad result, Optional lookups, per-line error handling and an unmodifiable result.",
    estimatedTime: 25,

    scenario: {
        role: "Junior backend developer, Mekong Books warehouse tools",
        problem:
            "Every Monday at 7:00 a small Java script turns the warehouse export into a stock report for the purchasing team. Last Monday it crashed on one row with a missing column; someone deleted the row by hand and ran it again. The report then showed \"Clean Code\" twice in Hanoi, both times as LOW, and \"Dune\" in Can Tho as OK with 0 copies. Purchasing ordered 40 copies of a book Hanoi already had enough of and none of the book Can Tho had run out of.",
    },

    content: [
        h2("1. The incident at Mekong Books"),
        p("Mekong Books ships from four warehouses: Hanoi, Da Nang, Hue and Can Tho. Each warehouse system exports its stock as text, one line per book, and the files are joined into one export:"),
        code("text", `
Hanoi;978-604-1-11111-1;Clean Code;4;5
Can Tho;9786042222222;Dune;0;0
Hanoi;9786041111111;Clean Code;3;5
Da Nang;9786043333333;Sapiens;6;6
Da Nang;9786044444444;Effective Java;12
Hue;9786045555555;Atomic Habits;9;4`, "inventory.txt"),
        p("The fields are `warehouse;isbn;title;qty;reorderLevel`. The **reorder level** is the stock at which purchasing should order more: with 5 or fewer copies of Clean Code left in Hanoi, it is time to reorder. Two years ago someone wrote the report in ten minutes:"),
        code("java", `
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class MondayReport {
    static void printReport(List<String> lines) {
        Map<String, Integer> stock = new HashMap<>();     // key: "warehouse|isbn"
        Map<String, Integer> reorder = new HashMap<>();
        for (String line : lines) {
            String[] f = line.split(";");
            String key = f[0] + "|" + f[1];
            stock.merge(key, Integer.parseInt(f[3]), Integer::sum);
            reorder.put(key, Integer.parseInt(f[4]));
        }
        for (var e : stock.entrySet()) {
            String status = e.getValue() < reorder.get(e.getKey()) ? "LOW" : "OK";
            System.out.println(e.getKey() + " qty " + e.getValue() + " " + status);
        }
    }

    public static void main(String[] args) throws IOException {
        printReport(Files.readAllLines(Path.of("inventory.txt")));
    }
}`, "MondayReport.java"),
        p("It looks reasonable, and for two years nobody looked at it. Last Monday it failed in four different ways at once."),

        h2("2. Reproduce it"),
        p("Put `printReport` at the top of a class named `Main`, right after the imports `java.util.HashMap`, `java.util.List` and `java.util.Map` (so the line numbers below match), and add this `main`. The first call gets the export without the broken Effective Java row, the second call gets only that row:"),
        code("java", `
    public static void main(String[] args) {
        String monday = """
                Hanoi;978-604-1-11111-1;Clean Code;4;5
                Can Tho;9786042222222;Dune;0;0
                Hanoi;9786041111111;Clean Code;3;5
                Da Nang;9786043333333;Sapiens;6;6
                Hue;9786045555555;Atomic Habits;9;4
                """;
        printReport(monday.lines().toList());
        System.out.println("---");
        printReport(List.of("Da Nang;9786044444444;Effective Java;12"));
    }`, "Main.java"),
        code("text", `
Hanoi|9786041111111 qty 3 LOW
Hanoi|978-604-1-11111-1 qty 4 LOW
Hue|9786045555555 qty 9 OK
Da Nang|9786043333333 qty 6 OK
Can Tho|9786042222222 qty 0 OK
---
Exception in thread "main" java.lang.ArrayIndexOutOfBoundsException: Index 4 out of bounds for length 4
	at Main.printReport(Main.java:13)
	at Main.main(Main.java:31)`),
        numbered([
            "**One book, two keys.** `978-604-1-11111-1` and `9786041111111` are the same ISBN written two ways, but as strings they are different keys. Hanoi has 4 + 3 = 7 copies of Clean Code, which is above the reorder level of 5. The report shows two LOW lines instead of one OK line, and purchasing reordered it.",
            "**An empty shelf is OK.** `0 < 0` is false, so Dune in Can Tho, with 0 copies and a reorder level nobody had set, is reported OK. Sapiens in Da Nang has exactly its reorder level, 6 copies for a level of 6, and is OK too, although \"reorder at 6\" means 6 or fewer is LOW.",
            "**One bad row stops everything.** `\"...;Effective Java;12\".split(\";\")` has 4 parts, `f[4]` throws `ArrayIndexOutOfBoundsException`, and the report for all four warehouses is lost.",
            "**The order changes with the data.** A `HashMap` gives its entries in an order that depends on the hash codes of the keys. The purchasing team reads the report top to bottom, and a different order every week makes it easy to miss a line.",
        ]),

        h2("3. The plan: one job per step"),
        p("You already know every tool needed to fix this. The trick is to stop doing everything in one loop and split the work into steps, where each step has one job and one type that comes out of it:"),
        image("report-pipeline", {
            alt: "Pipeline diagram in five boxes from left to right. 1, Raw lines: warehouse;isbn;title;qty;reorderLevel, with the same ISBN written as 978-604-1-11111-1, 978 604 1 11111 1 and 9786041111111, a row with qty two and a blank line; one book, three spellings. 2, Parse each line: every line becomes Ok(Item) or Bad(line, why) of a sealed ParseResult, using a compact constructor and a try/catch per line; blank lines are skipped. The Bad results go down to a red box, Rejected lines in input order, for example line 8: bad qty: two, which is printed at the end of the report. The Ok results go to 3, Merge by ISBN: the key is the 13 digits only, one entry per book per warehouse, qty is added up and the highest reorder level is kept, with Map.merge. 4, Classify with an enum and a switch: OUT_OF_STOCK when qty == 0, LOW when qty <= reorder level, OK otherwise. 5, Sorted report: warehouses A to Z with a TreeMap, books by status then title with a Comparator, a Reorder list with totals, the rejected lines, all returned as an unmodifiable List. A strip at the bottom lists what each step reuses from the course: records 1.2, enums and switch 1.3, Map and Set 2.1, streams 2.2, unmodifiable lists 2.3, sealed types 3.1, Optional 3.2, exceptions 4.1.",
            caption: "Parse, merge, classify, sort: each of Monday's bugs is fixed in exactly one step.",
        }),
        bullets([
            "**Parse** turns one text line into a value you can trust, or into a reason why not. Nothing after this step sees raw text.",
            "**Merge** decides what \"the same book\" means: same warehouse and same ISBN after normalising.",
            "**Classify** turns numbers into a status, in one place, with the boundaries written once.",
            "**Sort and print** decide the order. They never change the numbers.",
        ]),
        p("The rest of the lesson builds these steps one at a time. The code is close to what you will write in the challenge, but the challenge adds its own rules (exact reasons, totals, a reorder list), so read the starter header carefully."),

        h2("4. Step 1: types that cannot hold bad data"),
        p("Start with the values. An ISBN-13 is 13 digits; hyphens and spaces are only there for humans. Put that rule in a record with a **compact constructor** (lesson \"Classes, records & equals/hashCode\"): the constructor without a parameter list that runs before the fields are assigned, where you may check and replace the parameters."),
        code("java", `
record Isbn(String digits) {
    Isbn {
        digits = digits.strip().replace("-", "").replace(" ", "");
        if (!digits.matches("[0-9]{13}")) {
            throw new IllegalArgumentException("ISBN needs 13 digits: " + digits);
        }
    }
}

System.out.println(new Isbn("978-604-1-11111-1").equals(new Isbn(" 9786041111111 ")));  // true
new Isbn("978604555555");   // IllegalArgumentException: ISBN needs 13 digits: 978604555555`, "Isbn.java"),
        p("Because the compact constructor normalises `digits` before the field is set, two spellings of the same ISBN become **equal** records with the same `hashCode`. Used as a map key, they land on the same entry: bug 1 cannot happen any more, whatever the warehouse system sends."),
        p("The stock line itself is a record too. It trusts `Isbn` for the ISBN and checks the rest:"),
        code("java", `
record Item(String warehouse, Isbn isbn, String title, int qty, int reorderLevel) {
    Item {
        warehouse = warehouse.strip();
        title = title.strip();
        if (warehouse.isEmpty() || title.isEmpty()) {
            throw new IllegalArgumentException("warehouse and title are required");
        }
        if (qty < 0 || reorderLevel < 0) {
            throw new IllegalArgumentException("negative number in " + isbn.digits());
        }
    }
}

enum Status { OUT_OF_STOCK, LOW, OK }   // declared worst first, on purpose`, "Item.java"),
        callout("tip", "Declaration order is sort order",
            "Enum constants compare in the order they are declared (lesson \"Enums & switch expressions\"): OUT_OF_STOCK.compareTo(OK) is negative. Declaring the worst status first means sorting by status puts the urgent lines at the top for free."),

        h2("5. Step 2: parse one line, never throw"),
        p("Parsing can fail for many reasons: too few fields, a bad ISBN, `two` instead of `2`. The incident code let those failures escape as exceptions, and one exception killed the whole report. Instead, make failure a normal **value** with a sealed interface (lesson \"Sealed interfaces & pattern matching for switch\"):"),
        code("java", `
sealed interface ParseResult permits Ok, Bad {}
record Ok(Item item) implements ParseResult {}
record Bad(int lineNo, String reason) implements ParseResult {
    // lineNo counts from 1, blank lines included, so people can find the row
}`, "ParseResult.java"),
        p("The parse method catches exceptions **around one line only** (lesson \"Exceptions & try-with-resources\"), so a bad row becomes a `Bad` and the loop carries on:"),
        code("java", `
static ParseResult parseLine(int lineNo, String line) {
    String[] fields = line.split(";", -1);
    if (fields.length != 5) return new Bad(lineNo, fields.length + " fields, need 5");
    try {
        return new Ok(new Item(fields[0], new Isbn(fields[1]), fields[2],
                Integer.parseInt(fields[3].strip()), Integer.parseInt(fields[4].strip())));
    } catch (IllegalArgumentException e) {      // NumberFormatException is one too
        return new Bad(lineNo, e.getMessage());
    }
}`, "Parser.java"),
        bullets([
            "**`split(\";\", -1)`** keeps empty fields. Plain `split(\";\")` drops empty strings at the end: `\"Da Nang;9786044444444;Effective Java;12;\".split(\";\")` has length 4, with `-1` it has length 5. With `-1`, a missing reorder level becomes an empty field you can report, not a missing index.",
            "**Check the count before you index.** After the length check, `fields[4]` cannot throw.",
            "**`NumberFormatException` extends `IllegalArgumentException`.** One `catch` handles both the record's own checks and `Integer.parseInt(\"two\")`. Catch the narrowest type that covers your failures, never `Exception`: a bug in your own code (a `NullPointerException`) should still crash loudly in testing.",
            "**`Integer.parseInt` does not trim.** `Integer.parseInt(\" 5\")` throws `NumberFormatException: For input string: \" 5\"`, so `strip()` first.",
        ]),
        p("Reading the results is a `switch` over the sealed type. The compiler knows `Ok` and `Bad` are the only cases, so no `default` is needed, and a third result type added later would turn every such switch into a compile error until it is handled:"),
        code("java", `
List<Item> items = new ArrayList<>();
List<Bad> rejected = new ArrayList<>();
for (int i = 0; i < lines.size(); i++) {
    if (lines.get(i).isBlank()) continue;           // skipped, but still counted
    switch (parseLine(i + 1, lines.get(i))) {
        case Ok(Item item) -> items.add(item);       // record pattern
        case Bad b -> rejected.add(b);
    }
}`),

        h2("6. Step 3: merge, classify and sort"),
        h3("Merge with the right map"),
        p("Choosing the map is choosing the behaviour (lesson \"Choosing List, Set or Map\"). The book key is `Isbn`, whose `equals` already ignores spelling, so a `HashMap` is fine for it. The warehouses must come out in alphabetical order, so they go in a `TreeMap`, which keeps its keys sorted. A collector can build both levels at once (lesson \"Streams & collectors\"):"),
        code("java", `
record Stock(int qty, int reorderLevel) {
    Stock plus(Stock more) {
        return new Stock(qty + more.qty, Math.max(reorderLevel, more.reorderLevel));
    }
}

Map<String, Map<Isbn, Stock>> byWarehouse = items.stream()
        .collect(Collectors.groupingBy(Item::warehouse, TreeMap::new,
                Collectors.toMap(Item::isbn,
                        it -> new Stock(it.qty(), it.reorderLevel()), Stock::plus)));`),
        p("`groupingBy(classifier, mapFactory, downstream)` groups the items by warehouse into the map that `TreeMap::new` creates, and `toMap` builds the inner map. The third argument of `toMap`, `Stock::plus`, is the **merge function**: it is called when two lines have the same key, and it decides that quantities add up and the higher reorder level wins. Without it, a duplicate key is an error:"),
        code("java", `
List.of("A;1", "A;2").stream().collect(Collectors.toMap(l -> l.split(";")[0], l -> l));
// IllegalStateException: Duplicate key A (attempted merging values A;1 and A;2)`),
        h3("Classify with a switch"),
        p("The status rule is written once, in a switch expression (lesson \"Enums & switch expressions\"). Guards with `when` express ranges that a plain `case 0` cannot:"),
        code("java", `
// inside record Stock
Status status() {
    return switch (this) {
        case Stock s when s.qty() == 0 -> Status.OUT_OF_STOCK;
        case Stock s when s.qty() <= s.reorderLevel() -> Status.LOW;
        case Stock s -> Status.OK;
    };
}
// new Stock(0, 0) -> OUT_OF_STOCK   new Stock(6, 6) -> LOW   new Stock(7, 6) -> OK`),
        p("The order of the cases is the rule: \"empty\" is checked before \"low\", so a book with 0 copies and a reorder level of 0 is OUT_OF_STOCK, not OK. And `<=` says what purchasing means by \"5 or fewer\". Write the boundary cases (0, equal, one above) next to the code, as above, and you will not get them wrong twice."),
        h3("Sort, look up, and hand back a list nobody can change"),
        bullets([
            "**Sort with a `Comparator` chain:** `Comparator.comparing(...status...).thenComparing(...title...)`. Status first uses the enum order, so OUT_OF_STOCK lines lead. Add a last `thenComparing` on a unique key (the ISBN) so two books with the same title still come out in a fixed order.",
            "**One title per ISBN.** The same book may be typed slightly differently in two warehouses. Pick one rule, for example the first title seen: `Collectors.toMap(Item::isbn, Item::title, (first, later) -> first)`.",
            "**Lookups that may miss return `Optional`** (lesson \"Optional & null safety\"). `Map.get` returns `null` for a missing key; wrap it once, at the edge, and give the reader a sensible default.",
            "**Return an unmodifiable list** (lesson \"Immutable collections & defensive copies\"). The report is a result, not a working buffer: `List.copyOf(out)` or `stream.toList()` make sure no caller can add or remove lines afterwards. `add` on such a list throws `UnsupportedOperationException`.",
        ]),
        code("java", `
static String titleOf(Map<Isbn, String> titles, String rawIsbn) {
    return Optional.ofNullable(titles.get(new Isbn(rawIsbn)))
            .orElse("(not in this export)");
}

// titles = { Isbn[digits=9786041111111] = "Clean Code" }
titleOf(titles, "978-604-1-11111-1");   // Clean Code
titleOf(titles, "978 604 9 99999 9");   // (not in this export)`),

        h2("7. Build it: the Monday report"),
        p("Now build the real report for the purchasing team. The starter is the old script, squeezed into the three methods you rewrite: `parse`, `classify` and `report`. The types (`Status`, `Item`, `ParseResult`) are already declared. The header spells out every rule: the exact rejection reasons, how lines merge, the sort order, the reorder list with totals over all warehouses and the output format. The tests feed whole exports with messy ISBNs, blank lines, broken rows and many warehouses."),
        challenge("chal_coding_javaf_421", "Work in the order of the pipeline: first parse (split with -1, check the count, strip, normalise the ISBN, catch the number errors per line), then classify with the boundaries from the header, then report: a TreeMap of warehouses, Map.merge per ISBN, a Comparator for status-title-ISBN, and List.copyOf at the end. Run it after each step; the runner prints an error line instead of a stack trace when something throws."),

        h2("8. The fix"),
        p("Put the steps together and the report method reads like the pipeline in the diagram. Every one of Monday's bugs is fixed in exactly one place:"),
        code("java", `
static List<String> buildReport(List<String> lines) {
    List<Item> items = new ArrayList<>();
    List<Bad> bad = new ArrayList<>();
    for (int i = 0; i < lines.size(); i++) {
        if (lines.get(i).isBlank()) continue;
        switch (parseLine(i + 1, lines.get(i))) {
            case Ok(Item item) -> items.add(item);
            case Bad b -> bad.add(b);
        }
    }

    Map<Isbn, String> titles = items.stream()
            .collect(Collectors.toMap(Item::isbn, Item::title, (first, later) -> first));
    Map<String, Map<Isbn, Stock>> byWarehouse = items.stream()
            .collect(Collectors.groupingBy(Item::warehouse, TreeMap::new,
                    Collectors.toMap(Item::isbn,
                            it -> new Stock(it.qty(), it.reorderLevel()), Stock::plus)));

    Comparator<Map.Entry<Isbn, Stock>> worstFirst = Comparator
            .comparing((Map.Entry<Isbn, Stock> e) -> e.getValue().status())
            .thenComparing(e -> titles.get(e.getKey()));

    List<String> out = new ArrayList<>();
    byWarehouse.forEach((warehouse, books) -> books.entrySet().stream()
            .sorted(worstFirst)
            .forEach(e -> out.add(warehouse + " | " + e.getValue().status() + " | "
                    + titles.get(e.getKey()) + " | qty " + e.getValue().qty())));
    bad.forEach(b -> out.add("skipped line " + b.lineNo() + ": " + b.reason()));
    return List.copyOf(out);
}`, "MondayReport.java"),
        p("Run it on the full Monday export, including the broken Effective Java row, a blank line, a row with `two` as the quantity and a row with a 12-digit ISBN:"),
        code("text", `
Hanoi;978-604-1-11111-1;Clean Code;4;5
Can Tho;9786042222222;Dune;0;0
Hanoi;9786041111111;Clean Code;3;5

Da Nang;9786043333333;Sapiens;6;6
Da Nang;9786044444444;Effective Java;12
Hue;9786045555555;Atomic Habits;9;4
Hue;9786045555555;Atomic Habits;two;4
Hue;978604555555;Atomic Habits;1;4`, "inventory.txt"),
        code("text", `
Can Tho | OUT_OF_STOCK | Dune | qty 0
Da Nang | LOW | Sapiens | qty 6
Hanoi | OK | Clean Code | qty 7
Hue | OK | Atomic Habits | qty 9
skipped line 6: 4 fields, need 5
skipped line 8: For input string: "two"
skipped line 9: ISBN needs 13 digits: 978604555555`),
        numbered([
            "**Same ISBN, one line.** The `Isbn` record normalises in its compact constructor, so both spellings of Clean Code merge: 4 + 3 = 7 copies in Hanoi, above the reorder level, OK. Nobody orders it.",
            "**Empty is never OK.** The switch checks `qty() == 0` first and uses `<=`, so Dune is OUT_OF_STOCK and Sapiens (6 of 6) is LOW.",
            "**Bad rows are reported, not fatal.** The three broken lines are listed with their line numbers, and the four warehouses are still in the report.",
            "**Fixed order.** `TreeMap` sorts the warehouses; the comparator sorts the books inside each one.",
        ]),
        callout("info", "Reasons are for people",
            "The NumberFormatException message, For input string: \"two\", is fine in a log but unclear for the warehouse team. The challenge asks for your own reasons (bad qty: two) so the people fixing the export know which column to look at."),

        h2("9. Pitfalls"),
        bullets([
            "**Comparing raw identifiers.** ISBNs, phone numbers and SKUs are often formatted for humans. Normalise once, in a record's compact constructor, and use the record as the key.",
            "**`split` without `-1`.** Trailing empty fields disappear, so a row with an empty last column looks like a row with a missing column.",
            "**Boundaries written as `<` by habit.** \"5 or fewer\" is `<= 5`. Test 0, the level itself and one above it.",
            "**`HashMap` for anything people read in order.** Its order depends on the hash codes and can change when entries are added. Use `TreeMap` (sorted) or `LinkedHashMap` (insertion order).",
            "**One `try` around the whole loop.** The first bad row jumps out of the loop and every row after it is lost. Put the `try` inside, around one line.",
            "**Catching `Exception`.** It also hides your own bugs. Catch `IllegalArgumentException` (which includes `NumberFormatException`) where bad input is expected.",
            "**`toMap` without a merge function.** Two lines with the same key throw `IllegalStateException: Duplicate key`. Decide what merging means and pass it as the third argument.",
            "**Returning the working `ArrayList`.** A caller can then add, remove or sort the lines of your report. Return `List.copyOf(...)`.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Each step has one job: parse, merge, classify, sort and print.",
            "Values are records with compact constructors that normalise and validate; an `Item` with a bad ISBN or a negative quantity cannot exist.",
            "Parsing returns a sealed `Ok` / `Bad` result; one bad line never stops the report, and every rejected line is listed with its line number and a readable reason.",
            "Blank lines are skipped but still counted for line numbers.",
            "Map keys are normalised values; duplicates are merged with an explicit rule (`Map.merge` or the merge function of `toMap`).",
            "The status rule is one switch expression with the boundaries (0, equal, one above) written down and tested.",
            "Anything people read in order is sorted on purpose: `TreeMap` for groups, a `Comparator` chain ending on a unique key for items.",
            "The method returns an unmodifiable list.",
        ]),

        h2("11. Course wrap-up"),
        p("You started this course with strings and text blocks and finished with a report that survives messy real data. Along the way you learned to:"),
        bullets([
            "model data with **records** that check themselves, and know when `equals` and `hashCode` matter;",
            "replace magic strings with **enums** and long `if` chains with **switch expressions**;",
            "pick **List, Set or Map** by the behaviour you need, and transform data with **streams and collectors**;",
            "return **unmodifiable** collections and make **defensive copies**;",
            "describe a closed set of results with **sealed interfaces** and handle them with **pattern matching**;",
            "use **Optional** for values that may be missing, and handle **exceptions** at the right level.",
        ]),
        p("Where to go next:"),
        bullets([
            "**Test what you wrote.** The boundary checks in this lesson are exactly what unit tests are for. Learn **JUnit 5**: one small test method per rule (`qty == reorderLevel` is LOW) runs in milliseconds on every change.",
            "**Build real projects.** Real Java projects are built with **Maven** or **Gradle**, which download libraries, compile, run the tests and package your code. Start a project with one of them and move this report into it.",
            "**Java 21 Concurrency: Virtual Threads & Structured Patterns** - when the report has to read exports from many warehouses at the same time.",
            "**Resilient Microservices in Java: Retries, Circuit Breakers & Outbox** - when the report becomes a service that other systems call, and failures come from the network instead of a text file.",
        ]),
    ],
});
