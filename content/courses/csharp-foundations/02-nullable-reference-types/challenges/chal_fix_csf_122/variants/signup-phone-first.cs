// Sen Academy - Sunday 20:00 class reminders.
//
// Every student's guardian gets one reminder for Monday's class: by SMS when there is a phone
// number, otherwise by email, otherwise the student is skipped. Since the signup form got an
// "email only" option, a guardian may have no phone, and older students may have no guardian on
// file at all. Guardians who changed their number through the Zalo form are in updatedPhones,
// and that number wins over the one from the signup form.
//
// Input (stdin), one record per line, fields separated by |:
//   student|ID|NAME|CLASS|GUARDIAN|PHONE|EMAIL   an empty GUARDIAN means no guardian on file;
//                                                an empty PHONE or EMAIL means none (null)
//   update|ID|PHONE                              a newer phone number for that student's guardian
//
// Rules for one student:
//   1. The phone is the updated phone if there is one, otherwise the guardian's phone.
//   2. A phone that is not null and not blank (whitespace only) -> "sms PHONE: MESSAGE",
//      PHONE without its spaces.
//   3. Otherwise a guardian email that is not null and not blank -> "email EMAIL: MESSAGE".
//   4. Otherwise -> "skip ID: no contact".
//   MESSAGE is "NAME (ID) has CLASS on Monday at 18:00".
// The test runner prints one line per student, in input order, then "sms N, email N, skipped N".
//
// Example input:
//   student|HS-1024|Nguyễn Gia Bảo|TOAN9-A|Nguyễn Văn Hùng|0912 345 678|
//   student|HS-1025|Trần Khánh Linh|TOAN9-A|Trần Thu Hà||thuha.tran@example.vn
// Expected output:
//   sms 0912345678: Nguyễn Gia Bảo (HS-1024) has TOAN9-A on Monday at 18:00
//   email thuha.tran@example.vn: Trần Khánh Linh (HS-1025) has TOAN9-A on Monday at 18:00
//   sms 1, email 1, skipped 0
//
// The bug: the job crashes with a NullReferenceException and nobody gets a reminder.
// Fix BuildReminder. The types Student and Guardian are at the bottom of the file.
// Do not change the test runner.

static string BuildReminder(Student student, Dictionary<string, string> updatedPhones)
{
    string message = $"{student.Name} ({student.Id}) has {student.ClassCode} on Monday at 18:00";
    string? phone = student.Guardian?.Phone ?? updatedPhones.GetValueOrDefault(student.Id);
    if (!string.IsNullOrWhiteSpace(phone))
        return $"sms {phone.Replace(" ", "")}: {message}";

    string? email = student.Guardian?.Email;
    if (!string.IsNullOrWhiteSpace(email))
        return $"email {email}: {message}";

    return $"skip {student.Id}: no contact";
}

// ---------------------------------------------------------------- test runner (do not change)
var students = new List<Student>();
var updatedPhones = new Dictionary<string, string>();
foreach (string line in Console.In.ReadToEnd().Split('\n'))
{
    string[] f = line.TrimEnd('\r').Split('|');
    if (f[0] == "student" && f.Length == 7)
    {
        students.Add(new Student
        {
            Id = f[1],
            Name = f[2],
            ClassCode = f[3],
            Guardian = f[4] == "" ? null : new Guardian { Name = f[4], Phone = OrNull(f[5]), Email = OrNull(f[6]) },
        });
    }
    else if (f[0] == "update" && f.Length == 3)
    {
        updatedPhones[f[1]] = f[2];
    }
}

int sms = 0, email = 0, skipped = 0;
foreach (Student student in students)
{
    string reminder = BuildReminder(student, updatedPhones);
    Console.WriteLine(reminder);
    if (reminder.StartsWith("sms ")) sms++;
    else if (reminder.StartsWith("email ")) email++;
    else skipped++;
}
Console.WriteLine($"sms {sms}, email {email}, skipped {skipped}");

static string? OrNull(string field) => field.Length == 0 ? null : field;

// ---------------------------------------------------------------- types
class Student
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string ClassCode { get; init; }
    public Guardian? Guardian { get; init; }   // null: no guardian on file
}

class Guardian
{
    public required string Name { get; init; }
    public string? Phone { get; init; }        // null: the guardian chose "email only"
    public string? Email { get; init; }
}
