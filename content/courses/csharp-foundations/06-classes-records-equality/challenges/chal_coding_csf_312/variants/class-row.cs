using System.Globalization;

// Sen Academy - merging the term's test scores from two sources.
//
// Teachers type 15-minute and 45-minute test scores into the portal, and the online quiz system
// sends the scores of the tests it graded. Some tests come from BOTH sources, so the same score
// arrives twice - sometimes typed in lower case, sometimes as 8.50 instead of 8.5.
//
// Input (stdin): one score per line, five fields separated by spaces:
//   STUDENT  student id, e.g. HS-1024 (any letter case)
//   CLASS    class code, e.g. TOAN9-A (any letter case)
//   TERM     HK1 or HK2 (any letter case)
//   TEST     test name, e.g. KT15-1 (any letter case)
//   SCORE    0 to 10, a decimal with a dot, e.g. 8.5 or 8.50
//
// Write ParseRow, Deduplicate and GroupByClassTerm. The test runner at the bottom prints:
//   rows R, unique U                       R input rows, U rows left after removing duplicates
//   CLASS TERM: S scores from N students, average A
//                                          one line per (class, term), sorted by class then term,
//                                          A rounded to 2 decimals
//
// Two rows are duplicates when student, class, term, test and score are all equal, ignoring letter
// case and how the score is written (8.5 and 8.50 are the same score). A student has several tests
// per term: different tests are different rows. Keep the first row of each set of duplicates, in input order.
//
// Example input:
//   HS-1024 TOAN9-A HK1 KT15-1 8.5
//   HS-1025 TOAN9-A HK1 KT15-1 7
//   hs-1024 toan9-a hk1 kt15-1 8.50
//   HS-1024 TOAN9-A HK1 KT15-2 9
// Expected output:
//   rows 4, unique 3
//   TOAN9-A HK1: 3 scores from 2 students, average 8.17
//
// The records ScoreRow and ClassTerm are declared at the very end of the file.

// ParseRow turns one input line into a ScoreRow: ids, class, term and test in upper case, the score as a decimal.
static ScoreRow ParseRow(string line)
{
    string[] f = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
    return new ScoreRow(
        f[0].ToUpperInvariant(),
        f[1].ToUpperInvariant(),
        f[2].ToUpperInvariant(),
        f[3].ToUpperInvariant(),
        decimal.Parse(f[4], CultureInfo.InvariantCulture));
}

// Deduplicate returns the rows without duplicates, keeping the first of each, in input order.
static List<ScoreRow> Deduplicate(List<ScoreRow> rows)
{
    var seen = new HashSet<ScoreRow>();
    var unique = new List<ScoreRow>();
    foreach (var row in rows)
        if (seen.Add(row))
            unique.Add(row);
    return unique;
}

// GroupByClassTerm returns the rows of each (class, term), in input order.
static Dictionary<ClassTerm, List<ScoreRow>> GroupByClassTerm(List<ScoreRow> rows)
{
    var groups = new Dictionary<ClassTerm, List<ScoreRow>>();
    foreach (var row in rows)
    {
        var key = new ClassTerm(row.ClassCode, row.Term);
        if (!groups.TryGetValue(key, out var list))
            groups[key] = list = [];
        list.Add(row);
    }
    return groups;
}

// ---------------------------------------------------------------- test runner (do not change)
var rows = new List<ScoreRow>();
foreach (string line in Console.In.ReadToEnd().Split('\n'))
    if (!string.IsNullOrWhiteSpace(line))
        rows.Add(ParseRow(line.Trim()));

var unique = Deduplicate(rows);
Console.WriteLine($"rows {rows.Count}, unique {unique.Count}");
foreach (var (key, list) in GroupByClassTerm(unique)
             .OrderBy(g => g.Key.ClassCode, StringComparer.Ordinal)
             .ThenBy(g => g.Key.Term, StringComparer.Ordinal))
{
    decimal average = Math.Round(list.Average(r => r.Score), 2, MidpointRounding.AwayFromZero);
    int students = list.Select(r => r.StudentId).Distinct().Count();
    Console.WriteLine(string.Create(CultureInfo.InvariantCulture,
        $"{key.ClassCode} {key.Term}: {list.Count} scores from {students} students, average {average:0.00}"));
}

// ---------------------------------------------------------------- types
class ScoreRow(string studentId, string classCode, string term, string test, decimal score)
{
    public string StudentId { get; } = studentId;
    public string ClassCode { get; } = classCode;
    public string Term { get; } = term;
    public string Test { get; } = test;
    public decimal Score { get; } = score;
}
readonly record struct ClassTerm(string ClassCode, string Term);
