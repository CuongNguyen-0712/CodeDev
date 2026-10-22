using System.Globalization;

// Sen Academy - the nightly score import.
//
// Teachers upload one CSV file per class. The first line is always the header
// "student,class,score"; every other line is one student's score:
//   HS-1024,TOAN9-A,8.5
//
// The rules (from cô Hương and the portal team):
//   - a score is a number from 0 to 10, written with a dot (8.5, 10, 7.25);
//   - the word vắng in the score column means the student was absent: import the row
//     as absent (Score = null) - an absent student does NOT get a 0;
//   - blank lines are skipped; spaces around fields and Windows line endings (\r\n) are fine;
//   - every other problem rejects that line ONLY, with its line number in the file (the header is
//     line 1) and the first reason that applies, in this order:
//       line N: expected 3 fields, got K
//       line N: missing student id
//       line N: score "TEXT" is not a number
//       line N: score TEXT is out of range 0-10
//   - one bad line must never stop the import of the other lines.
//
// The bug: last month one "vắng" aborted the whole file. The hotfix below made it worse:
// absent students and cut-off lines now get a silent 0, a score of 85 goes through, and a
// line without any comma still stops the import. Fix ImportScores and ParseRow.
// The types (ScoreRow, ImportResult) are at the bottom of the file. Do not change the test runner.

// ImportScores imports every valid line of csv and reports every invalid one.
static ImportResult ImportScores(string csv)
{
    var result = new ImportResult();
    string[] lines = csv.Split('\n');
    for (int i = 1; i < lines.Length; i++)   // lines[0] is the header, line 1 of the file
    {
        string line = lines[i].Trim();
        if (line.Length == 0) continue;
        try
        {
            result.Rows.Add(ParseRow(line));
        }
        catch (FormatException ex)           // only the errors ParseRow reports; a bug still crashes
        {
            result.Errors.Add($"line {i + 1}: {ex.Message}");
        }
    }
    return result;
}

// ParseRow turns one line into a ScoreRow, or throws FormatException with the reason.
static ScoreRow ParseRow(string line)
{
    string[] f = line.Split(',');
    if (f.Length != 3)
        throw new FormatException($"expected 3 fields, got {f.Length}");
    if (f[0].Length == 0)
        throw new FormatException("missing student id");
    if (f[2] == "vắng")
        return new ScoreRow(f[0], f[1], null);
    if (!decimal.TryParse(f[2], NumberStyles.Float, CultureInfo.InvariantCulture, out decimal score))
        throw new FormatException($"score \"{f[2]}\" is not a number");
    if (score is < 0 or > 10)
        throw new FormatException($"score {f[2]} is out of range 0-10");
    return new ScoreRow(f[0], f[1], score);
}

// ---------------------------------------------------------------- test runner (do not change)
ImportResult imported = ImportScores(Console.In.ReadToEnd());
int absent = imported.Rows.Count(r => r.Score is null);
Console.WriteLine($"imported: {imported.Rows.Count - absent} scores, {absent} absent");
foreach (ScoreRow row in imported.Rows)
    Console.WriteLine($"{row.Student} {row.Class} {(row.Score is decimal s ? s.ToString(CultureInfo.InvariantCulture) : "absent")}");
Console.WriteLine($"errors: {imported.Errors.Count}");
foreach (string error in imported.Errors)
    Console.WriteLine(error);

// ---------------------------------------------------------------- types
// Score is null when the student was absent.
record ScoreRow(string Student, string Class, decimal? Score);

class ImportResult
{
    public List<ScoreRow> Rows { get; } = [];
    public List<string> Errors { get; } = [];
}
