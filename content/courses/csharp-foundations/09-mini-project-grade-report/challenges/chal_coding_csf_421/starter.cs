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
// Example input:
//   student,name,class,component,score
//   HS-1024,Nguyễn Gia Bảo,TOAN9-A,hw,8.5
//   HS-1024,Nguyễn Gia Bảo,TOAN9-A,mid,8
//   HS-1024,Nguyễn Gia Bảo,TOAN9-A,final,9
//   HS-1027,Đỗ Mai Anh,TOAN9-A,hw,9
//   HS-1027,Đỗ Mai Anh,TOAN9-A,midterm,8
// Expected output:
//   TOAN9-A: students 2, class average 8.6
//     8.6 Giỏi Nguyễn Gia Bảo (HS-1024)
//     incomplete Đỗ Mai Anh (HS-1027): missing mid, final
//     ranks: Giỏi 1, Khá 0, Trung bình 0, Yếu 0
//   rejected: 1
//     line 6: unknown component "midterm"
//
// Write BuildReport and the helpers it needs - the lesson's TermReport has most of the pieces.
// The types are at the bottom of the file.

// BuildReport returns the whole report for csv, every line ending in a newline.
static string BuildReport(string csv)
{
    var report = new StringBuilder();
    // TODO: parse every line (keep the rejected ones with their line numbers), keep the latest
    // score per student, class and component, then write one block per class and the rejected lines.
    return report.ToString();
}

// Rank returns the Vietnamese ranking of a rounded average.
static string Rank(decimal average)
{
    // TODO
    return "";
}

// ---------------------------------------------------------------- test runner (do not change)
CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("vi-VN");   // the Long Biên server
Console.Write(BuildReport(Console.In.ReadToEnd()));

// ---------------------------------------------------------------- types
// One accepted line of scores.csv; Line is its line number in the file.
record ScoreLine(int Line, string Student, string Name, string Class, string Component, decimal Score);

// What a correction replaces: the same student, class and component.
readonly record struct ScoreKey(string Student, string Class, string Component);
