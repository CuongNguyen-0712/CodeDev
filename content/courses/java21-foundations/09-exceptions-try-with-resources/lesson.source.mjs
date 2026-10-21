// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-javaf-4-1",
    title: "Exceptions & try-with-resources",
    slug: { _type: "slug", current: "java-exceptions-try-with-resources-price-import" },
    description:
        "One supplier price typed as \"12O000\" stopped the Mekong Books price import at line 37: a catch (Exception e) {} around the whole loop hid the error, 400 books kept their old prices and the file was never closed. Learn the exception hierarchy, checked vs unchecked exceptions, try/catch/finally, multi-catch, custom exceptions with a cause, try-with-resources with close order and suppressed exceptions, and when to handle errors per line instead of failing fast.",
    estimatedTime: 25,

    scenario: {
        role: "Junior backend developer, Mekong Books catalog team",
        problem:
            "Every night a job imports the supplier's price list, a text file of \"isbn;price\" lines. On 20 October one price was typed as \"12O000\" (a letter O). The import logged \"Imported 36 prices\", and nobody noticed that the other 400 books on the list kept yesterday's prices. A catch (Exception e) {} around the whole loop had swallowed a NumberFormatException at line 37, skipped reader.close(), and a later \"fix\" only logged For input string: \"12O000\", with no file name and no line number.",
    },

    content: [
        h2("1. The incident at Mekong Books: a price list that stopped at line 37"),
        p("Mekong Books gets a new price list from its main supplier every evening: a text file, one book per line, `isbn;price`, prices in whole VND. A nightly job reads it and updates the catalog. The first version of the importer looked like this:"),
        code("java", `
import java.io.BufferedReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

public class PriceListImport {
    private final Map<String, Long> prices; // isbn -> price in VND

    public PriceListImport(Map<String, Long> prices) {
        this.prices = prices;
    }

    public int importFile(Path file) {
        int updated = 0;
        try {
            BufferedReader reader = Files.newBufferedReader(file);
            String line;
            while ((line = reader.readLine()) != null) {
                String[] parts = line.split(";");
                prices.put(parts[0], Long.parseLong(parts[1]));
                updated++;
            }
            reader.close();
        } catch (Exception e) {
            // supplier files are messy, keep going
        }
        return updated;
    }
}`, "PriceListImport.java"),
        p("On 20 October the file `supplier-2026-10-20.csv` had 437 lines. Line 37 was `9786043333333;12O000`: someone at the supplier typed a capital letter O instead of a zero. The job logged `Imported 36 prices` and finished without an error. The other **400 books** after line 37 kept yesterday's prices for a whole day, including a promotion that should have started that morning."),
        p("The comment says \"keep going\", but the code does the opposite. The `try` block wraps the **whole loop**, so the first exception jumps straight out of the loop to the empty `catch`, and the job never looks at line 38. The same jump skips `reader.close()`: every failed run left one more open file handle behind in the long-running server."),
        p("A teammate noticed the missing prices a day later and \"fixed\" the logging:"),
        code("java", `
} catch (Exception e) {
    log.warn("import failed: " + e.getMessage());
}`, "PriceListImport.java"),
        p("The next bad file produced the log line `import failed: For input string: \"12O000\"`. Which file? Which line? Which book? The message does not say, the stack trace is gone, and the import still stops at the first bad line."),

        h2("2. Reproduce it"),
        p("You do not need a real file to see the bug. A `BufferedReader` can read from a `StringReader`, which serves the characters of a `String`, and a text block (Types, strings & text blocks) gives you a five-line \"file\". The small `TrackedReader` subclass prints a line when it is closed:"),
        code("java", `
import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.util.LinkedHashMap;
import java.util.Map;

public class Main {
    // A BufferedReader that prints a line when it is closed.
    static class TrackedReader extends BufferedReader {
        TrackedReader(String text) { super(new StringReader(text)); }

        @Override
        public void close() throws IOException {
            System.out.println("reader closed");
            super.close();
        }
    }

    static final Map<String, Long> prices = new LinkedHashMap<>();

    static int importPrices(BufferedReader reader) {
        int updated = 0;
        try {
            String line;
            while ((line = reader.readLine()) != null) {
                String[] parts = line.split(";");
                prices.put(parts[0], Long.parseLong(parts[1]));
                updated++;
            }
            reader.close();
        } catch (Exception e) {
            // supplier files are messy, keep going
        }
        return updated;
    }

    public static void main(String[] args) {
        String file = """
            9786041234567;120000
            9786049876543;85000
            9786043333333;12O000
            9786045555555;99000
            9786047777777;150000
            """;
        int updated = importPrices(new TrackedReader(file));
        System.out.println("Imported " + updated + " prices");
        System.out.println(prices);
    }
}

// Output:
// Imported 2 prices
// {9786041234567=120000, 9786049876543=85000}`, "Main.java"),
        p("Two prices out of five, no error, and no `reader closed` line: `close()` was never called. Replace the comment in the `catch` block with `System.out.println(\"import failed: \" + e.getMessage());` and you get the teammate's version:"),
        code("text", `
import failed: For input string: "12O000"
Imported 2 prices
{9786041234567=120000, 9786049876543=85000}`),
        p("Now delete the `try`, the `catch` block and its braces, and add `throws IOException` to `importPrices` and to `main` (section 3 explains why). Java prints what really happened:"),
        code("text", `
Exception in thread "main" java.lang.NumberFormatException: For input string: "12O000"
	at java.base/java.lang.NumberFormatException.forInputString(NumberFormatException.java:67)
	at java.base/java.lang.Long.parseLong(Long.java:709)
	at java.base/java.lang.Long.parseLong(Long.java:832)
	at Main.importPrices(Main.java:26)
	at Main.main(Main.java:41)`),
        p("This is a **stack trace**. The first line is the exception type and its message. Every `at` line below it is one method call that was in progress, newest first: `Long.parseLong` threw, it was called from `importPrices` at line 26 of the edited file (the `prices.put(...)` line), which was called from `main` at line 41. Read it from the top until you reach the first line of **your** code; that is usually where to look. The `catch (Exception e) {}` threw all of this away."),

        h2("3. Exceptions in one minute: the hierarchy, checked and unchecked"),
        p("An **exception** is an object that describes a problem. `throw` hands it to the JVM, which stops the current method and walks back up the call stack until it finds a matching `catch`. If nobody catches it, the thread ends and the stack trace is printed, as above. Every exception class extends `Throwable`, and you can print the chain of parents yourself:"),
        code("java", `
Class<?> c = NumberFormatException.class;
while (c != null) {
    System.out.print(c.getName() + " ");
    c = c.getSuperclass();
}
// java.lang.NumberFormatException java.lang.IllegalArgumentException java.lang.RuntimeException
// java.lang.Exception java.lang.Throwable java.lang.Object

// The same loop for java.io.IOException:
// java.io.IOException java.lang.Exception java.lang.Throwable java.lang.Object`, "Hierarchy.java"),
        bullets([
            "**`Throwable`** is the root. It has two branches: `Error` and `Exception`.",
            "**`Error`** means the JVM itself is in trouble: `OutOfMemoryError`, `StackOverflowError`. Application code does not catch these; there is nothing sensible to do.",
            "**`RuntimeException`** and its subclasses are **unchecked**: programming mistakes and bad values, such as `NumberFormatException`, `IllegalArgumentException`, `NullPointerException`, `ArrayIndexOutOfBoundsException`, `ArithmeticException`, `IllegalStateException`. The compiler does not force you to handle them.",
            "**Every other `Exception`** is **checked**: `IOException`, `FileNotFoundException`, `NoSuchFileException`. They describe problems outside your code - a missing file, a broken network connection - and the compiler forces every caller to deal with them.",
        ]),
        p("\"Deal with it\" means one of two things: **catch** it, or **declare** it with `throws` so your caller has to. If you do neither, the code does not compile:"),
        code("java", `
import java.io.BufferedReader;
import java.io.StringReader;

public class Main {
    static String firstLine(String text) {
        BufferedReader reader = new BufferedReader(new StringReader(text));
        return reader.readLine();
    }

    public static void main(String[] args) {
        System.out.println(firstLine("9786041234567;120000"));
    }
}

// javac Main.java
// Main.java:7: error: unreported exception IOException; must be caught or declared to be thrown
//         return reader.readLine();
//                               ^
// 1 error`, "Main.java"),
        p("`readLine()` is declared as `String readLine() throws IOException`. Writing `static String firstLine(String text) throws IOException` fixes the error and passes the decision to the caller, which is the right choice when this method cannot do anything useful about a broken file. Catch a checked exception only where you can actually handle it: retry, use a default, or turn it into a clear error for the user."),
        callout("info", "Why the incident compiled",
            "The incident code calls readLine(), which throws a checked IOException, but it compiled because catch (Exception e) also catches every IOException. A broad catch silences the compiler's checks along with the runtime errors."),

        h2("4. try, catch, finally: catch the narrowest type"),
        p("A `try` statement has one `try` block, any number of `catch` blocks and an optional `finally` block. When the `try` block throws, Java checks the `catch` blocks **from top to bottom** and runs the **first** one whose type matches - the exception's own class or a parent class. A `finally` block runs on every way out: normal end, `return`, or exception."),
        code("java", `
static String lineTotal(String qtyText, String priceText) {
    try {
        long total = Math.multiplyExact(Long.parseLong(qtyText), Long.parseLong(priceText));
        return "total " + total;
    } catch (NumberFormatException | ArithmeticException e) {
        return "rejected: " + e.getMessage();
    } finally {
        System.out.print("[line done] ");
    }
}

System.out.println(lineTotal("3", "120000"));
System.out.println(lineTotal("3", "12O000"));
System.out.println(lineTotal("99999999999", "999999999999"));
// [line done] total 360000
// [line done] rejected: For input string: "12O000"
// [line done] rejected: long overflow`, "LineTotal.java"),
        bullets([
            "**Multi-catch** - `catch (NumberFormatException | ArithmeticException e)` handles two unrelated types with one block. `Math.multiplyExact` throws `ArithmeticException` instead of silently overflowing.",
            "**`finally` runs even after `return`.** `lineTotal` computes its return value, runs `finally` (which prints `[line done] `), and only then gives the value to `println`. That is why the tag comes first on every line.",
            "**Narrow before broad.** `NumberFormatException` is a subclass of `IllegalArgumentException`. If you write `catch (IllegalArgumentException e)` first and `catch (NumberFormatException e)` after it, the second block can never run and javac refuses: `error: exception NumberFormatException has already been caught`.",
            "**Related types do not mix in a multi-catch.** `catch (NumberFormatException | IllegalArgumentException e)` fails with `error: Alternatives in a multi-catch statement cannot be related by subclassing`. Catch the parent alone if that is what you mean.",
        ]),
        h3("Never swallow, always decide"),
        p("Each `catch` block should make one clear decision. **Recover** (use a default, skip the line and record why), **translate** (throw a better exception that adds context, section 5), or do not catch at all and let the exception reach a caller that can decide. An empty `catch` block is none of these: the program continues as if nothing happened, with wrong data."),
        p("Catching `Exception` is almost always too wide. In the incident it caught the `NumberFormatException` the author had in mind, but it would also have caught an `ArrayIndexOutOfBoundsException` from a line without `;`, a `NullPointerException` from a bug in the code, and the `IOException` from a broken disk - and treated them all the same way. Catch the **narrowest** type you can handle, so a real bug still crashes loudly where you can see it."),

        h2("5. Wrap, do not lose: custom exceptions with a cause"),
        p("`For input string: \"12O000\"` is a good message for `Long.parseLong`, which only knows the text it was given. It is a poor message for the person reading the nightly job's log, who needs the file and the line. The fix is to **catch at the level that knows the context, and throw a new exception that adds it**, passing the original exception as the **cause**:"),
        code("java", String.raw`
public class Main {
    static long parsePrice(String file, int lineNo, String text) throws ImportException {
        try {
            return Long.parseLong(text);
        } catch (NumberFormatException e) {
            throw new ImportException(file + " line " + lineNo + ": bad price \"" + text + "\"", e);
        }
    }

    public static void main(String[] args) throws ImportException {
        parsePrice("supplier-2026-10-20.csv", 37, "12O000");
    }
}

class ImportException extends Exception {
    ImportException(String message, Throwable cause) {
        super(message, cause);
    }
}`, "Main.java"),
        code("text", `
Exception in thread "main" ImportException: supplier-2026-10-20.csv line 37: bad price "12O000"
	at Main.parsePrice(Main.java:6)
	at Main.main(Main.java:11)
Caused by: java.lang.NumberFormatException: For input string: "12O000"
	at java.base/java.lang.NumberFormatException.forInputString(NumberFormatException.java:67)
	at java.base/java.lang.Long.parseLong(Long.java:709)
	at java.base/java.lang.Long.parseLong(Long.java:832)
	at Main.parsePrice(Main.java:4)
	... 1 more`),
        bullets([
            "**A custom exception is a small class.** Extend `Exception` for a checked exception (callers must decide what to do, as the nightly job must) or `RuntimeException` for an unchecked one. Pass `message` and `cause` to `super(...)`; `Throwable` already stores and prints both.",
            "**`Caused by:`** prints the original exception and its own stack trace under the new one. `... 1 more` means the remaining frames are the same as the frames above (here `Main.main`), so Java does not repeat them.",
            "**Never drop the cause.** `throw new ImportException(\"bad price\", null)` or logging only `e.getMessage()` throws away the type and the line where the problem started. `e.getCause()` gives the original back in code.",
            "**Put the facts in the message**: which file, which line, which value. Somebody will read it at 2 a.m.",
        ]),
        callout("tip", "A javac -Xlint note you can ignore here",
            "With javac -Xlint:all, a class that extends Exception gets: warning: [serial] serializable class ImportException has no definition of serialVersionUID. Exceptions are Serializable through Throwable. It is only a warning; add private static final long serialVersionUID = 1L; if your build treats warnings as errors."),

        h2("6. try-with-resources: closing that cannot be forgotten"),
        p("A reader, a file, a database connection or a network socket holds something the operating system gives out in limited numbers, and must be closed when you are done. In the incident, `reader.close()` sat at the end of the `try` block, so any exception skipped it. **try-with-resources** puts the resource in parentheses after `try`, and Java calls its `close()` method for you on every way out of the block:"),
        code("java", `
try (BufferedReader reader = Files.newBufferedReader(file)) {
    // use reader
}   // reader.close() has been called here, whether the block finished, returned or threw`),
        p("Any class that implements `AutoCloseable` (one method, `void close() throws Exception`) can be used this way: readers, writers, streams, JDBC connections, and your own classes. This small resource prints when it opens and closes, and the `db` one fails to close:"),
        code("java", `
public class Main {
    static class Resource implements AutoCloseable {
        private final String name;

        Resource(String name) {
            this.name = name;
            System.out.println("open " + name);
        }

        @Override
        public void close() {
            System.out.println("close " + name);
            if (name.equals("db")) {
                throw new IllegalStateException("db close failed");
            }
        }
    }

    public static void main(String[] args) {
        try (Resource file = new Resource("file"); Resource db = new Resource("db")) {
            System.out.println("using " + file.name + " and " + db.name);
            throw new IllegalArgumentException("line 37: bad price");
        } catch (IllegalArgumentException e) {
            System.out.println("caught: " + e.getMessage());
            for (Throwable s : e.getSuppressed()) {
                System.out.println("suppressed: " + s);
            }
        } finally {
            System.out.println("finally runs last");
        }
    }
}

// open file
// open db
// using file and db
// close db
// close file
// caught: line 37: bad price
// suppressed: java.lang.IllegalStateException: db close failed
// finally runs last`, "Main.java"),
        bullets([
            "**Several resources** are separated by `;`. They open from left to right and **close in reverse order**: `db` before `file`. A resource that was opened later may depend on an earlier one (a reader on top of a file), so it must be closed first.",
            "**Closing happens before `catch` and `finally`.** By the time your `catch` block runs, every resource is already closed.",
            "**Suppressed exceptions.** The body threw `IllegalArgumentException`, then `db.close()` threw `IllegalStateException`. Java keeps the body's exception - the real problem - and attaches the close failure to it. `e.getSuppressed()` returns the attached ones, and the stack trace prints them under a `Suppressed:` line. `file` is still closed even though closing `db` failed.",
        ]),
        p("Compare the hand-written version, where `close()` is called in a `finally` block. When both the body and `close()` throw, the exception from `finally` **replaces** the original one:"),
        code("java", `
static void closeInFinally() {
    Resource db = new Resource("db");           // the same Resource class: closing "db" throws
    try {
        throw new IllegalArgumentException("line 37: bad price");
    } finally {
        db.close();
    }
}

try {
    closeInFinally();
} catch (RuntimeException e) {
    System.out.println("caught " + e + ", suppressed: " + e.getSuppressed().length);
}
// open db
// close db
// caught java.lang.IllegalStateException: db close failed, suppressed: 0`, "Main.java"),
        p("The bad price is gone without a trace; the log only shows that a close failed. That is why try-with-resources is the default for anything that has a `close()` method. In a stack trace (`e.printStackTrace()`, or an uncaught exception), suppressed exceptions appear indented under the main one. With `e.printStackTrace()` in the `catch` block of the two-resource program above:"),
        code("text", `
java.lang.IllegalArgumentException: line 37: bad price
	at Main.main(Main.java:22)
	Suppressed: java.lang.IllegalStateException: db close failed
		at Main$Resource.close(Main.java:14)
		at Main.main(Main.java:20)`),
        challenge("chal_quiz_javaf_411", "For the first question, remember that only the first matching catch block runs and when finally runs compared with the caller's println. For the second, think about the order in which resources are closed and what happens to an exception thrown by close()."),

        h2("7. Per-line handling or fail-fast?"),
        p("Once you stop swallowing exceptions, you still have to decide **how far** one error should reach. There are two honest strategies, and the incident was neither:"),
        bullets([
            "**Fail fast** - stop at the first problem, change nothing, report it. Use it when the input only makes sense as a whole, or when a problem means the input itself is wrong: a payment batch, a configuration file, a database migration, a file that cannot be read at all (`IOException`), or a price list where every line fails because the supplier changed the format.",
            "**Handle per line (collect and continue)** - put the `try` / `catch` **inside** the loop, around the work for one record. A bad line is skipped and recorded with its line number and reason, and the loop goes on. Use it when records are independent: one wrong price must not block 400 correct ones.",
            "**Mixed, and common in practice** - per-line handling for bad records, fail-fast for problems with the whole file. Count line numbers yourself (the first line is 1, blank lines included) so the report matches what the supplier sees in their editor, and show every error, not just the first.",
        ]),
        image("swallowed-vs-per-line", {
            alt: "Diagram comparing two versions of the import on the same five-line supplier file, where line 3 is 9786043333333;12O000. Left, red, 'Before: one try/catch around the whole loop': lines 1 and 2 are imported, line 3 throws NumberFormatException, an arrow jumps to catch (Exception e) { }, where the loop ends, reader.close() is skipped and nothing is logged; lines 4 and 5 are never read and keep their old prices. Result: 2 of 5 imported, errors: 0, file handle left open. Right, green, 'After: catch per line, try-with-resources': lines 1, 2, 4 and 5 are imported, line 3 is recorded as 'line 3: bad price \"12O000\"' and the loop goes on; try (BufferedReader reader = ...) closes the reader on every exit, including an exception. Result: 4 of 5 imported, 1 error with its line, reader closed. Bottom note: try-with-resources closes resources in reverse order of opening on every exit from the block, and an exception thrown by close() never replaces the real error; it is attached to it and getSuppressed() returns it.",
            caption: "Where the try sits decides how far one bad line reaches: around the loop it ends the import, inside the loop it costs one line.",
        }),
        p("Two details make per-line handling trustworthy. First, a line that is skipped must not be half-imported: parse and validate the whole line **before** you change any data, so a failure leaves nothing behind. Second, normal situations are not errors: a blank line is checked with `line.isBlank()` and skipped, not \"handled\" by catching the exception it would cause."),
        challenge("chal_fix_javaf_412", "Move the try/catch inside the loop so it protects the work of one line, and count every line (blank ones too) before you decide to skip it. In parseLine, check the number of fields and empty values yourself, and turn the NumberFormatException into an exception whose message is the reason text from the header, keeping the original as the cause."),

        h2("8. The fix"),
        p("The nightly job now uses try-with-resources for the file, handles bad lines one by one, turns an unreadable file into a checked `ImportException` with the cause attached, and only writes prices after the whole file has been read. `PriceRow.parse(line)` is a small record factory (Classes, records & equals/hashCode) that throws `IllegalArgumentException` with a reason for a missing field or a price that is not a number, wrapping the `NumberFormatException` as the cause:"),
        code("java", `
import java.io.BufferedReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class PriceListImport {
    public record LineError(int line, String reason) {}

    public record ImportReport(Path file, int updated, List<LineError> errors) {}

    private final Map<String, Long> prices;

    public PriceListImport(Map<String, Long> prices) {
        this.prices = prices;
    }

    public ImportReport importFile(Path file) throws ImportException {
        Map<String, Long> updates = new LinkedHashMap<>();
        List<LineError> errors = new ArrayList<>();
        try (BufferedReader reader = Files.newBufferedReader(file)) {
            int lineNo = 0;
            for (String line = reader.readLine(); line != null; line = reader.readLine()) {
                lineNo++;
                if (line.isBlank()) {
                    continue;
                }
                try {
                    PriceRow row = PriceRow.parse(line);
                    updates.put(row.isbn(), row.price());
                } catch (IllegalArgumentException e) { // NumberFormatException is one too
                    errors.add(new LineError(lineNo, e.getMessage()));
                }
            }
        } catch (IOException e) {
            throw new ImportException("cannot read " + file, e);
        }
        prices.putAll(updates);
        return new ImportReport(file, updates.size(), errors);
    }
}`, "PriceListImport.java"),
        p("Run against a copy of the 20 October file, shortened to five lines plus a blank one, where the catalog had `110000` for the book on line 3, and then against a file that does not exist:"),
        code("java", `
ImportReport report = importer.importFile(Path.of("supplier-2026-10-20.csv"));
System.out.println("Imported " + report.updated() + " prices from " + report.file());
for (LineError err : report.errors()) {
    System.out.println("  " + report.file() + " line " + err.line() + ": " + err.reason());
}
System.out.println(prices);
importer.importFile(Path.of("supplier-2026-10-21.csv"));

// Imported 4 prices from supplier-2026-10-20.csv
//   supplier-2026-10-20.csv line 3: bad price "12O000"
// {9786043333333=110000, 9786041234567=120000, 9786049876543=85000, 9786045555555=99000, 9786047777777=150000}
// Exception in thread "main" ImportException: cannot read supplier-2026-10-21.csv
// 	at PriceListImport.importFile(...)
// 	...
// Caused by: java.nio.file.NoSuchFileException: supplier-2026-10-21.csv
// 	...`, "NightlyJob.java"),
        numbered([
            "**The `try` / `catch` sits inside the loop** and catches only `IllegalArgumentException`, the type `PriceRow.parse` uses for a bad line. Line 3 becomes one `LineError`, lines 4 and 5 are imported, and the book on line 3 keeps its old price of 110,000 VND instead of a wrong one.",
            "**try-with-resources** closes the reader on every path: end of file, a bad line, or an `IOException` in the middle of reading.",
            "**A broken file fails fast.** An `IOException` is not a bad line, so it ends the import as a checked `ImportException` that names the file and keeps the original exception as its cause. The job's caller has to decide what to do with it (alert, retry tomorrow).",
            "**Nothing is half-done.** New prices are collected in `updates` and written with one `putAll` after the whole file has been read, so an `IOException` at line 200 does not leave 199 new prices and 238 old ones.",
            "**The report tells the truth**: how many prices changed, and every bad line with file, line number and reason. The job now sends the error list to the supplier contact instead of logging `Imported 36 prices`.",
        ]),

        h2("9. Pitfalls"),
        bullets([
            "**`catch (Exception e) {}`** turns every problem, including your own bugs, into silently wrong data. If you really cannot handle an exception, do not catch it.",
            "**Logging only `e.getMessage()`** loses the type, the stack trace and the context. Log the exception object itself, or rethrow a new exception with a message that names the file, line and value, and the original as its cause.",
            "**A `try` around the whole loop is fail-fast, whatever the comment says.** To keep going after a bad record, the `try` must be inside the loop.",
            "**Catch order matters.** A parent type above a child type (`IllegalArgumentException` above `NumberFormatException`) is a compile error; a child type is not needed at all after its parent unless it does something different.",
            "**`return` (or `throw`) inside `finally` hides the real exception.** With `finally { return updated; }`, a `NumberFormatException` in the `try` block disappears and the method simply returns 2. javac -Xlint:all warns: `warning: [finally] finally clause cannot complete normally`. Use `finally` only for cleanup that cannot fail.",
            "**`close()` in a hand-written `finally` can replace the original exception** with its own. try-with-resources keeps the original and attaches the close failure as suppressed.",
            "**Do not catch `Error` or `Throwable`.** `OutOfMemoryError` and `StackOverflowError` mean the JVM is in trouble; let them end the program.",
            "**Do not use exceptions for normal cases.** Check `line.isBlank()` before parsing instead of catching the exception a blank line would cause. Exceptions are for the unexpected.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every `catch` names the narrowest type you can actually handle, narrow types before broad ones; no empty `catch` blocks.",
            "Checked exceptions (`IOException`) are caught where you can handle them, or declared with `throws` so the caller decides.",
            "When you catch and rethrow, the new exception adds context (file, line, value) and keeps the original as its cause.",
            "Every reader, writer, stream or connection is opened in try-with-resources; you know they close in reverse order and that close failures appear in `getSuppressed()`.",
            "You decided on purpose between fail-fast and per-line handling; for per-line handling the `try` is inside the loop and every error is recorded with its line number (first line = 1, blank lines counted).",
            "Data is changed only after a line, or the whole file, has been fully validated.",
            "`finally` never contains `return` or code that can throw.",
            "A test feeds the incident's input (a price `12O000` in the middle of the file) and checks that the lines after it are imported and the error names line and value.",
        ]),
    ],
});
