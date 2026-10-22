using System.Globalization;

// Sen Academy - term score import.
//
// Teachers upload one line per student: id, name and one or more scores, separated by commas.
// Scores are written the way the upload template asks for: 0 to 10, with a dot for decimals (8.5).
// For every student the import writes two things:
//   - a row for the CSV export that the accounting and reporting tools read:
//       "ID,NAME,AVERAGE" with a dot for decimals and one decimal place (8.3)
//   - the text of the SMS to the guardian, in Vietnamese:
//       "NAME - điểm trung bình AVERAGE" with a Vietnamese decimal comma (8,3)
// A score that is not a number from 0 to 10 makes the whole line an error.
//
// The import worker now runs in a container image with Vietnamese settings, and the test runner
// does the same: CultureInfo.CurrentCulture is vi-VN. Since the move, scores like 8.5 are rejected
// and the CSV export has an extra column. Fix TryParseScore, CsvRow and SmsText so the output is
// right whatever the current culture is. Do not change the test runner.
//
// Example input:
//   HS-1024,Nguyễn Gia Bảo,8.5,7,9.5
//   HS-1027,Đỗ Mai Anh,8,vắng,9
// Expected output:
//   csv HS-1024,Nguyễn Gia Bảo,8.3
//   sms Nguyễn Gia Bảo - điểm trung bình 8,3
//   error line 2: bad score 'vắng'
//   exported 1, errors 1

// TryParseScore reads one score as written in the upload template (a dot for decimals) and
// accepts it only when it is between 0 and 10.
static bool TryParseScore(string text, out decimal score)
{
    return decimal.TryParse(text, out score) && score >= 0 && score <= 10;
}

// CsvRow is read by other programs: a dot for decimals, one decimal place.
static string CsvRow(string id, string name, decimal average)
{
    return string.Create(CultureInfo.InvariantCulture, $"{id},{name},{average:F1}");
}

// SmsText is read by parents: Vietnamese number format, one decimal place.
static string SmsText(string name, decimal average)
{
    return string.Create(CultureInfo.GetCultureInfo("vi-VN"), $"{name} - điểm trung bình {average:F1}");
}

// ---------------------------------------------------------------- test runner (do not change)
// The import worker's container image runs with Vietnamese settings (LANG=vi_VN.UTF-8).
CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("vi-VN");

int lineNumber = 0, exported = 0, errors = 0;
foreach (string line in Console.In.ReadToEnd().Split('\n'))
{
    lineNumber++;
    if (string.IsNullOrWhiteSpace(line)) continue;
    string[] f = line.Split(',', StringSplitOptions.TrimEntries);

    decimal sum = 0;
    string? bad = f.Length < 3 ? "" : null;
    for (int i = 2; i < f.Length && bad is null; i++)
    {
        if (TryParseScore(f[i], out decimal score)) sum += score;
        else bad = f[i];
    }
    if (bad is not null)
    {
        Console.WriteLine($"error line {lineNumber}: bad score '{bad}'");
        errors++;
        continue;
    }

    decimal average = Math.Round(sum / (f.Length - 2), 1, MidpointRounding.AwayFromZero);
    Console.WriteLine($"csv {CsvRow(f[0], f[1], average)}");
    Console.WriteLine($"sms {SmsText(f[1], average)}");
    exported++;
}
Console.WriteLine($"exported {exported}, errors {errors}");
