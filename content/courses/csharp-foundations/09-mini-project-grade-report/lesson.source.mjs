// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-csf-4-2",
    title: "Mini project: a grade report",
    slug: { _type: "slug", current: "csharp-mini-project-grade-report" },
    description:
        "The end-of-term report went to 2,400 families on Friday. By Monday Sen Academy had a list of complaints: a 6.45 shown as 6.4 and ranked one grade too low, a make-up exam averaged with the 0 it replaced, two subjects mixed into one average, a student ranked Giỏi from two of her three scores, and averages of 291 on one campus. Rebuild the report, TermReport, step by step with everything from this course: records for lines and keys, TryParse with the invariant culture and a reason for every rejected line, a dictionary where corrections replace old scores, LINQ grouping per student and class, decimal averages rounded half away from zero, a switch expression for the Vietnamese ranking, a stable sort and culture-safe output - then check the pieces.",
    estimatedTime: 24,

    scenario: {
        role: "Junior C# developer on the Sen Academy portal team, an after-school tutoring center in Hà Nội",
        problem:
            "At the end of every term each student gets an average and a ranking per class: 30% homework, 30% midterm, 40% final exam, then Giỏi, Khá, Trung bình or Yếu. The report has been made by a small script an intern wrote two years ago. This term its mistakes reached parents, and Phạm Minh Tuấn asked you to replace it before the corrected reports go out.",
    },

    content: [
        h2("1. The incident"),
        p("Sen.Portal exports every score of the term to `scores.csv`: one line per student, class and component (`hw` for homework, `mid` for the midterm, `final` for the final exam). A script called TermReport reads the export, computes each student's weighted average - 30% homework, 30% midterm, 40% final - and the Vietnamese ranking: **Giỏi** from 8.0, **Khá** from 6.5, **Trung bình** from 5.0, **Yếu** below. On Friday the reports went to 2,400 families. On Monday Bùi Thị Hạnh forwarded four complaints from TOAN9-A alone:"),
        bullets([
            "**Hoàng Thu Trang** has 6.45 by hand - Khá, which her scholarship requires - but the report says **6.4, Trung bình**.",
            "**Lê Hoàng Nam** missed the midterm with a fever, got the import hotfix's 0 from lesson 4-1, then scored 7 in the make-up exam. The report says **5.5**: the 0 and the 7 were both counted.",
            "**Nguyễn Gia Bảo** has 8.6 in Toán 9 and 7.0 in Tiếng Anh 7. The report shows one number, **7.8**, on both.",
            "**Đỗ Mai Anh** is ranked **Giỏi with 8.7**, although cô Hương never entered her midterm: the tablet app exported it as `midterm` instead of `mid`.",
        ]),
        p("And the Long Biên campus, whose server runs with Vietnamese regional settings, printed averages like **291,3** - all ranked Giỏi."),

        h2("2. Reproduce it"),
        p("The script, and an export with the four students of the complaints:"),
        code("csharp", String.raw`
// Term report v1: one line per student, the weighted average of all their score lines.
var weights = new Dictionary<string, decimal> { ["hw"] = 0.3m, ["mid"] = 0.3m, ["final"] = 0.4m };
var totals = new Dictionary<string, (string Name, decimal Sum, decimal Weight)>();

foreach (string line in Console.In.ReadToEnd().Split('\n').Skip(1))
{
    string[] f = line.Trim().Split(',');
    if (f.Length != 5 || !weights.TryGetValue(f[3], out decimal weight))
        continue;                                    // skip what we do not understand
    decimal score = decimal.Parse(f[4]);
    var (name, sum, weightSum) = totals.GetValueOrDefault(f[0], (f[1], 0m, 0m));
    totals[f[0]] = (name, sum + score * weight, weightSum + weight);
}

foreach (var (id, (name, sum, weightSum)) in totals)
{
    decimal average = Math.Round(sum / weightSum, 1);
    string rank = average >= 8.0m ? "Giỏi" : average >= 6.5m ? "Khá" : average >= 5.0m ? "Trung bình" : "Yếu";
    Console.WriteLine($"{name,-16} {average,4} {rank}");
}`, "TermReportV1.cs"),
        code("text", String.raw`
student,name,class,component,score
HS-1024,Nguyễn Gia Bảo,TOAN9-A,hw,8.5
HS-1024,Nguyễn Gia Bảo,TOAN9-A,mid,8
HS-1024,Nguyễn Gia Bảo,TOAN9-A,final,9
HS-1026,Lê Hoàng Nam,TOAN9-A,hw,7
HS-1026,Lê Hoàng Nam,TOAN9-A,mid,0
HS-1026,Lê Hoàng Nam,TOAN9-A,final,7.5
HS-1029,Hoàng Thu Trang,TOAN9-A,hw,6
HS-1029,Hoàng Thu Trang,TOAN9-A,mid,6.5
HS-1029,Hoàng Thu Trang,TOAN9-A,final,6.75
HS-1027,Đỗ Mai Anh,TOAN9-A,hw,9
HS-1027,Đỗ Mai Anh,TOAN9-A,midterm,8
HS-1027,Đỗ Mai Anh,TOAN9-A,final,8.5
HS-1024,Nguyễn Gia Bảo,ANH7-B,hw,7
HS-1024,Nguyễn Gia Bảo,ANH7-B,mid,7
HS-1024,Nguyễn Gia Bảo,ANH7-B,final,7
HS-1026,Lê Hoàng Nam,TOAN9-A,mid,7`, "scores.csv"),
        code("text", String.raw`
$ dotnet run TermReportV1.cs < scores.csv
Nguyễn Gia Bảo    7.8 Khá
Lê Hoàng Nam      5.5 Trung bình
Hoàng Thu Trang   6.4 Trung bình
Đỗ Mai Anh        8.7 Giỏi`),
        p("All four complaints, reproduced. (`dotnet run File.cs` runs a single C# file without a project, new in .NET 10.) The Long Biên numbers need one more line: the server's regional settings, which this line at the top of the script imitates:"),
        code("csharp", String.raw`
System.Globalization.CultureInfo.CurrentCulture = new System.Globalization.CultureInfo("vi-VN");`),
        code("text", String.raw`
Nguyễn Gia Bảo   19,2 Giỏi
Lê Hoàng Nam     26,3 Giỏi
Hoàng Thu Trang  291,3 Giỏi
Đỗ Mai Anh       52,4 Giỏi`),
        p("Every bug in the script is a lesson of this course:"),
        numbered([
            "**`decimal.Parse(f[4])` uses the current culture** (lesson 1-3). In `vi-VN` the dot is the thousands separator, so `8.5` is 85 and `6.75` is 675; `$\"{average,4}\"` then prints a comma.",
            "**Unknown lines are skipped without a word** (lesson 4-1). `midterm` was not a known component, so Mai Anh's average came from two scores - and nobody was told.",
            "**Every line adds to the total, so a correction is counted twice** (lessons 2-1 and 3-1). The key that should be unique - student, class, component - is not used as a key at all.",
            "**The dictionary key is the student id alone** (lesson 2-1), so Bảo's two classes land in one total.",
            "**`Math.Round(x, 1)` rounds a half to the even digit** (lesson 1-1): 6.45 becomes 6.4. The accountant's and the school's rule is \"a half rounds up\".",
        ]),

        h2("3. The plan"),
        p("TermReport v2 is the same job in five steps, each a small function that does one thing and can be checked on its own:"),
        image("report-pipeline", {
            alt: "Five steps of the new TermReport on the left in green, each paired with the v1 bug it removes on the right in red. 1. Parse each line: decimal.TryParse(text, NumberStyles.Float, InvariantCulture, ...); 5 fields, a known component, a number, 0 to 10, or the rejection line N: reason. v1: decimal.Parse(f[4]) with the server's culture, so on Long Biên (vi-VN) 8.5 is 85, and midterm was skipped without a word. 2. Keep the latest score per key: latest[new ScoreKey(student, class, component)] = line. v1: Nam's midterm counted twice, the hotfix's 0 and the make-up exam's 7, average 5.5. 3. Group per student AND class: latest.Values.GroupBy(s => (s.Student, s.Class)). v1: keyed by student id only, Bảo's Toán 9 and Tiếng Anh 7 mixed into one 7.8. 4. Weighted average in decimal: Math.Round(0.3 hw + 0.3 mid + 0.4 final, 1, AwayFromZero), null when a component is missing so the student is incomplete. v1: Math.Round(x, 1) rounds a half to even, Trang's 6.45 became 6.4 Trung bình, and Mai Anh got 8.7 from two of three scores. 5. Rank, sort, format: average switch with >= 8.0m giving Giỏi, OrderBy class then ThenByDescending average then ThenBy name, string.Create(CultureInfo.InvariantCulture, ...). v1: printed with the current culture, 291,3 Giỏi on Long Biên, and printed in dictionary order, the order the lines happened to arrive in. Footer: each step is a small function with its own check, and each v1 bug is one lesson of this course.",
            caption: "Each v1 bug sits in one step, so each fix is one small function.",
        }),

        h2("4. Step 1: parse every line, reject with a reason"),
        p("A line becomes a **record** (lesson 3-1): immutable, compared by value, with a readable `ToString`. The line number travels with it, so every later step can point back into the file."),
        code("csharp", String.raw`
// One accepted line of scores.csv.
record ScoreLine(int Line, string Student, string Name, string Class, string Component, decimal Score)
{
    public ScoreKey Key => new(Student, Class, Component);
}

static class Grading
{
    static readonly Dictionary<string, decimal> Weights = new() { ["hw"] = 0.3m, ["mid"] = 0.3m, ["final"] = 0.4m };

    // ParseLine turns "HS-1024,Nguyễn Gia Bảo,TOAN9-A,hw,8.5" into a ScoreLine,
    // or throws FormatException with the reason.
    public static ScoreLine ParseLine(int lineNumber, string text)
    {
        string[] f = text.Split(',', StringSplitOptions.TrimEntries);
        if (f.Length != 5)
            throw new FormatException($"expected 5 fields, got {f.Length}");
        if (!Weights.ContainsKey(f[3]))
            throw new FormatException($"unknown component \"{f[3]}\"");
        if (!decimal.TryParse(f[4], NumberStyles.Float, CultureInfo.InvariantCulture, out decimal score))
            throw new FormatException($"score \"{f[4]}\" is not a number");
        if (score is < 0 or > 10)
            throw new FormatException($"score {f[4]} is out of range 0-10");
        return new ScoreLine(lineNumber, f[0], f[1], f[2], f[3], score);
    }
}`),
        bullets([
            "**`CultureInfo.InvariantCulture` and `NumberStyles.Float`**: a dot is always the decimal point and thousands separators are not accepted, whatever the server's settings. That single argument fixes the Long Biên report.",
            "**The checks run in a fixed order and the first failing one wins**, so a line always gets the same, single reason.",
            "**`StringSplitOptions.TrimEntries`** removes the spaces around each field, so `hw , 8.5` is fine.",
            "**`score is < 0 or > 10`** is a relational pattern (lesson 3-2) - shorter than `score < 0 || score > 10`, and it reads like the rule.",
            "**`FormatException` is thrown for bad input that the caller catches around one line** - exactly the pattern of lesson 4-1. It is our own exception for our own checks; nothing else in `ParseLine` can throw it.",
        ]),
        p("The loop in `Main` keeps a list of rejected lines with their numbers. The header is line 1, so `lines[i]` is line `i + 1`, and blank lines are skipped but still counted - the teacher looking for line 12 in a spreadsheet must find it there."),

        h2("5. Step 2: corrections replace, they do not add"),
        p("The rule for corrections is \"the later line for the same student, class and component wins\". That sentence names a key, so the code should have one: a `readonly record struct` with exactly those three fields, and a dictionary from that key to the line."),
        code("csharp", String.raw`
var latest = new Dictionary<ScoreKey, decimal>();
latest[new ScoreKey("HS-1026", "TOAN9-A", "mid")] = 0m;   // the hotfix's 0 from lesson 4-1
latest[new ScoreKey("HS-1026", "TOAN9-A", "mid")] = 7m;   // the make-up exam: an equal key, so it replaces
latest[new ScoreKey("HS-1026", "TOAN9-A", "hw")] = 7m;
Console.WriteLine($"{latest.Count} keys, mid = {latest[new ScoreKey("HS-1026", "TOAN9-A", "mid")]}");
Console.WriteLine(new ScoreKey("HS-1026", "TOAN9-A", "mid"));

readonly record struct ScoreKey(string Student, string Class, string Component);`, "Corrections.cs"),
        code("text", String.raw`
2 keys, mid = 7
ScoreKey { Student = HS-1026, Class = TOAN9-A, Component = mid }`),
        bullets([
            "**Records compare by value** and generate a matching `GetHashCode`, so three `new ScoreKey(...)` calls with the same values are the same key. With a plain `class` the second line would add a second entry (lesson 3-1).",
            "**The indexer `latest[key] = value` adds or replaces** (lesson 2-1). `TryAdd` would keep the **first** line - the 0 - which is the opposite of the rule.",
            "**`record struct`** avoids an allocation per key; `readonly` makes its fields unchangeable, which a key must be anyway: a key that changes after it went into a dictionary can never be found again.",
        ]),

        h2("6. Steps 3 and 4: group, then average"),
        p("Averages are per student **and class**. `GroupBy` with a tuple key groups on both values at once (tuples compare by value too):"),
        code("csharp", String.raw`
var results = latest.Values
    .GroupBy(s => (s.Student, s.Class))
    .Select(g => new StudentResult(g.Key.Student, g.MaxBy(s => s.Line)!.Name, g.Key.Class, Grading.Average(g)))
    .ToList();`),
        p("`g.MaxBy(s => s.Line)` picks the student's last line in that class, so a corrected spelling of a name wins as well. `Average` takes the group's lines and returns `decimal?`: a number, or `null` when a component is missing (lesson 1-2) - an absent score is not a 0, and a student with two of three scores has no average yet."),
        code("csharp", String.raw`
// Average returns the weighted average rounded to one decimal, half away from zero,
// or null when the student does not have all three components.
public static decimal? Average(IEnumerable<ScoreLine> scores)
{
    var byComponent = scores.ToDictionary(s => s.Component, s => s.Score);
    if (byComponent.Count != Weights.Count)
        return null;
    decimal exact = Weights.Sum(w => w.Value * byComponent[w.Key]);
    return Math.Round(exact, 1, MidpointRounding.AwayFromZero);
}`),
        p("After step 2 each component appears at most once per student and class, so `ToDictionary` cannot meet a duplicate key; if it ever did, its `ArgumentException` would be a bug in step 2, and should crash. The rounding is where Trang lost her Khá. Two numbers make the case for both `decimal` and `AwayFromZero`:"),
        code("csharp", String.raw`
decimal trang = 0.3m * 6 + 0.3m * 6.5m + 0.4m * 6.75m;
Console.WriteLine($"Trang:  {trang}  ToEven {Math.Round(trang, 1)}  AwayFromZero {Math.Round(trang, 1, MidpointRounding.AwayFromZero)}");

decimal huy = 0.3m * 5.5m + 0.3m * 6 + 0.4m * 6.25m;
double huyInDouble = 0.3 * 5.5 + 0.3 * 6 + 0.4 * 6.25;
Console.WriteLine($"decimal: {huy} -> {Math.Round(huy, 1, MidpointRounding.AwayFromZero)}");
Console.WriteLine($"double:  {huyInDouble:R} -> {Math.Round(huyInDouble, 1, MidpointRounding.AwayFromZero)}");`, "Rounding.cs"),
        code("text", String.raw`
Trang:  6.450  ToEven 6.4  AwayFromZero 6.5
decimal: 5.950 -> 6.0
double:  5.949999999999999 -> 5.9`),
        bullets([
            "**`Math.Round(x, 1)` is banker's rounding**: a half goes to the even digit, so 6.45 becomes 6.4 while 6.55 would become 6.6. It is the default because it does not bias large sums, but it is not the school's rule. Say the rule in code: `MidpointRounding.AwayFromZero`.",
            "**`double` cannot store 0.3, 5.95 or 6.45 exactly.** For Vũ Đức Huy the sum comes out just below 5.95, and no rounding mode can bring it back: 5.9 instead of 6.0. With quarter-point scores, more than a thousand of the 68,921 possible combinations round differently in `double` than in `decimal`. Scores, like money, are `decimal`.",
        ]),

        h2("7. Step 5: rank, sort and print"),
        p("The ranking is a switch expression with relational patterns (lesson 3-2). The arms are tried from top to bottom, and the compiler checks the order for you: put `>= 5.0m` above `>= 8.0m` and the `>= 8.0m` arm is error CS8510, \"The pattern is unreachable\"."),
        code("csharp", String.raw`
public static string Rank(decimal average) => average switch
{
    >= 8.0m => "Giỏi",
    >= 6.5m => "Khá",
    >= 5.0m => "Trung bình",
    _ => "Yếu",
};`),
        p("The report is sorted by class, then average (highest first), then name. Every sort key is spelled out, and string keys use `StringComparer.Ordinal`, so the order depends neither on the order of the input lines nor on the server's culture. Without the last `ThenBy`, two students with the same average would be printed in whatever order their lines arrived - a different report each time the export is regenerated."),
        p("Output goes through `string.Create(CultureInfo.InvariantCulture, $\"...\")`, which formats every value in the interpolated string with the invariant culture: `{average,4:F1}` is right-aligned in 4 characters with exactly one decimal and a dot, also on Long Biên."),

        h2("8. The program"),
        p("All five steps together. `Main` (the top-level statements) only wires them up; the logic is in `Grading`, where it can be checked:"),
        code("csharp", String.raw`
// TermReport: the end-of-term report of Sen Academy, one line per student and class.
//
//   dotnet run TermReport.cs < scores.csv
using System.Globalization;
using System.Text;

var rejected = new List<string>();
var latest = new Dictionary<ScoreKey, ScoreLine>();

string[] lines = Console.In.ReadToEnd().Split('\n');
for (int i = 1; i < lines.Length; i++)                  // lines[0] is the header, line 1
{
    string text = lines[i].Trim();
    if (text.Length == 0) continue;
    try
    {
        ScoreLine score = Grading.ParseLine(i + 1, text);
        latest[score.Key] = score;                          // a later line is a correction
    }
    catch (FormatException ex)
    {
        rejected.Add($"line {i + 1}: {ex.Message}");
    }
}

var results = latest.Values
    .GroupBy(s => (s.Student, s.Class))
    .Select(g => new StudentResult(g.Key.Student, g.MaxBy(s => s.Line)!.Name, g.Key.Class, Grading.Average(g)))
    .ToList();

var report = new StringBuilder();
foreach (var r in results.Where(r => r.Average is not null)
             .OrderBy(r => r.Class, StringComparer.Ordinal)
             .ThenByDescending(r => r.Average)
             .ThenBy(r => r.Name, StringComparer.Ordinal))
{
    decimal average = r.Average!.Value;
    report.AppendLine(string.Create(CultureInfo.InvariantCulture,
        $"{r.Class,-8} {average,4:F1}  {Grading.Rank(average),-10}  {r.Name} ({r.Student})"));
}
foreach (var r in results.Where(r => r.Average is null).OrderBy(r => r.Name, StringComparer.Ordinal))
    report.AppendLine($"incomplete: {r.Name} ({r.Student}) in {r.Class}");
foreach (string line in rejected)
    report.AppendLine($"rejected {line}");
Console.Write(report);

// ---------------------------------------------------------------- types
// One accepted line of scores.csv.
record ScoreLine(int Line, string Student, string Name, string Class, string Component, decimal Score)
{
    public ScoreKey Key => new(Student, Class, Component);
}

// What a correction replaces: the same student, class and component.
readonly record struct ScoreKey(string Student, string Class, string Component);

// Average is null when a component is missing.
record StudentResult(string Student, string Name, string Class, decimal? Average);

static class Grading
{
    static readonly Dictionary<string, decimal> Weights = new() { ["hw"] = 0.3m, ["mid"] = 0.3m, ["final"] = 0.4m };

    // ParseLine turns "HS-1024,Nguyễn Gia Bảo,TOAN9-A,hw,8.5" into a ScoreLine,
    // or throws FormatException with the reason.
    public static ScoreLine ParseLine(int lineNumber, string text)
    {
        string[] f = text.Split(',', StringSplitOptions.TrimEntries);
        if (f.Length != 5)
            throw new FormatException($"expected 5 fields, got {f.Length}");
        if (!Weights.ContainsKey(f[3]))
            throw new FormatException($"unknown component \"{f[3]}\"");
        if (!decimal.TryParse(f[4], NumberStyles.Float, CultureInfo.InvariantCulture, out decimal score))
            throw new FormatException($"score \"{f[4]}\" is not a number");
        if (score is < 0 or > 10)
            throw new FormatException($"score {f[4]} is out of range 0-10");
        return new ScoreLine(lineNumber, f[0], f[1], f[2], f[3], score);
    }

    // Average returns the weighted average rounded to one decimal, half away from zero,
    // or null when the student does not have all three components.
    public static decimal? Average(IEnumerable<ScoreLine> scores)
    {
        var byComponent = scores.ToDictionary(s => s.Component, s => s.Score);
        if (byComponent.Count != Weights.Count)
            return null;
        decimal exact = Weights.Sum(w => w.Value * byComponent[w.Key]);
        return Math.Round(exact, 1, MidpointRounding.AwayFromZero);
    }

    public static string Rank(decimal average) => average switch
    {
        >= 8.0m => "Giỏi",
        >= 6.5m => "Khá",
        >= 5.0m => "Trung bình",
        _ => "Yếu",
    };
}`, "TermReport.cs"),
        code("text", String.raw`
$ dotnet run TermReport.cs < scores.csv
ANH7-B    7.0  Khá         Nguyễn Gia Bảo (HS-1024)
TOAN9-A   8.6  Giỏi        Nguyễn Gia Bảo (HS-1024)
TOAN9-A   7.2  Khá         Lê Hoàng Nam (HS-1026)
TOAN9-A   6.5  Khá         Hoàng Thu Trang (HS-1029)
incomplete: Đỗ Mai Anh (HS-1027) in TOAN9-A
rejected line 12: unknown component "midterm"`),
        p("Trang is Khá with 6.5, Nam has his make-up exam's 7.2, Bảo has one average per class, and Mai Anh is listed as incomplete with the line that explains why - cô Hương can fix `midterm` and rerun the export. With `CultureInfo.CurrentCulture` set to `vi-VN` first, as on the Long Biên server, the output is identical, character for character."),
        bullets([
            "**Types come after the top-level statements**: the compiler requires it, and it keeps the story of the program at the top of the file.",
            "**`using System.Text;` is written out.** The code runner adds it for you, but `dotnet run TermReport.cs` only imports the default namespaces of a console app, and `StringBuilder` is not among them.",
            "**`StringBuilder`** collects the report and writes it once; `AppendLine` adds a line ending.",
        ]),

        h2("9. Checking the pieces"),
        p("The functions in `Grading` take values and return values, so they are easy to check. The boundaries of the ranking and the two cases from the complaints belong in a check that runs on every change. These lines replace the report part of a copy of TermReport.cs (the types stay):"),
        code("csharp", String.raw`
// The self-check of Grading: boundaries and the two rounding cases from the incident.
Check(Grading.Rank(8.0m), "Giỏi", "8.0 is Giỏi");
Check(Grading.Rank(7.9m), "Khá", "7.9 is Khá");
Check(Grading.Rank(6.5m), "Khá", "6.5 is Khá");
Check(Grading.Rank(6.4m), "Trung bình", "6.4 is Trung bình");
Check(Grading.Rank(5.0m), "Trung bình", "5.0 is Trung bình");
Check(Grading.Rank(4.9m), "Yếu", "4.9 is Yếu");
ScoreLine[] trang = [new(2, "HS-1029", "Hoàng Thu Trang", "TOAN9-A", "hw", 6m),
                     new(3, "HS-1029", "Hoàng Thu Trang", "TOAN9-A", "mid", 6.5m),
                     new(4, "HS-1029", "Hoàng Thu Trang", "TOAN9-A", "final", 6.75m)];
Check(Grading.Average(trang), 6.5m, "6.45 rounds up");
Check(Grading.Average(trang[..2]), null, "no final, no average");
Check(Grading.ParseLine(7, "HS-1029,Hoàng Thu Trang,TOAN9-A,final, 6.75 ").Score, 6.75m, "spaces are fine");
Console.WriteLine("ok: 9 checks");

static void Check<T>(T actual, T expected, string what)
{
    if (!EqualityComparer<T>.Default.Equals(actual, expected))
        throw new Exception($"{what}: got {actual}, want {expected}");
}
// ok: 9 checks`, "GradingChecks.cs"),
        p("`trang[..2]` is a range: the first two elements, homework and midterm. In the portal itself these checks live in a test project (`dotnet new xunit`, then `dotnet test`), where each case is reported on its own. The same boundary checks as an xUnit theory - not runnable in the code runner, which has no test framework:"),
        code("csharp", String.raw`
public class GradingTests
{
    [Theory]
    [InlineData(8.0, "Giỏi")]
    [InlineData(7.9, "Khá")]
    [InlineData(6.5, "Khá")]
    [InlineData(6.4, "Trung bình")]
    [InlineData(5.0, "Trung bình")]
    [InlineData(4.9, "Yếu")]
    public void Rank_uses_the_Vietnamese_scale(double average, string expected) =>
        Assert.Equal(expected, Grading.Rank((decimal)average));
}`, "GradingTests.cs"),
        p("Attribute arguments cannot be `decimal`, hence the `double` and the cast: converting a `double` to `decimal` keeps 15 significant digits, so 7.9 becomes exactly 7.9m."),

        h2("10. Your turn"),
        p("Teachers want one block per class, not one long list: the class average, the students in a stable order, the incomplete students with what they are missing, and how many students got each ranking. The challenge's comment has the exact format. The test runner switches to `vi-VN` before it calls your `BuildReport`, like the Long Biên server."),
        challenge("chal_coding_csf_421", "Reuse the lesson's pieces: ParseLine for the rejected lines, the ScoreKey dictionary for corrections, Average and Rank. Then group the latest lines by class (ordinal order), and inside a class by student. Sort the complete students by average, name, id - all three keys - and remember that the class average is rounded like a student's. Every number goes through ToString(\"F1\", CultureInfo.InvariantCulture)."),

        h2("11. Pitfalls"),
        bullets([
            "**Parsing or formatting with the current culture**: one server with other regional settings changes every number. Pass `CultureInfo.InvariantCulture` to `Parse`, `TryParse`, `ToString` and `string.Create`.",
            "**`Math.Round(x, digits)` without a `MidpointRounding`**: banker's rounding. Name the rule your users expect.",
            "**`double` for scores or money**: 5.95 is stored as 5.9499999...; use `decimal`.",
            "**Skipping lines you do not understand**: report them with the line number and the reason, or the result is quietly based on less data.",
            "**A dictionary key that is too coarse** (student id instead of student + class + component) merges data; a key that is a `class` without value equality never matches.",
            "**`TryAdd` for corrections**: it keeps the first value; the indexer replaces it.",
            "**A sort without a full tie-break**: equal keys come out in input order, and the report changes when the input order does.",
            "**A missing score treated as 0**: the student gets an average that no teacher gave. Keep it missing (`null`) and say so.",
        ]),

        h2("12. Checklist"),
        bullets([
            "Input lines become records; every rejected line is reported with its line number and one reason.",
            "Numbers are parsed and printed with `CultureInfo.InvariantCulture`; the same input gives the same report on every server.",
            "Corrections use a dictionary keyed by a value-equal record of exactly the fields that identify a score.",
            "Grouping uses the full key (student and class); missing data stays `null`.",
            "Averages use `decimal` and `Math.Round(..., MidpointRounding.AwayFromZero)`.",
            "The ranking is one switch expression whose arm order the compiler checks.",
            "Every sort has a complete chain of keys with `StringComparer.Ordinal` for text.",
            "The pure functions are checked at their boundaries, in a test project or a self-check.",
        ]),

        h2("13. What you have learned"),
        p("This course started with a scholarship that was applied to a whole class because a class was shared by reference, and ends with a report that gives the same answer on every server. On the way: value and reference types, `decimal` and integer arithmetic; nullable reference types; strings and culture-safe parsing; `List`, `Dictionary` and `HashSet`; LINQ and deferred execution; classes, records and equality; pattern matching; and exceptions, `TryParse` and guard clauses. Together they are the everyday toolbox of C# on .NET 10."),
        p("The natural next steps are ASP.NET Core minimal APIs, to put a report like this behind an HTTP endpoint, async and await for I/O, and xUnit tests for everything you write."),
    ],
});
