// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-csf-1-3",
    title: "Strings, interpolation & culture-safe parsing",
    slug: { _type: "slug", current: "csharp-strings-interpolation-culture-safe-parsing" },
    description:
        "Ops moved the score-import worker to a new container image with Vietnamese settings, so dates in the logs would read Thứ Hai instead of Monday. The next morning a score of 8.5 had become 85, term averages were above 60, and the CSV export had an extra column that broke the reporting tool. Learn how strings behave in C# (immutable, built with interpolation, format strings and StringBuilder), where CultureInfo.CurrentCulture comes from and which methods quietly use it, how to parse and format numbers and dates with the invariant culture for data and an explicit culture for people, how TryParse and NumberStyles reject bad input, and how to split, compare and measure text without surprises.",
    estimatedTime: 21,

    scenario: {
        role: "Junior C# developer on the Sen Academy portal team, an after-school tutoring center in Hà Nội",
        problem:
            "Teachers upload term scores as a CSV file: student id, name and scores with a dot for decimals (8.5). The import worker computes each student's average, writes a CSV export for the reporting tool and texts the average to the parents. After the worker moved to a container image with LANG=vi_VN.UTF-8, every decimal score was read ten times too large and every exported average contained a comma, so the reporting tool saw four columns instead of three.",
    },

    content: [
        h2("1. The incident"),
        p("Sen Academy's import worker runs every night. Teachers upload a CSV file per class - `HS-1024,Nguyễn Gia Bảo,8.5,7,9.5` - and the worker computes every student's average, writes one row per student into an export for the reporting tool, and queues an SMS to the parents with the average."),
        p("On Tuesday, Đặng Quốc Việt from ops moved the worker to the company's new base container image. The image sets `LANG=vi_VN.UTF-8`, which everyone wanted: logs and emails now show dates the Vietnamese way, `26/10/2026` and `Thứ Hai`. The worker started, processed 2,400 students and reported no errors."),
        p("On Wednesday morning cô Ngô Thanh Hương opened the reporting tool. Nguyễn Gia Bảo, a good but not extraordinary math student, had a term average of 62. The tool showed the class average as 3 - and, in a column that did not exist before, a lot of single digits. Three parents had already replied to their SMS asking what \"điểm trung bình 62,3\" meant on a scale to 10."),
        bullets([
            "**`8.5` was read as `85`.** In Vietnamese number formatting the dot is the thousands separator, as in `1.800.000`, and the comma is the decimal separator.",
            "**`62.3` was written as `62,3`.** In a comma-separated file that comma starts a new column: the reporting tool read `62` as the average and `3` as an unknown fourth field.",
            "**Nothing failed.** No exception, no warning, no log line. Every number was converted exactly the way the code asked - using the server's culture.",
        ]),

        h2("2. Reproduce it"),
        p("The worker, cut down to its parsing and formatting. It runs unchanged on both images; only the environment differs:"),
        code("csharp", String.raw`
using System.Globalization;

// Score import, cut down: one line per student, three scores, comma-separated.
Console.WriteLine($"culture: \"{CultureInfo.CurrentCulture.Name}\"");

string upload = """
    HS-1024,Nguyễn Gia Bảo,8.5,7,9.5
    HS-1025,Trần Khánh Linh,9,8.75,10
    HS-1026,Lê Hoàng Nam,6.5,7.5,8
    """;

foreach (string line in upload.Split('\n'))
{
    string[] fields = line.Split(',');
    double sum = 0;
    for (int i = 2; i < fields.Length; i++)
        sum += double.Parse(fields[i]);
    double average = sum / (fields.Length - 2);
    Console.WriteLine($"{fields[0]},{fields[1]},{average:F1}");
}`, "Program.cs"),
        code("text", String.raw`
$ LANG=C.UTF-8 dotnet run          # the old image
culture: ""
HS-1024,Nguyễn Gia Bảo,8.3
HS-1025,Trần Khánh Linh,9.2
HS-1026,Lê Hoàng Nam,7.3

$ LANG=vi_VN.UTF-8 dotnet run      # the new image
culture: "vi-VN"
HS-1024,Nguyễn Gia Bảo,62,3
HS-1025,Trần Khánh Linh,298,0
HS-1026,Lê Hoàng Nam,49,3`),
        p("Two calls in this loop depend on the environment, and neither of them mentions it: `double.Parse(fields[i])` and the interpolation `{average:F1}`. Both use `CultureInfo.CurrentCulture`, which .NET on Linux takes from `LANG`. With `C.UTF-8` you get the **invariant culture** (its name is the empty string); with `vi_VN.UTF-8` you get Vietnamese. Linh's `8.75` became `875`, so her average is (9 + 875 + 10) / 3 = 298. Notice also that her correct average shows as `9.2`, not `9.3` - keep that in mind for section 4."),
        p("Before fixing it, look at the tools C# gives you for text, because most of them have a culture hiding somewhere."),

        h2("3. Strings are immutable"),
        p("A `string` in C# never changes after it is created. Every method that seems to change one - `ToUpperInvariant`, `Replace`, `Trim`, `+` - returns a **new** string and leaves the original alone:"),
        code("csharp", String.raw`
string classCode = "toan9-a";
classCode.ToUpperInvariant();               // returns a new string - and the result is thrown away
Console.WriteLine(classCode);
classCode = classCode.ToUpperInvariant();   // keep the new string
Console.WriteLine(classCode);

string[] names = ["Nguyễn Gia Bảo", "Trần Khánh Linh", "Lê Hoàng Nam"];
var report = new StringBuilder();
report.AppendLine($"Lớp {classCode}");
foreach (string name in names)
    report.Append("- ").AppendLine(name);
report.Append($"{names.Length} học sinh");
Console.WriteLine(report.ToString());`, "Immutable.cs"),
        code("text", String.raw`
toan9-a
TOAN9-A
Lớp TOAN9-A
- Nguyễn Gia Bảo
- Trần Khánh Linh
- Lê Hoàng Nam
3 học sinh`),
        bullets([
            "**Calling a string method without using its result does nothing.** The compiler does not warn about it.",
            "**Immutability is what makes strings safe to share.** Two variables can point to the same string, and neither can change it for the other - the opposite of the shared `TuitionPlan` object in lesson 1.",
            "**`StringBuilder`** is a mutable buffer for building text piece by piece. Adding to a string with `+=` in a loop creates a new string every time; for a report with thousands of lines, `StringBuilder` is much faster. For a handful of pieces, interpolation is clearer.",
        ]),

        h2("4. Interpolation and format strings"),
        p("`$\"...{expression}...\"` is an **interpolated string**: each hole is converted to text, optionally with a **format string** after a colon and an **alignment** after a comma. Here are the same values formatted with the invariant culture and with Vietnamese:"),
        code("csharp", String.raw`
using System.Globalization;

decimal score = 8.25m;
decimal fee = 1_800_000m;
var monday = new DateTime(2026, 10, 26, 18, 0, 0);
var vi = CultureInfo.GetCultureInfo("vi-VN");
var inv = CultureInfo.InvariantCulture;

Console.WriteLine(string.Create(inv, $"invariant: {score:F1} | {fee:N0} | {monday:d} | {monday:dddd HH:mm}"));
Console.WriteLine(string.Create(vi,  $"vi-VN:     {score:F1} | {fee:N0} | {monday:d} | {monday:dddd HH:mm}"));
Console.WriteLine(string.Create(inv, $"[{"HS-1024",-8}] [{score,6:F2}] [{fee,12:N0}]"));
Console.WriteLine(score.ToString("0.0", inv) + " " + fee.ToString("#,0 ₫", vi));
Console.WriteLine(FormattableString.Invariant($"{score:F1};{fee}"));
Console.WriteLine($"{9.25:F1} {9.25m:F1} {8.25m:F1}");`, "Format.cs"),
        code("text", String.raw`
invariant: 8.3 | 1,800,000 | 10/26/2026 | Monday 18:00
vi-VN:     8,3 | 1.800.000 | 26/10/2026 | Thứ Hai 18:00
[HS-1024 ] [  8.25] [   1,800,000]
8.3 1.800.000 ₫
8.3;1800000
9.2 9.3 8.3`),
        bullets([
            "**Standard formats**: `F1` is fixed-point with one decimal, `N0` adds thousands separators with no decimals, `d` is the short date, `dddd` the day name. Custom formats like `0.0` and `#,0 ₫` spell out the digits you want.",
            "**Alignment**: `{x,6}` right-aligns in 6 characters, `{x,-8}` left-aligns in 8. Useful for console reports and fixed-width files.",
            "**The culture decides the separators, the date order and the day names.** `F1` does not mean \"a dot\": it means \"one decimal, written the way this culture writes decimals\".",
            "**`string.Create(culture, $\"...\")`** formats an interpolated string with the culture you pass. `FormattableString.Invariant($\"...\")` does the same for the invariant culture. `x.ToString(format, culture)` does it for a single value.",
            "**A plain `$\"...\"` uses the current culture.** So does `string.Format`, `ToString()` without a culture, and `Console.WriteLine` of a number.",
            "**Format strings are not a rounding policy.** The last line shows the double `9.25` formatted as `9.2` but the decimal `9.25m` as `9.3` - the same surprise as Linh's `9.2` above. When the rounding rule matters (it does for grades and money), round explicitly with `Math.Round(x, 1, MidpointRounding.AwayFromZero)` and use `decimal`, as in lesson 1.",
        ]),

        h2("5. Where the culture comes from"),
        p("`CultureInfo.CurrentCulture` is set per thread when the program starts, from the operating system: `LANG` (or `LC_ALL`) on Linux and in containers, the region settings on Windows, the user's region on a phone. That makes sense for a desktop app - a Vietnamese user sees Vietnamese numbers - and it is a trap for a server, where the same code produces different data depending on how a machine was set up."),
        image("one-string-two-cultures", {
            alt: "Diagram. At the top, one line of a teacher's upload: HS-1024,Nguyễn Gia Bảo,8.5,7,9.5. Arrows lead to two boxes. Left, green: the old image, CurrentCulture invariant with the empty name, decimal separator dot and thousands separator comma; double.Parse of 8.5 gives 8.5, the average is 8.33, formatting with F1 gives 8.3, and the CSV row HS-1024,Nguyễn Gia Bảo,8.3 has 3 columns. Right, red: the new image, CurrentCulture vi-VN, decimal separator comma and thousands separator dot; double.Parse of 8.5 gives 85, the average is 62.33, F1 gives 62,3, and the CSV row HS-1024,Nguyễn Gia Bảo,62,3 has 4 columns because the comma splits the score. A green box at the bottom gives the fix: name the culture every time text and numbers meet. Data for programs - uploads, CSV, JSON, logs - uses the invariant culture: decimal.TryParse with NumberStyles.Float and CultureInfo.InvariantCulture, and string.Create with CultureInfo.InvariantCulture gives 8.3. Text for people, like the SMS to parents, uses the culture they read, vi-VN chosen explicitly, giving 8,3.",
            caption: "The code did not change between the two runs. Only LANG did.",
        }),
        p("The rule that follows is simple, and it is the whole fix for this lesson:"),
        numbered([
            "**Text that programs read** - uploads, CSV and JSON, configuration, URLs, logs, database values stored as text - is parsed and written with `CultureInfo.InvariantCulture`. The invariant culture is fixed forever and the same on every machine: dot for decimals, no surprises.",
            "**Text that people read** - the SMS, a web page, a PDF report - is formatted with the culture of **that person**, chosen explicitly: `CultureInfo.GetCultureInfo(\"vi-VN\")` for Sen Academy's parents. Not the server's culture, which is nobody's choice.",
        ]),
        callout("info", "Invariant globalization mode",
            "Some container images set DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1 (or InvariantGlobalization in the project) to save the size of the ICU library. Then every culture behaves like the invariant one, and new CultureInfo(\"vi-VN\") either throws or quietly formats with dots - so the parents' SMS would show 8.3. Check how your images are configured before you rely on Vietnamese formatting in a container, and add a test that formats one number with vi-VN."),

        h2("6. Parsing: Parse, TryParse and NumberStyles"),
        p("`Parse` methods turn text into numbers and dates, and every one of them has an overload that takes the culture. Here is what four inputs become with the Vietnamese and the invariant culture:"),
        code("csharp", String.raw`
using System.Globalization;

var vi = CultureInfo.GetCultureInfo("vi-VN");
var inv = CultureInfo.InvariantCulture;

Console.WriteLine($"{"text",-11}{"vi-VN",-17}invariant");
foreach (string text in new[] { "8.5", "8,5", "1.800.000", "1,800,000" })
    Console.WriteLine($"{text,-11}{Parse(text, vi),-17}{Parse(text, inv)}");

foreach (string text in new[] { "8.5", " 9.25 ", "8,5", "tám" })
{
    bool ok = decimal.TryParse(text, NumberStyles.Float, inv, out decimal score);
    Console.WriteLine($"TryParse(\"{text}\", Float, invariant) -> {ok} {score}");
}

static string Parse(string text, CultureInfo culture)
{
    try { return decimal.Parse(text, culture).ToString(CultureInfo.InvariantCulture); }
    catch (FormatException) { return "FormatException"; }
}`, "Parse.cs"),
        code("text", String.raw`
text       vi-VN            invariant
8.5        85               8.5
8,5        8.5              85
1.800.000  1800000          FormatException
1,800,000  FormatException  1800000
TryParse("8.5", Float, invariant) -> True 8.5
TryParse(" 9.25 ", Float, invariant) -> True 9.25
TryParse("8,5", Float, invariant) -> False 0
TryParse("tám", Float, invariant) -> False 0`),
        bullets([
            "**The default number style accepts thousands separators**, and it does not check that they are in sensible places. That is why `8.5` in vi-VN and `8,5` in the invariant culture both become 85 instead of an error. Choosing the invariant culture fixes the uploads that follow the template, but a teacher who types `8,5` still gets 85.",
            "**`NumberStyles.Float`** allows a sign, a decimal point, an exponent and surrounding spaces - and no thousands separators. A score never has thousands, so `8,5` is now rejected instead of misread.",
            "**`TryParse` returns `false` instead of throwing.** Bad input from a user is not exceptional - a teacher typing `vắng` (absent) or `tám` is normal - so the import reports the line and goes on. `Parse` is for text that must be valid, where a `FormatException` means a bug. Lesson 8 covers exceptions properly.",
            "**Dates have the same problem**, worse: `10/11/2026` is 11 October in the invariant culture and 10 November in vi-VN. For data, use `DateTime.ParseExact(text, \"yyyy-MM-dd\", CultureInfo.InvariantCulture)` and ISO 8601 (`2026-10-26`).",
        ]),
        challenge("chal_quiz_csf_131", "For the first question, find every call that uses the current culture without saying so: Parse without a culture, and each hole in the interpolated string. For the second, remember what the invariant culture uses as its thousands separator, and that strings never change in place."),

        h2("7. Splitting, trimming and joining"),
        p("CSV lines from people contain stray spaces and empty fields. `Split` has options for both, and `string.Join` puts pieces back together:"),
        code("csharp", String.raw`
string line = " HS-1024 , Nguyễn Gia Bảo ,8.5,, 7 ";

string[] raw = line.Split(',');
Console.WriteLine($"{raw.Length} fields: [{string.Join("|", raw)}]");

string[] clean = line.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
Console.WriteLine($"{clean.Length} fields: [{string.Join("|", clean)}]");

string header = """
    Mã HS,Họ và tên,"Điểm TB"
    """;
Console.WriteLine(header);`, "Split.cs"),
        code("text", String.raw`
5 fields: [ HS-1024 | Nguyễn Gia Bảo |8.5|| 7 ]
4 fields: [HS-1024|Nguyễn Gia Bảo|8.5|7]
Mã HS,Họ và tên,"Điểm TB"`),
        bullets([
            "**`TrimEntries`** removes the spaces around each field; **`RemoveEmptyEntries`** drops empty fields. Think before using the second one on positional data: if the empty field was a missing score, the remaining scores move one column to the left.",
            "**Raw string literals** (`\"\"\"...\"\"\"`) need no escaping for quotes or backslashes, and the indentation of the closing `\"\"\"` is removed from every line. They are ideal for test data, SQL and JSON in code - this lesson's uploads use them.",
            "**Real CSV is more than `Split(',')`**: a field can contain a comma inside quotes (`\"Trần, Khánh Linh\"`). For files from outside your team, use a CSV library; for a fixed internal template like Sen Academy's, `Split` and strict validation are fine.",
        ]),

        h2("8. Comparing text"),
        p("String comparison has a culture too. For identifiers - class codes, student ids, file extensions, keys - you want **ordinal** comparison: compare the characters, nothing else:"),
        code("csharp", String.raw`
using System.Globalization;

string fromForm = "Toan9-a";
Console.WriteLine(fromForm == "TOAN9-A");
Console.WriteLine(fromForm.Equals("TOAN9-A", StringComparison.OrdinalIgnoreCase));
Console.WriteLine(string.Equals(fromForm, "TOAN9-A", StringComparison.OrdinalIgnoreCase));

string informatics = "tin6-a";   // Tin học 6
Console.WriteLine(informatics.ToUpper(CultureInfo.GetCultureInfo("tr-TR")));
Console.WriteLine(informatics.ToUpperInvariant());

string[] names = ["Dương", "Đỗ", "Bùi", "Đặng", "Vũ"];
string[] ordinal = [.. names];
Array.Sort(ordinal, StringComparer.Ordinal);
string[] vietnamese = [.. names];
Array.Sort(vietnamese, StringComparer.Create(CultureInfo.GetCultureInfo("vi-VN"), ignoreCase: false));
Console.WriteLine($"Ordinal: {string.Join(", ", ordinal)}");
Console.WriteLine($"vi-VN:   {string.Join(", ", vietnamese)}");`, "Compare.cs"),
        code("text", String.raw`
False
True
True
TİN6-A
TIN6-A
Ordinal: Bùi, Dương, Vũ, Đặng, Đỗ
vi-VN:   Bùi, Dương, Đặng, Đỗ, Vũ`),
        bullets([
            "**`==` on strings is ordinal and case-sensitive.** For case-insensitive matching of codes, use `StringComparison.OrdinalIgnoreCase` - not `a.ToUpper() == b.ToUpper()`, which allocates two strings and uses the current culture.",
            "**`ToUpper()` and `ToLower()` without a culture are culture-sensitive.** On a Turkish server, `i` becomes `İ` (a dotted capital I), and the class code `TIN6-A` no longer matches. Use `ToUpperInvariant()` for identifiers.",
            "**Sorting names for people is the opposite case.** Ordinal order puts `Đ` after `Z`, because its character code is larger; the Vietnamese culture sorts it right after `D`, as the class list should. Sort what people read with their culture, compare identifiers ordinally.",
        ]),

        h2("9. Length is not the number of letters"),
        p("`string.Length` counts UTF-16 code units, not the letters a person sees. Vietnamese text can be stored in two ways: `ễ` as one precomposed character, or as `e` followed by two combining marks. Both look identical on screen:"),
        code("csharp", String.raw`
using System.Globalization;

string typed = "Nguyễn";                                         // from a phone keyboard
string pasted = typed.Normalize(NormalizationForm.FormD);        // the same name, decomposed
Console.WriteLine($"{typed.Length} {pasted.Length} {typed == pasted}");
Console.WriteLine(string.Equals(typed, pasted.Normalize(), StringComparison.Ordinal));
Console.WriteLine(new StringInfo(pasted).LengthInTextElements);`, "Length.cs"),
        code("text", String.raw`
6 8 False
True
6`),
        p("If names come from several sources - a phone, a spreadsheet, a copy from a PDF - normalize them with `Normalize()` (form C) before you compare or store them, or a search for \"Nguyễn\" will miss half the Nguyễns. Use `StringInfo` when you really need the number of visible characters, for example to cut an SMS at 160 characters without splitting a letter."),

        h2("10. The fix"),
        p("The fixed worker names the culture in every conversion: the invariant culture for the upload and the export, Vietnamese for the parents. It also switches to `decimal` with explicit rounding, rejects scores that are not numbers from 0 to 10 instead of guessing, and reports the line:"),
        code("csharp", String.raw`
using System.Globalization;

// Score import, after the fix: machines get invariant text, people get Vietnamese.
var vietnamese = CultureInfo.GetCultureInfo("vi-VN");
Console.WriteLine($"culture: \"{CultureInfo.CurrentCulture.Name}\"");

string upload = """
    HS-1024,Nguyễn Gia Bảo,8.5,7,9.5
    HS-1025,Trần Khánh Linh,9,8.75,10
    HS-1026,Lê Hoàng Nam,6.5,7.5,8
    HS-1027,Đỗ Mai Anh,8,vắng,9
    """;

int lineNumber = 0;
foreach (string line in upload.Split('\n'))
{
    lineNumber++;
    string[] fields = line.Split(',', StringSplitOptions.TrimEntries);
    decimal sum = 0;
    string? bad = null;
    foreach (string text in fields[2..])
    {
        if (decimal.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out decimal score)
            && score >= 0 && score <= 10)
            sum += score;
        else
            bad ??= text;
    }
    if (bad is not null)
    {
        Console.WriteLine($"line {lineNumber}: bad score '{bad}' - row skipped");
        continue;
    }
    decimal average = Math.Round(sum / (fields.Length - 2), 1, MidpointRounding.AwayFromZero);
    Console.WriteLine(string.Create(CultureInfo.InvariantCulture, $"csv: {fields[0]},{fields[1]},{average:F1}"));
    Console.WriteLine(string.Create(vietnamese, $"sms: {fields[1]} - điểm trung bình {average:F1}"));
}`, "Program.cs"),
        code("text", String.raw`
$ LANG=vi_VN.UTF-8 dotnet run
culture: "vi-VN"
csv: HS-1024,Nguyễn Gia Bảo,8.3
sms: Nguyễn Gia Bảo - điểm trung bình 8,3
csv: HS-1025,Trần Khánh Linh,9.3
sms: Trần Khánh Linh - điểm trung bình 9,3
csv: HS-1026,Lê Hoàng Nam,7.3
sms: Lê Hoàng Nam - điểm trung bình 7,3
line 4: bad score 'vắng' - row skipped`),
        numbered([
            "**Every parse and every format names its culture.** The output is identical with `LANG=C.UTF-8` - the worker no longer depends on how the image is set up.",
            "**`NumberStyles.Float` with the invariant culture** accepts exactly what the template allows: digits, one dot, optional spaces. The range check catches the rest.",
            "**`decimal` and `Math.Round(..., MidpointRounding.AwayFromZero)`** give Linh the 9.3 that her report card rule says, instead of whatever a format string does with a double.",
            "**A bad row is reported, not guessed.** `vắng` is a teacher's note, not a score; the row goes back to the teacher instead of becoming a 0 or a crash.",
            "**`fields[2..]`** is a range: the array from index 2 to the end. `bad ??= text` keeps the first bad score only (lesson 2).",
            "**Tuấn also added a test that runs the import with `CultureInfo.CurrentCulture` set to vi-VN**, so the next base-image change cannot break it silently. The challenge below uses the same trick.",
        ]),
        callout("tip", "Setting the culture for the whole process is not the fix",
            "A tempting one-liner is CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture at startup, or InvariantGlobalization in the project. It does make the export right - and silently turns the parents' SMS into 8.3, and every date in the emails into English. Code that names its culture works under any setting; code that relies on a global setting breaks the next time someone changes it."),

        h2("11. Your turn"),
        p("The real import has its three culture-sensitive steps in three small functions: reading a score, writing the CSV row, and writing the SMS text. The test runner does what the new container image does - it sets the current culture to vi-VN - then reads one student per line and prints the CSV row and the SMS for every valid line, an error for every invalid one, and the totals."),
        challenge("chal_fix_csf_132", "Find every place where text becomes a number or a number becomes text, and decide who reads the result: a program (the invariant culture) or a parent (vi-VN). Do not change the current culture - the runner sets it on purpose, and the SMS must still use a Vietnamese decimal comma."),

        h2("12. Pitfalls"),
        bullets([
            "**`Parse` and `ToString` without a culture in server code**: they depend on `LANG`, the Windows region or whoever set up the machine. Name the culture every time.",
            "**Assuming `F1` or `N0` means a dot or a comma**: the culture decides. `{x:F1}` is `8.3` or `8,3`.",
            "**Parsing with the default number style**: thousands separators are accepted anywhere, so `8,5` with the invariant culture is 85, not an error. Use `NumberStyles.Float` (or `Integer`) for values that never have thousands.",
            "**Setting the culture globally to make one thing work**: it breaks everything that should have been culture-specific, like messages for people.",
            "**Forgetting that strings are immutable**: `name.Trim();` on its own line does nothing.",
            "**Comparing identifiers with culture rules**: use `==` or `StringComparison.OrdinalIgnoreCase`, and `ToUpperInvariant`, never `ToUpper()`.",
            "**Splitting real-world CSV with `Split(',')`**: fine for your own strict template, wrong for files with quoted fields.",
        ]),

        h2("13. Checklist"),
        bullets([
            "Every `Parse`, `TryParse`, `ToString` and interpolated string in data paths passes `CultureInfo.InvariantCulture` (or uses `string.Create` / `FormattableString.Invariant`).",
            "Text for people is formatted with an explicit culture chosen for those people.",
            "Numeric input is parsed with `TryParse`, a fitting `NumberStyles`, and a range check; bad input is reported with its line.",
            "Dates in data use ISO 8601 and `ParseExact`.",
            "Identifiers are compared ordinally; names shown to people are sorted with their culture.",
            "There is a test that runs the code with a non-English current culture.",
        ]),
        p("Next lesson: List, Dictionary and HashSet. The enrollment dashboard crashed with a KeyNotFoundException, and after the quick fix a parent who clicked \"Sign up\" twice was counted twice."),
    ],
});
