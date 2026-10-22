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
    try
    {
        for (int i = 1; i < lines.Length; i++)
        {
            string line = lines[i].Trim();
            if (line.Length == 0) continue;
            result.Rows.Add(ParseRow(line));
        }
    }
    catch (Exception ex)
    {
        result.Errors.Add($"import failed: {ex.Message}");
    }
    return result;
}

// ParseRow turns one line into a ScoreRow.
static ScoreRow ParseRow(string line)
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
