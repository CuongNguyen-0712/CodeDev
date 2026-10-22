// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-csf-4-1",
    title: "Exceptions, TryParse & guard clauses",
    slug: { _type: "slug", current: "csharp-exceptions-tryparse-guard-clauses" },
    description:
        "One teacher typed vắng (absent) in the score column, and the nightly import threw away 2,000 scores. The hotfix made sure it would never fail again - by giving absent students a 0, hiding a crash on cut-off lines and accepting a score of 85. Learn what an exception is and how it travels up the call stack, how try, catch and finally work, why catch (Exception) that carries on is dangerous, how TryParse checks input without exceptions, the difference between throw; and throw ex;, how to wrap an exception with its cause, how guard clauses with ThrowIfNull and ThrowIfGreaterThan stop bugs at the door, and how using cleans up when something goes wrong.",
    estimatedTime: 21,

    scenario: {
        role: "Junior C# developer on the Sen Academy portal team, an after-school tutoring center in Hà Nội",
        problem:
            "Teachers upload one CSV of scores per class, and a nightly job imports them into Sen.Portal. On Tuesday morning parents saw no scores at all: one line said vắng instead of a number, and the job imported nothing. The hotfix that went out the same day never failed again, but two weeks later a parent asked why her son, absent with a fever, had a 0 in Toán 9.",
    },

    content: [
        h2("1. The incident"),
        p("Every evening the teachers of Sen Academy's three campuses upload their scores: one CSV file per class, exported from the tablet app the teachers use in class. At 01:00 a job in Sen.Portal reads every file, checks it and saves the scores, and at 07:00 parents see them in the app."),
        p("On Tuesday the app showed no scores at all. The log had one line from the night: `import failed: The input string 'vắng' was not in a correct format.` Cô Ngô Thanh Hương had typed **vắng** (absent) for Lê Hoàng Nam, who was ill, in the TOAN9-A file. That one word stopped the import of all 2,000 scores of the night, from 31 classes."),
        p("A colleague fixed it before lunch: \"one bad row must never stop the import again\". It never did. Two weeks later Nam's mother asked why her son had a 0 in the midterm he could not attend. Đặng Quốc Việt from ops then found more: students whose lines had been cut off by the tablet app also had a 0, and one student had 85 out of 10, because a teacher forgot the dot in 8.5. None of it was in the logs."),
        p("This lesson is about the tools C# gives you for things that go wrong - exceptions, `try`/`catch`/`finally`, `TryParse` and guard clauses - and about where each one belongs."),

        h2("2. Reproduce it"),
        p("The import job, cut down to one file. The CSV is a raw string literal (`\"\"\"`): the text between the quotes is taken as it is, and the common indentation of the lines is removed."),
        code("csharp", String.raw`
using System.Globalization;

// The nightly score import, cut down: parse every line, then save them all.
string csv = """
    student,class,score
    HS-1024,TOAN9-A,8.5
    HS-1025,TOAN9-A,9
    HS-1026,TOAN9-A,vắng
    HS-1027,TOAN9-A,7.25
    """;

var scores = new List<(string Student, decimal Score)>();
try
{
    foreach (string line in csv.Split('\n').Skip(1))   // Skip(1): the header
    {
        string[] f = line.Split(',');
        scores.Add((f[0], decimal.Parse(f[2], CultureInfo.InvariantCulture)));
    }
    Console.WriteLine($"saved {scores.Count} scores");  // Save(scores) in the real job
}
catch (Exception ex)
{
    Console.WriteLine($"import failed: {ex.Message}");
}`, "Import.cs"),
        code("text", String.raw`
$ dotnet run Import.cs
import failed: The input string 'vắng' was not in a correct format.`),
        p("`decimal.Parse(\"vắng\")` cannot return a number, so it **throws** a `FormatException`. From that moment no more statements of the `try` block run: not the rest of the loop, not line 5, and not the `Save` after the loop. Control jumps straight to the `catch` block. Lines 2 and 3 had been parsed already, but they were only in a list in memory, and that list was never saved."),
        p("Note `CultureInfo.InvariantCulture`: the import already got culture-safe parsing right (lesson 1-3). The bug is not how a score is parsed - it is what happens when one cannot be."),

        h2("3. What an exception is"),
        p("An exception is an object that describes an error, and **throwing** it stops the normal flow of the program. The runtime then walks back up the call stack - the method that failed, the method that called it, and so on - looking for a `catch` that accepts this type of exception. That walk is called **unwinding**. If no method catches it, the program ends. This is what an uncaught `int.Parse(\"vắng\")` prints:"),
        code("text", String.raw`
Unhandled exception. System.FormatException: The input string 'vắng' was not in a correct format.
   at System.Number.ThrowFormatException[TChar](ReadOnlySpan` + "`" + String.raw`1 value)
   at System.Int32.Parse(String s)
   at Program.<Main>$(String[] args)`),
        p("Read a stack trace from the top: the method that threw is first, the outermost caller last. `Program.<Main>$` is the method the compiler generates for top-level statements. (In a normal debug build each line also ends with a file name and a line number.)"),
        p("Every exception derives from `System.Exception`, and has a `Message`, a `StackTrace` and an optional `InnerException` (the exception that caused this one). The ones you will meet most often:"),
        bullets([
            "**`FormatException`** - text that is not in the expected format: `int.Parse(\"vắng\")`.",
            "**`ArgumentException`**, with **`ArgumentNullException`** and **`ArgumentOutOfRangeException`** - a method was called with an argument it does not accept. This means a bug in the caller.",
            "**`InvalidOperationException`** - the call is not valid in the object's current state: `.First()` on an empty list, changing a `List` while a `foreach` runs over it.",
            "**`IndexOutOfRangeException`** and **`KeyNotFoundException`** - an array index past the end, a dictionary key that is not there (lesson 2-1).",
            "**`NullReferenceException`** - a member used through `null` (lesson 1-2).",
            "**`IOException`** and **`FileNotFoundException`** - files, disks and networks.",
            "**`OverflowException`** - arithmetic in a `checked` context that does not fit (lesson 1-1).",
        ]),
        callout("info", "C# has no checked exceptions",
            "Unlike Java, C# does not make you declare which exceptions a method throws, and the compiler does not force you to catch them. The documentation of each method lists them instead: decimal.Parse documents ArgumentNullException, FormatException and OverflowException. Reading that list is how you know what can go wrong."),

        h2("4. try, catch and finally"),
        p("A `try` statement has one or more `catch` clauses and an optional `finally`. The runtime picks the **first** `catch` whose type matches the exception (the type itself or a base class), runs it, and continues after the whole statement. `finally` runs on every way out of the `try` - normally, after a `catch`, after a `return`, and when the exception is not caught at all:"),
        code("csharp", String.raw`
Console.WriteLine(Describe("8.5"));
Console.WriteLine(Describe("vắng"));
Console.WriteLine(Describe(null));

static string Describe(string? text)
{
    Console.Write("[try] ");
    try
    {
        decimal score = decimal.Parse(text!, System.Globalization.CultureInfo.InvariantCulture);
        return $"score {score}";
    }
    catch (FormatException)
    {
        return "not a number";
    }
    catch (ArgumentNullException ex) when (ex.ParamName == "s")
    {
        return "no text at all";
    }
    finally
    {
        Console.Write("[finally] ");   // runs on every path out of try, even after return
    }
}`, "Describe.cs"),
        code("text", String.raw`
[try] [finally] score 8.5
[try] [finally] not a number
[try] [finally] no text at all`),
        bullets([
            "**Order the `catch` clauses from specific to general.** The compiler rejects a clause that can never run: with `catch (Exception)` first, a `catch (FormatException)` after it is error CS0160, \"A previous catch clause already catches all exceptions of this or of a super type ('Exception')\".",
            "**`catch (FormatException)` without a variable** is fine when you do not need the exception object. Write `catch (FormatException ex)` to read `ex.Message`.",
            "**`when (...)` is an exception filter.** The clause only catches exceptions for which the condition is true; the others keep travelling up as if the clause were not there. `decimal.Parse(null)` throws `ArgumentNullException` with `ParamName` `\"s\"`, the name of its parameter.",
            "**`finally` is for clean-up**, not for results: the `return` value is decided before `finally` runs. Section 9 shows `using`, which writes the most common `finally` for you.",
        ]),

        h2("5. The hotfix: catch (Exception) and carry on"),
        p("Here is Tuesday's hotfix, run on a file with two more lines the import met in the next two weeks: a line cut off by the tablet app, and 85 instead of 8.5."),
        code("csharp", String.raw`
using System.Globalization;

string csv = """
    student,class,score
    HS-1024,TOAN9-A,8.5
    HS-1025,TOAN9-A,9
    HS-1026,TOAN9-A,vắng
    HS-1027,TOAN9-A,7.25
    HS-1028,TOAN9-A
    HS-1029,TOAN9-A,85
    """;

var scores = new List<(string Student, decimal Score)>();
foreach (string line in csv.Split('\n').Skip(1))
{
    string[] f = line.Split(',');
    decimal score;
    try
    {
        score = decimal.Parse(f[2], CultureInfo.InvariantCulture);
    }
    catch (Exception)
    {
        score = 0;   // hotfix: one bad row must never stop the import again
    }
    scores.Add((f[0], score));
}
foreach (var (student, score) in scores)
    Console.WriteLine($"{student} {score}");`, "Hotfix.cs"),
        code("text", String.raw`
HS-1024 8.5
HS-1025 9
HS-1026 0
HS-1027 7.25
HS-1028 0
HS-1029 85`),
        p("Six lines in, six scores out, no error anywhere - and three of the six are wrong:"),
        bullets([
            "**HS-1026, absent, got 0.** A missing score and a score of 0 are different facts, and the catch turned one into the other. Absence must be stored as absence.",
            "**HS-1028 got 0 from an exception nobody thought of.** The cut-off line has only two fields, so `f[2]` throws `IndexOutOfRangeException`. The `catch` was written for `vắng`, but `catch (Exception)` catches **everything**: index errors, null references, bugs that do not exist yet.",
            "**HS-1029 got 85.** `85` is a perfectly good number, so nothing threw. Parsing tells you whether text is a number; it does not tell you whether the number makes sense. That needs a check of its own.",
        ]),
        p("Before the hotfix, one bad line cost a night of scores, but everybody knew it the next morning. After it, bad lines cost nothing visible: the data was simply wrong. A crash you can see is better than data you cannot trust. The rule: **catch only the exceptions you expect, only where you can do something useful with them, and never turn an error into a plausible value.**"),

        h2("6. TryParse: checking input without exceptions"),
        p("A teacher typing `vắng` is not exceptional - it happens every week. For input that is expected to be wrong sometimes, .NET has the **Try pattern**: a method that returns `bool` for success and gives the result through an `out` parameter."),
        code("csharp", String.raw`
using System.Globalization;

foreach (string text in new[] { "8.5", " 7 ", "vắng", "", "8,5", "-1" })
{
    bool ok = decimal.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out decimal score);
    Console.WriteLine(ok ? $"\"{text}\" -> {score}" : $"\"{text}\" -> not a number (score = {score})");
}
decimal.TryParse("8,5", NumberStyles.Number, CultureInfo.InvariantCulture, out decimal surprise);
Console.WriteLine($"NumberStyles.Number reads \"8,5\" as {surprise}");`, "TryParse.cs"),
        code("text", String.raw`
"8.5" -> 8.5
" 7 " -> 7
"vắng" -> not a number (score = 0)
"" -> not a number (score = 0)
"8,5" -> not a number (score = 0)
"-1" -> -1`),
        code("text", String.raw`
NumberStyles.Number reads "8,5" as 85`),
        bullets([
            "**`out decimal score`** declares the variable in the call. When `TryParse` returns `false`, `score` is `default(decimal)`, 0 - the same 0 as the hotfix. Never use the value without checking the `bool`.",
            "**`NumberStyles` says what text is accepted.** `Float` allows white space, a sign, a decimal point and an exponent. `Number`, the default of `decimal.TryParse`, also accepts **thousands separators**, so `8,5` becomes 85 - in a semicolon-separated file that would be the HS-1029 bug again. For scores, `NumberStyles.Float` is the right choice.",
            "**`-1` parses fine.** As with 85, the range is your job: TryParse answers \"is it a number?\", a separate `if` answers \"is it a score?\".",
        ]),
        p("The same pattern is everywhere in .NET: `int.TryParse`, `DateOnly.TryParseExact`, `Enum.TryParse`, and `Dictionary.TryGetValue` from lesson 2-1:"),
        code("csharp", String.raw`
var counts = new Dictionary<string, int> { ["TOAN9-A"] = 31 };
if (counts.TryGetValue("ANH7-B", out int n))
    Console.WriteLine($"ANH7-B: {n}");
else
    Console.WriteLine("ANH7-B: no such class");
Console.WriteLine(int.TryParse("2026", out var year) ? year + 1 : -1);
// ANH7-B: no such class
// 2027`),
        p("TryParse is also much cheaper. Throwing an exception captures a stack trace and unwinds frames; returning `false` is just a return. In one run on the code runner, 100,000 bad values took **1201 ms** with `int.Parse` and `catch`, and **8 ms** with `int.TryParse`. The exact numbers change from machine to machine; the factor of about a hundred does not. Exceptions are for exceptional cases, not for the normal flow of a program."),

        h2("7. Rethrowing: throw; versus throw ex;"),
        p("Sometimes a method wants to note an exception and still let it continue up - for example, log it and let the caller decide. There are two ways to write that, and only one keeps the stack trace:"),
        code("csharp", String.raw`
using System.Globalization;

try { Importer.LoadWithThrowEx("HS-1026,TOAN9-A,vắng"); }
catch (FormatException ex) { Console.WriteLine(ex.StackTrace); }
Console.WriteLine("---");
try { Importer.LoadWithThrow("HS-1026,TOAN9-A,vắng"); }
catch (FormatException ex) { Console.WriteLine(ex.StackTrace); }

static class Importer
{
    public static decimal ParseScore(string text) => decimal.Parse(text, CultureInfo.InvariantCulture);

    public static void LoadWithThrowEx(string line)
    {
        try { ParseScore(line.Split(',')[2]); }
        catch (FormatException ex)
        {
            Console.WriteLine($"log: {ex.Message}");
            throw ex;    // restarts the stack trace here
        }
    }

    public static void LoadWithThrow(string line)
    {
        try { ParseScore(line.Split(',')[2]); }
        catch (FormatException ex)
        {
            Console.WriteLine($"log: {ex.Message}");
            throw;       // the same exception, stack trace intact
        }
    }
}`, "Rethrow.cs"),
        code("text", String.raw`
log: The input string 'vắng' was not in a correct format.
   at Importer.LoadWithThrowEx(String line)
   at Program.<Main>$(String[] args)
---
log: The input string 'vắng' was not in a correct format.
   at System.Number.ThrowFormatException[TChar](ReadOnlySpan` + "`" + String.raw`1 value)
   at System.Number.ParseDecimal[TChar](ReadOnlySpan` + "`" + String.raw`1 value, NumberStyles styles, NumberFormatInfo info)
   at Importer.ParseScore(String text)
   at Importer.LoadWithThrow(String line)
   at Program.<Main>$(String[] args)`),
        p("With `throw ex;` the trace starts at the `throw ex;` line: it no longer shows that `ParseScore` failed, or inside which .NET method. In a real import with ten layers, that is the difference between a five-minute fix and an afternoon of guessing. **Inside a `catch`, rethrow with `throw;`.** Code analyzers flag `throw ex;` as warning CA2200."),
        h3("Wrapping: add context, keep the cause"),
        p("Often the useful thing is to add what the low-level exception cannot know - which file, which line - and keep the original as the `InnerException`. A custom exception type also lets callers catch exactly this kind of failure:"),
        code("csharp", String.raw`
using System.Globalization;

try
{
    ImportLine(4, "HS-1026,TOAN9-A,vắng");
}
catch (ScoreImportException ex)
{
    Console.WriteLine(ex.Message);
    Console.WriteLine($"  line: {ex.LineNumber}");
    Console.WriteLine($"  cause: {ex.InnerException?.GetType().Name}: {ex.InnerException?.Message}");
}

static decimal ImportLine(int lineNumber, string line)
{
    try
    {
        return decimal.Parse(line.Split(',')[2], CultureInfo.InvariantCulture);
    }
    catch (FormatException ex)
    {
        throw new ScoreImportException(lineNumber, $"line {lineNumber}: the score is not a number", ex);
    }
}

class ScoreImportException(int lineNumber, string message, Exception? inner = null)
    : Exception(message, inner)
{
    public int LineNumber { get; } = lineNumber;
}`, "Wrap.cs"),
        code("text", String.raw`
line 4: the score is not a number
  line: 4
  cause: FormatException: The input string 'vắng' was not in a correct format.`),
        bullets([
            "**A custom exception derives from `Exception`** (or a more specific type), ends its name in `Exception`, and passes the message and the inner exception to the base constructor. The primary constructor from lesson 3-1 keeps it short.",
            "**Always pass the cause on.** `throw new ScoreImportException(..., ex)` keeps the original exception and its stack trace inside the new one; leaving out `ex` throws that information away.",
        ]),

        h2("8. Guard clauses"),
        p("Exceptions are also how a method refuses arguments it cannot work with. A **guard clause** is a check at the top of a method that throws before any work is done. .NET has one-line helpers for the common ones:"),
        code("csharp", String.raw`
Console.WriteLine(WeightedPart(8.5m, 0.4m));
foreach (var (score, weight) in new[] { (12m, 0.4m), (-1m, 0.4m), (8.5m, 1.5m) })
{
    try { Console.WriteLine(WeightedPart(score, weight)); }
    catch (ArgumentOutOfRangeException ex) { Console.WriteLine($"{ex.GetType().Name}: {ex.Message}"); }
}
try { Console.WriteLine(ClassReportTitle(" ")); }
catch (ArgumentException ex) { Console.WriteLine($"{ex.GetType().Name}: {ex.Message}"); }
try { Console.WriteLine(ClassReportTitle(null!)); }
catch (ArgumentException ex) { Console.WriteLine($"{ex.GetType().Name}: {ex.Message}"); }

// WeightedPart returns the part of the term average that one score contributes.
static decimal WeightedPart(decimal score, decimal weight)
{
    ArgumentOutOfRangeException.ThrowIfNegative(score);
    ArgumentOutOfRangeException.ThrowIfGreaterThan(score, 10m);
    ArgumentOutOfRangeException.ThrowIfGreaterThan(weight, 1m);
    return score * weight;
}

static string ClassReportTitle(string classCode)
{
    ArgumentException.ThrowIfNullOrWhiteSpace(classCode);
    return $"Term report {classCode}";
}`, "Guards.cs"),
        code("text", String.raw`
3.40
ArgumentOutOfRangeException: score ('12') must be less than or equal to '10'. (Parameter 'score')
Actual value was 12.
ArgumentOutOfRangeException: score ('-1') must be a non-negative value. (Parameter 'score')
Actual value was -1.
ArgumentOutOfRangeException: weight ('1.5') must be less than or equal to '1'. (Parameter 'weight')
Actual value was 1.5.
ArgumentException: The value cannot be an empty string or composed entirely of whitespace. (Parameter 'classCode')
ArgumentNullException: Value cannot be null. (Parameter 'classCode')`),
        bullets([
            "**The helpers fill in the parameter name for you** (`(Parameter 'score')`), and the out-of-range ones add the value. The family includes `ArgumentNullException.ThrowIfNull`, `ArgumentException.ThrowIfNullOrEmpty`, `ThrowIfNullOrWhiteSpace`, and `ArgumentOutOfRangeException.ThrowIfNegative`, `ThrowIfZero`, `ThrowIfGreaterThan`, `ThrowIfLessThan` and their `OrEqual` versions.",
            "**`ThrowIfGreaterThan(score, 10m)` accepts exactly 10.** Read the name literally: it throws only when the value is greater.",
            "**`ThrowIfNull` still matters with nullable reference types.** `string classCode` promises the compiler there is no null, but a caller with warnings switched off, `null!`, or data from JSON can still pass one. The guard turns a `NullReferenceException` somewhere deep inside into a clear message at the door.",
        ]),
        p("Guard clauses and the import's checks look alike, but they answer different questions. A score of 85 **in a teacher's file** is bad input: expected sometimes, reported to a person, the import goes on. A score of 85 **passed to `WeightedPart`** means the code that called it has a bug: nobody should handle that `ArgumentOutOfRangeException` except the top of the program, which logs it. So: validate input with `TryParse` and `if`, guard method arguments with `ThrowIf...`, and do not catch `ArgumentException` to carry on."),
        challenge("chal_quiz_csf_411", "For the first question, follow the exception: which statements of the try block run, how many catch clauses can run, and what finally and the line after the try statement do. For the second, check each claim against sections 4, 6, 7 and 8 - read the ThrowIf method names literally."),

        h2("9. Cleaning up with using"),
        p("When an exception unwinds the stack, files and connections opened on the way must still be closed. Types that hold such resources implement `IDisposable`, and the `using` declaration calls their `Dispose` when the variable goes out of scope - on every path, exceptions included. It is a `try`/`finally` the compiler writes for you:"),
        code("csharp", String.raw`
try
{
    using var log = new ImportLog("scores-2026-10-20.csv");
    log.Write("line 2 ok");
    throw new FormatException("line 4: score \"vắng\" is not a number");
}
catch (FormatException ex)
{
    Console.WriteLine($"caught: {ex.Message}");
}

class ImportLog(string file) : IDisposable
{
    public void Write(string message) => Console.WriteLine($"[{file}] {message}");
    public void Dispose() => Console.WriteLine($"[{file}] log closed");
}`, "Using.cs"),
        code("text", String.raw`
[scores-2026-10-20.csv] line 2 ok
[scores-2026-10-20.csv] log closed
caught: line 4: score "vắng" is not a number`),
        p("The log is closed **before** the `catch` runs: unwinding leaves the `using` scope first. In the real import, `using var reader = new StreamReader(path);` makes sure a file is released even when parsing fails, and `using var connection = ...` does the same for the database. The older block form, `using (var reader = ...) { ... }`, does exactly the same with explicit braces."),

        h2("10. The fix"),
        p("The import now treats a bad line as what it is - expected input that a person has to correct - and reports it instead of either stopping or inventing a value:"),
        code("csharp", String.raw`
using System.Globalization;

string csv = """
    student,class,score
    HS-1024,TOAN9-A,8.5
    HS-1025,TOAN9-A,9
    HS-1026,TOAN9-A,vắng
    HS-1027,TOAN9-A,7.25
    HS-1028,TOAN9-A
    HS-1029,TOAN9-A,85
    """;

var (scores, errors) = Import(csv);
Console.WriteLine($"saved {scores.Count} scores");    // Save(scores) in the real job
foreach (string error in errors)
    Console.WriteLine(error);

// Import parses every line it can and reports every line it cannot, with the line number.
static (List<(string Student, decimal Score)> Scores, List<string> Errors) Import(string csv)
{
    ArgumentNullException.ThrowIfNull(csv);
    var scores = new List<(string Student, decimal Score)>();
    var errors = new List<string>();
    string[] lines = csv.Split('\n');
    for (int i = 1; i < lines.Length; i++)             // lines[0] is the header; line numbers start at 1
    {
        string[] f = lines[i].Split(',');
        if (f.Length < 3)
        {
            errors.Add($"line {i + 1}: expected 3 fields, got {f.Length}");
            continue;
        }
        if (!decimal.TryParse(f[2], NumberStyles.Float, CultureInfo.InvariantCulture, out decimal score))
        {
            errors.Add($"line {i + 1}: score \"{f[2]}\" is not a number");
            continue;
        }
        scores.Add((f[0], score));
    }
    return (scores, errors);
}`, "Import.cs"),
        code("text", String.raw`
saved 4 scores
line 4: score "vắng" is not a number
line 6: expected 3 fields, got 2`),
        numbered([
            "**Expected problems are checked, not caught.** The field count is an `if`, the number is a `TryParse`. No exception is thrown for a teacher's typo, so there is nothing to swallow.",
            "**Every problem is reported with its line number.** Teachers get the list the next morning and correct the file; the other 4 scores are saved tonight.",
            "**Nothing catches `Exception`.** If the code has a bug - a `NullReferenceException`, an `IndexOutOfRangeException` in a check that is wrong - the job fails loudly at the top, where it is logged with its stack trace and alerts ops. That is a bug to fix, not a line to skip.",
            "**`ArgumentNullException.ThrowIfNull(csv)`** guards the method itself: a caller passing null is a bug, not bad input.",
        ]),
        image("where-to-catch", {
            alt: "Three columns show the same six lines of scores-2026-10-20.csv imported three ways: line 2 HS-1024 8.5, line 3 HS-1025 9, line 4 HS-1026 vắng, line 5 HS-1027 7.25, line 6 HS-1028 cut off, line 7 HS-1029 85. Left, v1 with one try around the loop and catch (Exception): line 4 throws a FormatException, lines 5 to 7 are never read, and 0 of 6 are saved because Save after the loop never runs; the log has one line, import failed. Middle, the hotfix with catch (Exception) setting score to 0 for each row: 8.5, 9, 0 for the absent student, 7.25, 0 for the cut-off line from an IndexOutOfRangeException, and 85 out of 10; 6 of 6 saved, 3 of them wrong, and no error anywhere because the catch also swallows bugs it was not written for. Right, the fix with TryParse and checks that report and go on: 8.5, 9, absent, 7.25, error for line 6, error for line 7; 4 saved with 1 absent and 2 reported, and the teacher gets the line numbers and reasons the next morning. A box at the bottom: catch only what you can handle, where you can handle it. Expected bad input is checked with TryParse and if, or one exception type is caught around one line and reported with the line number, and the import goes on. Unexpected exceptions are bugs: let them reach the top of the job, log them with the stack trace, exit with an error code and alert someone; catch (Exception) that carries on turns a crash you would see into data you cannot trust.",
            caption: "One bad line should cost one line - not the night's import, and not a silent 0.",
        }),
        p("Two of the hotfix's three bugs are still here, though: `vắng` is now an error instead of an absence, and 85 is saved as a score. The real import has a few more rules, and they are your job."),

        h2("11. Your turn"),
        p("The challenge gives you the hotfixed import from section 5, inside a `ParseRow` and an `ImportScores` function. The rules are in the comment at the top: `vắng` means absent, a score must be between 0 and 10, a line needs exactly three fields and a student id, blank lines and spaces are fine, and every other problem rejects that one line with its line number and the first reason that applies. The test runner prints what was imported and every error."),
        challenge("chal_fix_csf_412", "Start with what the hotfix's catch (Exception) hides: run the starter and compare the 0s with the input. Then decide, for each rule, whether it is a check (if, TryParse) or an exception you throw from ParseRow and catch around ONE line in ImportScores - and catch only that exception type, so a real bug still crashes. Count line numbers in the file, with the header as line 1, including blank lines."),

        h2("12. Pitfalls"),
        bullets([
            "**`catch (Exception)` that carries on**: it catches bugs you did not think of and turns them into plausible data. Catch the specific type, around the smallest piece of code.",
            "**An error turned into a default value**: `score = 0`, `return null`, `return \"\"`. If a value is missing, store and show that it is missing.",
            "**Exceptions for expected input**: use `TryParse` and `if`. Throwing costs about a hundred times more than returning `false`, and hides the normal path in `catch` blocks.",
            "**`throw ex;`** restarts the stack trace. Rethrow with `throw;`, or wrap with `throw new XxxException(\"context\", ex)`.",
            "**Using the `out` value when TryParse returned false**: it is `default` - 0 for numbers - not a sign of failure.",
            "**`NumberStyles.Number` for single numbers**: it accepts thousands separators, so `8,5` is 85. Use `NumberStyles.Float` (or `Integer`) and an explicit culture.",
            "**Catching `ArgumentException` to recover**: a guard clause that fires means the calling code is wrong. Fix the caller.",
            "**Forgetting `Dispose`**: open files, streams and connections with `using`, so an exception does not leak them.",
        ]),

        h2("13. Checklist"),
        bullets([
            "Input that can be wrong (files, forms, imports) is checked with `TryParse` and `if`, and every problem is reported with enough context to fix it - file, line, value.",
            "A `catch` names the exception type it expects and wraps as little code as possible; no `catch (Exception)` carries on.",
            "Unexpected exceptions reach the top of the program or job, where they are logged with the stack trace and make the run fail visibly.",
            "Rethrows use `throw;`; wrapping exceptions pass the original as the inner exception.",
            "Public methods guard their arguments with `ArgumentNullException.ThrowIfNull`, `ArgumentException.ThrowIfNullOrWhiteSpace` and the `ArgumentOutOfRangeException.ThrowIf...` helpers.",
            "Everything `IDisposable` is created with `using`.",
            "A missing value stays missing (`null`, \"absent\"), never 0.",
        ]),
        p("Next lesson: the mini project. The end-of-term report gave Hoàng Thu Trang 6.4 instead of 6.5, counted a corrected midterm twice, and printed averages of 85 on one campus. You will rebuild it with everything from this course."),
    ],
});
