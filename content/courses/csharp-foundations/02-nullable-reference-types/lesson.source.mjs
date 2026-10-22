// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-csf-1-2",
    title: "Nullable reference types & the NullReferenceException",
    slug: { _type: "slug", current: "csharp-nullable-reference-types-null-reference-exception" },
    description:
        "The signup form got an \"email only\" option on Friday. On Sunday at 20:00 the class-reminder job reached the first guardian without a phone, threw a NullReferenceException and stopped: about 400 parents got no reminder for Monday. The compiler had warned about that exact line for months. Learn what string and string? really mean, how the compiler's flow analysis follows null through your code, the warnings CS8600, CS8602, CS8603 and CS8618, the operators ?., ??, ??= and C# 14's null-conditional assignment, why the ! operator only moves the crash, how required members, ArgumentNullException.ThrowIfNull and TryGetValue keep null out, and how to make the build fail instead of the Sunday job.",
    estimatedTime: 20,

    scenario: {
        role: "Junior C# developer on the Sen Academy portal team, an after-school tutoring center in Hà Nội",
        problem:
            "Every Sunday at 20:00 a job in Sen.Portal sends each guardian an SMS about Monday's class. After the signup form started accepting guardians with only an email address, the job crashed with a NullReferenceException on the first such guardian. Nobody after that student got a reminder, 37 students missed Monday's TOAN9 and ANH7 classes, and the warning that pointed at the line had been in the build log since the property was changed.",
    },

    content: [
        h2("1. The incident"),
        p("Sen.Portal sends every guardian a reminder on Sunday evening: \"Nguyễn Gia Bảo has TOAN9-A on Monday at 18:00\". For two years every guardian registered with a phone number, and the job sent the reminder by SMS."),
        p("On Friday the signup form got a new option that many parents had asked for: \"contact me by email only\". The developer who added it changed `Guardian.Phone` from `string` to `string?`, because a phone number is now optional, and added an `Email` property. The form worked, the tests for the form passed, and the change was merged."),
        p("On Sunday at 20:00 the reminder job sent 212 SMS messages and then stopped. The 213th student was Trần Khánh Linh, whose mother, Trần Thu Hà, had registered on Saturday with an email address only. The job threw a `NullReferenceException`, the scheduler logged it, and nobody looked at the log until Monday evening, when cô Ngô Thanh Hương asked why a third of her class had not come. About 400 guardians got no reminder."),
        p("Đặng Quốc Việt from ops found the line from the stack trace. Phạm Minh Tuấn, the team lead, found something worse in the build output: a warning for that exact line, `CS8602`, had appeared on Friday - one more among 127 warnings that nobody read."),

        h2("2. Reproduce it"),
        p("The job, cut down to three students. `Guardian.Phone` is `string?` since Friday, the loop is the code from two years ago:"),
        code("csharp", String.raw`
// Sen.Portal - Sunday 20:00 class reminders, cut down to three students.
var students = new List<Student>
{
    new() { Id = "HS-1024", Name = "Nguyễn Gia Bảo", ClassCode = "TOAN9-A",
            Guardian = new() { Name = "Nguyễn Văn Hùng", Phone = "0912 345 678" } },
    new() { Id = "HS-1025", Name = "Trần Khánh Linh", ClassCode = "TOAN9-A",
            Guardian = new() { Name = "Trần Thu Hà", Email = "thuha.tran@example.vn" } },
    new() { Id = "HS-1026", Name = "Lê Hoàng Nam", ClassCode = "TOAN9-A",
            Guardian = new() { Name = "Lê Minh Châu", Phone = "0987 654 321" } },
};

foreach (var student in students)
{
    string phone = student.Guardian.Phone.Replace(" ", "");
    Console.WriteLine($"SMS {phone}: {student.Name} has {student.ClassCode} on Monday at 18:00");
}

class Student
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string ClassCode { get; set; } = "";
    public Guardian Guardian { get; set; } = new();
}

class Guardian
{
    public string Name { get; set; } = "";
    public string? Phone { get; set; }
    public string? Email { get; set; }
}`, "Program.cs"),
        code("text", String.raw`
$ dotnet build
/work/src/Reminders/Program.cs(14,20): warning CS8602: Dereference of a possibly null reference. [/work/src/Reminders/Reminders.csproj]
    1 Warning(s)
    0 Error(s)
$ dotnet run
SMS 0912345678: Nguyễn Gia Bảo has TOAN9-A on Monday at 18:00
Unhandled exception. System.NullReferenceException: Object reference not set to an instance of an object.
   at Program.<Main>$(String[] args) in /work/src/Reminders/Program.cs:line 14`),
        p("Bảo's guardian gets the SMS. Linh's guardian has no phone, so `student.Guardian.Phone` is `null`, and calling `.Replace` on `null` throws. The exception ends the loop, so Nam's guardian - who does have a phone - gets nothing either. One missing value stopped the whole job."),
        p("Look at the build output: the compiler said exactly this, at line 14, column 20 - the start of `student.Guardian.Phone`, the value that may be null. `Build succeeded` with one warning, so the change went out. To understand why it was only a warning, and why it appeared on Friday and not before, you need to know what `string?` means."),

        h2("3. string and string?"),
        p("Every reference type variable - `string`, `Student`, `List<int>`, arrays - can hold a reference to an object or `null`, which means \"no object\". Calling a method or reading a property through `null` throws `NullReferenceException`. For 20 years that was simply how C# worked, and the exception was the most common crash in .NET programs."),
        p("C# 8 added **nullable reference types**: with `<Nullable>enable</Nullable>` in the project (the default for new projects since .NET 6), the type says whether null is allowed:"),
        bullets([
            "**`string`** means \"never null\". The compiler warns when you might put null into it.",
            "**`string?`** means \"may be null\". The compiler warns when you use it without checking.",
        ]),
        p("This is a compile-time feature only. `string` and `string?` are the same type at run time, nothing is checked when the program runs, and the warnings do not stop the build. The four warnings you will meet most often:"),
        code("csharp", String.raw`
string name = "Nguyễn Gia Bảo";   // never null
string? phone = null;             // may be null: the ? is part of the declaration

string copy = phone;              // CS8600
int digits = phone.Length;        // CS8602

static string FindPhone(string studentId)
{
    return null;                  // CS8603
}

class Guardian
{
    public string Name { get; set; }   // CS8618
    public string? Phone { get; set; }
}`, "Program.cs"),
        code("text", String.raw`
Program.cs(4,15): warning CS8600: Converting null literal or possible null value to non-nullable type.
Program.cs(5,14): warning CS8602: Dereference of a possibly null reference.
Program.cs(9,12): warning CS8603: Possible null reference return.
Program.cs(14,19): warning CS8618: Non-nullable property 'Name' must contain a non-null value when exiting constructor. Consider adding the 'required' modifier or declaring the property as nullable.`),
        bullets([
            "**CS8600**: a value that may be null goes into a variable that promises not null. The problem is not here yet, but the promise is now false.",
            "**CS8602**: you use (dereference) something that may be null: `.Length`, `.Replace(...)`, an indexer. This is the line that throws.",
            "**CS8603**: a method declared to return `string` may return null. Either return something else or declare it `string?` so callers must check.",
            "**CS8618**: a non-nullable property or field is never set by a constructor, so a new object starts with null in it.",
        ]),
        p("Now the incident is plain. Before Friday, `Phone` was a `string`, and the loop was correct as far as the compiler could tell. Friday's change made `Phone` honest - `string?` - and the compiler immediately pointed at every place that used it without a check. The fix should have been to handle the missing phone there; instead the warning was added to the pile."),
        image("null-paths", {
            alt: "Diagram. At the top left, a Guardian object from the signup form with Name Trần Thu Hà, Phone null highlighted in red, and Email thuha.tran@..., declared as string? Phone, may be null. An arrow goes to a yellow box: compile time, a warning in the build log, Program.cs(14,20): warning CS8602: Dereference of a possibly null reference. A red arrow goes to a red box: run time, Sunday 20:00, the job stops at the first email-only guardian, student.Guardian.Phone.Replace throws NullReferenceException. Below, four ways to answer the warning: g?.Phone stops at the first null and gives null instead of throwing; phone ?? email uses a fallback when the left side is null; if (x is not null) uses flow analysis so x is not null inside the if, and the same after !IsNullOrWhiteSpace(x); g.Phone! in red says trust me, not null - the warning disappears, the crash does not, it just moves. A green box at the bottom: make the build fail instead of the Sunday job with Nullable enable plus WarningsAsErrors nullable, so CS8602 becomes error CS8602 and the change cannot be merged until null is handled.",
            caption: "The warning and the exception point at the same character. Only one of them arrives before the parents are affected.",
        }),

        h2("4. Flow analysis: checking once is enough"),
        p("The compiler does not just look at declarations. It follows each variable through the method and tracks whether it can be null at each point. After a check, it knows:"),
        code("csharp", String.raw`
string? phone = GetPhone("HS-1025");

if (phone is null)
{
    Console.WriteLine("no phone");
    return;
}
// From here on the compiler knows phone is not null: no warning.
Console.WriteLine(phone.Replace(" ", ""));

static string? GetPhone(string id) => id == "HS-1024" ? "0912 345 678" : null;`, "Flow.cs"),
        code("text", String.raw`
no phone`),
        p("Use `is null` and `is not null` for these checks. They always compare the reference itself, while `==` can be redefined by a type (you will see that with records in lesson 6)."),
        p("Many library methods tell the compiler what they check, with attributes like `[NotNullWhen(false)]`. `string.IsNullOrWhiteSpace(s)` is one of them: when it returns false, `s` is not null. That makes it the check you usually want for text from a form, where an empty or blank string is just as useless as null:"),
        code("csharp", String.raw`
string?[] phones = ["0912 345 678", null, "   "];

foreach (string? phone in phones)
{
    if (string.IsNullOrWhiteSpace(phone))
    {
        Console.WriteLine("missing");
        continue;
    }
    Console.WriteLine(phone.Replace(" ", ""));   // no warning: IsNullOrWhiteSpace returned false
}`, "Blank.cs"),
        code("text", String.raw`
0912345678
missing
missing`),

        h2("5. The null operators"),
        p("C# has four operators for values that may be null. Here they are on Linh, whose guardian has only an email, and Phan Anh Khoa, a grade 12 student who registered himself and has no guardian on file:"),
        code("csharp", String.raw`
var ha = new Guardian { Name = "Trần Thu Hà", Email = "thuha.tran@example.vn" };
var linh = new Student { Id = "HS-1025", Name = "Trần Khánh Linh", Guardian = ha };
var khoa = new Student { Id = "HS-1030", Name = "Phan Anh Khoa" };   // no guardian on file

// ?.  stops at the first null and gives null
string? linhPhone = linh.Guardian?.Phone;
string? khoaEmail = khoa.Guardian?.Email;
int? phoneLength = linh.Guardian?.Phone?.Length;
Console.WriteLine($"[{linhPhone}] [{khoaEmail}] [{phoneLength}]");

// ??  replaces null with a fallback
Console.WriteLine(linh.Guardian?.Phone ?? linh.Guardian?.Email ?? "no contact");
Console.WriteLine(khoa.Guardian?.Phone ?? khoa.Guardian?.Email ?? "no contact");

// ??=  assigns only when the left side is null
ha.Phone ??= "0904 111 222";
ha.Phone ??= "0999 999 999";
Console.WriteLine(ha.Phone);

// C# 14: ?. on the left of an assignment - nothing happens when Guardian is null
khoa.Guardian?.Email = "khoa.phan@example.vn";
linh.Guardian?.Email = "ha.tran@example.vn";
Console.WriteLine($"{khoa.Guardian?.Email ?? "(no guardian)"} | {ha.Email}");

class Student
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public Guardian? Guardian { get; set; }
}

class Guardian
{
    public string Name { get; set; } = "";
    public string? Phone { get; set; }
    public string? Email { get; set; }
}`, "Operators.cs"),
        code("text", String.raw`
[] [] []
thuha.tran@example.vn
no contact
0904 111 222
(no guardian) | ha.tran@example.vn`),
        bullets([
            "**`a?.B`** reads `B` only when `a` is not null; otherwise the whole expression is null. Chains stop at the first null: `linh.Guardian?.Phone?.Length` is null because `Phone` is. Note the type: `Length` is an `int`, so `?.Length` is an `int?` - a number that may be missing.",
            "**`a ?? b`** is `a` when `a` is not null, otherwise `b`. It chains from left to right, which makes \"phone, else email, else a default\" one line.",
            "**`a ??= b`** assigns `b` only when `a` is null. The second `??=` did nothing, because `Phone` already had a value.",
            "**`a?.B = value`** is new in C# 14: the assignment happens only when `a` is not null, and the right side is not even evaluated otherwise. Before C# 14 you wrote `if (a is not null) a.B = value;`.",
            "**Interpolating null** prints nothing, which is why the first line shows `[] [] []`. In a message to a parent, an empty phone number is a bug that looks like a value - check before you format.",
        ]),
        challenge("chal_quiz_csf_121", "For the first question, evaluate each ?. and ?? from left to right and ask at every step: is the thing on the left null? For the second, separate what the compiler checks (warnings, flow analysis) from what happens at run time."),

        h2("6. The ! operator moves the crash"),
        p("There is one more operator, and it is the one that makes the warning go away fastest. `x!` - the **null-forgiving operator** - tells the compiler \"I know this is not null\". It changes nothing at run time:"),
        code("csharp", String.raw`
var linh = new Guardian { Name = "Trần Thu Hà", Email = "thuha.tran@example.vn" };

string phone = linh.Phone!.Replace(" ", "");   // no warning any more...
Console.WriteLine(phone);

class Guardian
{
    public string Name { get; set; } = "";
    public string? Phone { get; set; }
    public string? Email { get; set; }
}`, "Program.cs"),
        code("text", String.raw`
Unhandled exception. System.NullReferenceException: Object reference not set to an instance of an object.
   at Program.<Main>$(String[] args) in /work/src/Reminders/Program.cs:line 3`),
        p("Same exception, no warning. On a team that cleans up a pile of warnings by adding `!` everywhere, the build log becomes clean and the crashes stay exactly where they were - now without a hint in the build output. Use `!` only when you know something the compiler cannot, and write down why in a comment. \"The warning was annoying\" is not such a reason."),

        h2("7. Keeping null out at the source"),
        p("Checking for null everywhere is tiring. It is better to make null impossible where a value is required, so that only the properties that are really optional need checks."),
        h3("required members"),
        p("A property marked `required` must be set when the object is created. Forgetting it is a compile **error**, not a warning:"),
        code("csharp", String.raw`
var bao = new Student { Id = "HS-1024" };   // forgot Name

class Student
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public Guardian? Guardian { get; init; }
}
class Guardian { public required string Name { get; init; } }`, "Program.cs"),
        code("text", String.raw`
Program.cs(1,15): error CS9035: Required member 'Student.Name' must be set in the object initializer or attribute constructor.`),
        p("`required` also answers CS8618: a required `string` property no longer needs a fake default like `= \"\"`. `init` instead of `set` means the property can be set only while the object is created - a student's id should not change halfway through the reminder job. The model now says exactly what the signup form allows: every student has an id and a name, the guardian is optional, and so are the guardian's phone and email."),
        h3("Guard clauses at the boundary"),
        p("Nullable annotations are only promises. Code compiled without them, JSON from an API, a `null!` someone wrote in a test - null can still arrive. At the edge of your code - the public methods other code calls - check the arguments that must not be null, and fail immediately with a clear message:"),
        code("csharp", String.raw`
Console.WriteLine(Reminder("Nguyễn Gia Bảo", "TOAN9-A"));
Console.WriteLine(Reminder(null!, "TOAN9-A"));

static string Reminder(string studentName, string classCode)
{
    ArgumentNullException.ThrowIfNull(studentName);
    ArgumentException.ThrowIfNullOrWhiteSpace(classCode);
    return $"{studentName} has {classCode} on Monday at 18:00";
}`, "Program.cs"),
        code("text", String.raw`
Nguyễn Gia Bảo has TOAN9-A on Monday at 18:00
Unhandled exception. System.ArgumentNullException: Value cannot be null. (Parameter 'studentName')
   at System.ArgumentNullException.Throw(String paramName)
   at System.ArgumentNullException.ThrowIfNull(Object argument, String paramName)
   at Program.<<Main>$>g__Reminder|0_0(String studentName, String classCode) in /work/src/Reminders/Program.cs:line 6
   at Program.<Main>$(String[] args) in /work/src/Reminders/Program.cs:line 2`),
        p("`ArgumentNullException` with the parameter's name is a much better error than a `NullReferenceException` ten lines deeper: it says which argument was wrong and that the **caller** made the mistake. The parameter name comes for free - the compiler fills it in."),
        h3("Dictionaries: TryGetValue"),
        p("Looking up a key that may be missing is another everyday source of null. `phones[id]` throws `KeyNotFoundException` for a missing key, and `phones.GetValueOrDefault(id)` returns `null` - its return type is `string?`, so the compiler makes you check. `TryGetValue` does both in one step, and flow analysis understands it:"),
        code("csharp", String.raw`
var phones = new Dictionary<string, string>
{
    ["HS-1024"] = "0912 345 678",
    ["HS-1026"] = "0987 654 321",
};

foreach (var id in new[] { "HS-1024", "HS-1025" })
{
    if (phones.TryGetValue(id, out var phone))
        Console.WriteLine($"{id}: {phone.Replace(" ", "")}");   // phone is string here, not string?
    else
        Console.WriteLine($"{id}: no phone");
}`, "Lookup.cs"),
        code("text", String.raw`
HS-1024: 0912345678
HS-1025: no phone`),
        callout("info", "Collections: lesson 4",
            "Dictionary, List and HashSet get a lesson of their own in module 2. For now remember the three ways to read a key: the indexer throws for a missing key, GetValueOrDefault returns null (or a default you pass), and TryGetValue returns a bool and gives you the value only when it exists."),

        h2("8. Make the build fail instead of the job"),
        p("A warning that nobody reads is not a safety net. The project file can turn every nullable warning into an error, so a change like Friday's cannot be merged until every use of the new `string?` is handled:"),
        code("xml", String.raw`
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <WarningsAsErrors>nullable</WarningsAsErrors>
  </PropertyGroup>

</Project>`, "Reminders.csproj"),
        code("text", String.raw`
$ dotnet build
/work/src/Reminders/Program.cs(14,20): error CS8602: Dereference of a possibly null reference. [/work/src/Reminders/Reminders.csproj]

Build FAILED.

/work/src/Reminders/Program.cs(14,20): error CS8602: Dereference of a possibly null reference. [/work/src/Reminders/Reminders.csproj]
    0 Warning(s)
    1 Error(s)`),
        p("`nullable` is a shortcut for all the nullable warnings (CS8600, CS8602, CS8603, CS8618 and the others). On a new project, add it on day one. On an old project with hundreds of warnings, add it and fix them file by file - or at least make sure the number of warnings can only go down. `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` goes further and turns every warning into an error."),

        h2("9. The fix"),
        p("Tuấn's fix handles the cases the model allows - no guardian, no phone, no email - and makes the model say which values are optional:"),
        code("csharp", String.raw`
// Sen.Portal - Sunday 20:00 class reminders, after the fix.
var students = new List<Student>
{
    new() { Id = "HS-1024", Name = "Nguyễn Gia Bảo", ClassCode = "TOAN9-A",
            Guardian = new() { Name = "Nguyễn Văn Hùng", Phone = "0912 345 678" } },
    new() { Id = "HS-1025", Name = "Trần Khánh Linh", ClassCode = "TOAN9-A",
            Guardian = new() { Name = "Trần Thu Hà", Email = "thuha.tran@example.vn" } },
    new() { Id = "HS-1026", Name = "Lê Hoàng Nam", ClassCode = "TOAN9-A",
            Guardian = new() { Name = "Lê Minh Châu", Phone = "0987 654 321" } },
    new() { Id = "HS-1030", Name = "Phan Anh Khoa", ClassCode = "TOAN9-A" },
};

foreach (var student in students)
    Console.WriteLine(Reminder(student) ?? $"SKIP {student.Id}: no phone or email on file");

static string? Reminder(Student student)
{
    ArgumentNullException.ThrowIfNull(student);
    string message = $"{student.Name} has {student.ClassCode} on Monday at 18:00";

    if (student.Guardian is not { } guardian)
        return null;
    if (!string.IsNullOrWhiteSpace(guardian.Phone))
        return $"SMS {guardian.Phone.Replace(" ", "")}: {message}";
    if (!string.IsNullOrWhiteSpace(guardian.Email))
        return $"EMAIL {guardian.Email}: {message}";
    return null;
}

class Student
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string ClassCode { get; init; }
    public Guardian? Guardian { get; init; }
}

class Guardian
{
    public required string Name { get; init; }
    public string? Phone { get; init; }
    public string? Email { get; init; }
}`, "Program.cs"),
        code("text", String.raw`
$ dotnet build
Build succeeded.
    0 Warning(s)
    0 Error(s)
$ dotnet run
SMS 0912345678: Nguyễn Gia Bảo has TOAN9-A on Monday at 18:00
EMAIL thuha.tran@example.vn: Trần Khánh Linh has TOAN9-A on Monday at 18:00
SMS 0987654321: Lê Hoàng Nam has TOAN9-A on Monday at 18:00
SKIP HS-1030: no phone or email on file`),
        numbered([
            "**The model tells the truth.** `required` for what every student has, `?` for what may be missing. The compiler then checks every place that reads an optional value.",
            "**`student.Guardian is not { } guardian`** is a pattern: it checks that `Guardian` is not null and puts it into a new variable `guardian` that the compiler knows is not null. You will meet patterns properly in lesson 7; `if (student.Guardian is null) return null; var guardian = student.Guardian;` does the same.",
            "**`IsNullOrWhiteSpace`** catches null and the blank phone numbers that old records contain, and flow analysis knows the value is not null afterwards.",
            "**The method returns `string?`**: \"no reminder\" is a normal result here, not an error, and the caller decides what to do with it. One student without contact data no longer stops the job for everyone after them.",
            "**`<WarningsAsErrors>nullable</WarningsAsErrors>`** went into Sen.Portal's project files the same week, and the 127 warnings were fixed in two days. Nine of them were real bugs of the same kind.",
        ]),

        h2("10. Your turn"),
        p("The real job has one more source of phone numbers: guardians who change their number through Sen Academy's Zalo form are stored in a dictionary, and that number wins over the one from the signup form. Some students - adults in the grade 12 evening class - have no guardian at all. The function that picks the channel still crashes. The test runner reads the students and the phone updates, then prints one reminder per student and the totals."),
        challenge("chal_fix_csf_122", "Every use of Guardian, Phone, Email or the dictionary result without a check is a place where null can arrive (a real build warns CS8602 or CS8600 on each of them; the runner does not show warnings). Ask, for each one, where the null comes from (a missing guardian, a missing phone, a missing key in the dictionary) and decide what the rules say should happen. Blank strings count as missing, and an updated phone must win even when the signup form has one."),

        h2("11. Pitfalls"),
        bullets([
            "**Ignoring nullable warnings**: CS8602 is the compiler pointing at a line that can throw `NullReferenceException`. A pile of 127 warnings hides the one that matters - make them errors.",
            "**Silencing with `!`**: the warning disappears, the crash stays. Every `!` needs a reason the compiler cannot see.",
            "**Assuming `string?` checks anything at run time**: annotations are for the compiler only. Data from JSON, a database or old code can still be null where the type says it cannot - guard public entry points with `ArgumentNullException.ThrowIfNull`.",
            "**Checking `!= null` but not blank**: a form field can hold `\"\"` or `\"   \"`. For text, `string.IsNullOrWhiteSpace` is usually the check you mean.",
            "**Fake defaults to silence CS8618**: `public string Phone { get; set; } = \"\";` hides the fact that a phone is optional. Use `required` for values that must exist and `?` for values that may not.",
            "**Letting one bad record stop a batch job**: when one student has no contact data, skip and report that student, do not crash the loop for everyone after them.",
        ]),

        h2("12. Checklist"),
        bullets([
            "The project has `<Nullable>enable</Nullable>` and `<WarningsAsErrors>nullable</WarningsAsErrors>`.",
            "Every property is either `required`, set by a constructor, or declared nullable with `?`.",
            "Values that may be null are checked with `is null`, `is not null`, `?.`, `??` or `IsNullOrWhiteSpace` before they are used.",
            "There is no `!` without a comment that explains why the value cannot be null.",
            "Public methods check their required arguments with `ArgumentNullException.ThrowIfNull` and `ArgumentException.ThrowIfNullOrWhiteSpace`.",
            "Dictionary lookups that may miss use `TryGetValue` or `GetValueOrDefault`, never the indexer.",
        ]),
        p("Next lesson: strings and culture. The import worker moved to a new container image with Vietnamese settings, and a score of 8.5 became 85."),
    ],
});
