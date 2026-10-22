using System.Globalization;
using System.Text;

// Sen Academy - the end-of-term class report.
//
// Input (stdin): scores.csv exported from Sen.Portal. The first line is always the header
// "student,name,class,component,score"; every other line is one score:
//   HS-1024,Nguyễn Gia Bảo,TOAN9-A,hw,8.5
// component is hw (homework, weight 30%), mid (midterm, 30%) or final (final exam, 40%).
//
// Rules:
//   - blank lines are skipped; spaces around fields and Windows line endings (\r\n) are fine.
//   - a line is REJECTED, with its line number in the file (the header is line 1) and the first
//     reason that applies, in this order:
//       line N: expected 5 fields, got K
//       line N: unknown component "TEXT"
//       line N: score "TEXT" is not a number        (a dot is the decimal separator: 8.5)
//       line N: score TEXT is out of range 0-10
//   - corrections: when the same student, class and component appear again, the LATER line
//     replaces the earlier one.
//   - a student's average in a class = 0.3 hw + 0.3 mid + 0.4 final, rounded to one decimal,
//     a half rounded UP (6.45 -> 6.5). A student without all three components is incomplete.
//   - ranking: Giỏi >= 8.0, Khá >= 6.5, Trung bình >= 5.0, Yếu below 5.0.
//   - the student's name is the name on their last accepted line in that class.
//
// Output, one block per class in ordinal order of the class code (ANH7-B before TOAN9-A):
//   CLASS: students N, class average A          N counts every student in the class; A is the
//                                               mean of the complete students' averages, rounded
//                                               like an average ("class average n/a" if none)
//     AVG RANK NAME (ID)                        complete students: highest average first, then
//                                               name, then id (both in ordinal order)
//     incomplete NAME (ID): missing C1, C2      then incomplete students by name, then id;
//                                               missing components in the order hw, mid, final
//     ranks: Giỏi a, Khá b, Trung bình c, Yếu d
// and at the end, always:
//   rejected: R
//     line N: reason                            in the order of the file
// Numbers have one decimal and a dot (8.6, 7.0, 10.0). The test runner sets the culture of the
// Long Biên server (vi-VN) first, so parse and format with CultureInfo.InvariantCulture.
//
// Write BuildReport and the helpers it needs. The types are at the bottom of the file.

// BuildReport returns the whole report for csv, every line ending in a newline.
static string BuildReport(string csv)
{
    var rejected = new List<string>();
    var latest = new Dictionary<ScoreKey, ScoreLine>();
    string[] lines = csv.Split('\n');
    for (int i = 1; i < lines.Length; i++)          // lines[0] is the header, line 1
    {
        string text = lines[i].Trim();
        if (text.Length == 0) continue;
        try
        {
            ScoreLine score = ParseLine(i + 1, text);
            latest[new ScoreKey(score.Student, score.Class, score.Component)] = score;   // a later line is a correction
        }
        catch (FormatException ex)
        {
            rejected.Add($"line {i + 1}: {ex.Message}");
        }
    }

    var report = new StringBuilder();
    foreach (var cls in latest.Values.GroupBy(s => s.Class).OrderBy(g => g.Key, StringComparer.Ordinal))
    {
        var students = cls.GroupBy(s => s.Student)
            .Select(g => (Id: g.Key, Name: g.MaxBy(s => s.Line)!.Name, Average: Average(g), Missing: Missing(g)))
            .ToList();
        var complete = students.Where(s => s.Average is not null)
            .OrderByDescending(s => s.Average)
            .ToList();
        var incomplete = students.Where(s => s.Average is null)
            .OrderBy(s => s.Name, StringComparer.Ordinal)
            .ThenBy(s => s.Id, StringComparer.Ordinal);

        string classAverage = complete.Count == 0 ? "n/a" : F1(Round(complete.Average(s => s.Average!.Value)));
        report.Append($"{cls.Key}: students {students.Count}, class average {classAverage}\n");
        foreach (var s in complete)
            report.Append($"  {F1(s.Average!.Value)} {Rank(s.Average.Value)} {s.Name} ({s.Id})\n");
        foreach (var s in incomplete)
            report.Append($"  incomplete {s.Name} ({s.Id}): missing {string.Join(", ", s.Missing)}\n");
        int count(string rank) => complete.Count(s => Rank(s.Average!.Value) == rank);
        report.Append($"  ranks: Giỏi {count("Giỏi")}, Khá {count("Khá")}, Trung bình {count("Trung bình")}, Yếu {count("Yếu")}\n");
    }
    report.Append($"rejected: {rejected.Count}\n");
    foreach (string line in rejected)
        report.Append($"  {line}\n");
    return report.ToString();
}

// ParseLine turns one line into a ScoreLine, or throws FormatException with the reason.
static ScoreLine ParseLine(int lineNumber, string text)
{
    string[] f = text.Split(',', StringSplitOptions.TrimEntries);
    if (f.Length != 5)
        throw new FormatException($"expected 5 fields, got {f.Length}");
    if (f[3] is not ("hw" or "mid" or "final"))
        throw new FormatException($"unknown component \"{f[3]}\"");
    if (!decimal.TryParse(f[4], NumberStyles.Float, CultureInfo.InvariantCulture, out decimal score))
        throw new FormatException($"score \"{f[4]}\" is not a number");
    if (score is < 0 or > 10)
        throw new FormatException($"score {f[4]} is out of range 0-10");
    return new ScoreLine(lineNumber, f[0], f[1], f[2], f[3], score);
}

// Average returns the student's rounded weighted average in one class, or null if a component is missing.
static decimal? Average(IEnumerable<ScoreLine> scores)
{
    var byComponent = scores.ToDictionary(s => s.Component, s => s.Score);
    if (byComponent.Count != 3)
        return null;
    return Round(0.3m * byComponent["hw"] + 0.3m * byComponent["mid"] + 0.4m * byComponent["final"]);
}

// Missing returns the components the student does not have, in the order hw, mid, final.
static IEnumerable<string> Missing(IEnumerable<ScoreLine> scores) =>
    new[] { "hw", "mid", "final" }.Where(c => !scores.Any(s => s.Component == c));

static decimal Round(decimal value) => Math.Round(value, 1, MidpointRounding.AwayFromZero);

static string F1(decimal value) => value.ToString("F1", CultureInfo.InvariantCulture);

static string Rank(decimal average) => average switch
{
    >= 8.0m => "Giỏi",
    >= 6.5m => "Khá",
    >= 5.0m => "Trung bình",
    _ => "Yếu",
};

// ---------------------------------------------------------------- test runner (do not change)
CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("vi-VN");   // the Long Biên server
Console.Write(BuildReport(Console.In.ReadToEnd()));

// ---------------------------------------------------------------- types
// One accepted line of scores.csv; Line is its line number in the file.
record ScoreLine(int Line, string Student, string Name, string Class, string Component, decimal Score);

// What a correction replaces: the same student, class and component.
readonly record struct ScoreKey(string Student, string Class, string Component);
