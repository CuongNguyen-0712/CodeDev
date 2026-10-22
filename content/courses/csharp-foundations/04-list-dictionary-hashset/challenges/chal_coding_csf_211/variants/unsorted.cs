// Sen Academy - class rosters with a waitlist, built from the sign-up log of the first day of term.
//
// Input (stdin), one command per line:
//   capacity COURSE N        COURSE has N seats (these lines come first, in any order)
//   enroll STUDENT COURSE    a sign-up
//   cancel STUDENT COURSE    a cancellation
//
// Rules:
//   - Student ids are case-insensitive: hs-1024 and HS-1024 are the same student. Print ids in upper case.
//   - A sign-up for a student who is already enrolled in or waiting for that course changes nothing
//     (parents double-click "Đăng ký").
//   - A sign-up gets a seat while the course has free seats; otherwise it goes to the END of the waitlist.
//   - Cancelling an enrolled student frees a seat: the FIRST student on the waitlist gets it and is
//     added to the end of the enrolled list. Cancelling a waiting student removes them from the waitlist.
//     Cancelling a student who is in neither list changes nothing.
//   - enroll / cancel for a course without a capacity line is ignored.
//
// Output: one line per course, courses sorted by code in ordinal order (string.CompareOrdinal):
//   COURSE E/N: S1, S2, ... | waitlist: W1, W2, ...
// E = enrolled students, listed in the order they got their seat; "-" for an empty list.
//
// Example input:
//   capacity ANH7-B 3
//   enroll HS-1024 ANH7-B
//   enroll HS-1024 ANH7-B
//   enroll HS-1026 ANH7-B
//   enroll HS-1027 ANH7-B
//   enroll HS-1028 ANH7-B
// Expected output:
//   ANH7-B 3/3: HS-1024, HS-1026, HS-1027 | waitlist: HS-1028
//
// Write Enroll, Cancel and Report. CourseRoster is at the bottom of the file.

// Enroll applies one sign-up.
static void Enroll(Dictionary<string, CourseRoster> courses, string student, string course)
{
    if (!courses.TryGetValue(course, out CourseRoster? roster))
        return;
    student = student.ToUpperInvariant();
    if (!roster.Members.Add(student))
        return; // already enrolled or waiting
    if (roster.Enrolled.Count < roster.Capacity)
        roster.Enrolled.Add(student);
    else
        roster.Waitlist.Add(student);
}

// Cancel applies one cancellation and promotes the first waiting student into a freed seat.
static void Cancel(Dictionary<string, CourseRoster> courses, string student, string course)
{
    if (!courses.TryGetValue(course, out CourseRoster? roster))
        return;
    student = student.ToUpperInvariant();
    if (!roster.Members.Remove(student))
        return;
    if (roster.Enrolled.Remove(student))
    {
        if (roster.Waitlist.Count > 0)
        {
            roster.Enrolled.Add(roster.Waitlist[0]);
            roster.Waitlist.RemoveAt(0);
        }
    }
    else
    {
        roster.Waitlist.Remove(student);
    }
}

// Report returns one line per course, sorted by course code (ordinal).
static List<string> Report(Dictionary<string, CourseRoster> courses)
{
    var codes = new List<string>(courses.Keys);
    var lines = new List<string>();
    foreach (string code in codes)
    {
        CourseRoster r = courses[code];
        lines.Add($"{code} {r.Enrolled.Count}/{r.Capacity}: {Names(r.Enrolled)} | waitlist: {Names(r.Waitlist)}");
    }
    return lines;
}

// Names joins ids with ", ", or returns "-" for an empty list.
static string Names(List<string> ids) => ids.Count == 0 ? "-" : string.Join(", ", ids);

// ---------------------------------------------------------------- test runner (do not change)
var courses = new Dictionary<string, CourseRoster>();
foreach (string line in Console.In.ReadToEnd().Split('\n'))
{
    string[] f = line.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    if (f.Length != 3) continue;
    switch (f[0])
    {
        case "capacity": courses[f[1]] = new CourseRoster { Capacity = int.Parse(f[2]) }; break;
        case "enroll": Enroll(courses, f[1], f[2]); break;
        case "cancel": Cancel(courses, f[1], f[2]); break;
    }
}
foreach (string reportLine in Report(courses))
    Console.WriteLine(reportLine);

// ---------------------------------------------------------------- types
class CourseRoster
{
    public int Capacity;
    public List<string> Enrolled = [];  // students with a seat, in the order they got it
    public List<string> Waitlist = [];  // students waiting, first come first served
    public HashSet<string> Members = new(StringComparer.OrdinalIgnoreCase); // everyone in Enrolled or Waitlist
}
