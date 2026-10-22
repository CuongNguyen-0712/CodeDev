// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-csf-3-1",
    title: "Classes, records & equality",
    slug: { _type: "slug", current: "csharp-classes-records-equality" },
    description:
        "The October billing job removed duplicate enrollments with a HashSet, and still billed 37 families twice. Learn what a class gives you (fields, properties, constructors, primary constructors, init and required, the C# 14 field keyword), why two objects with the same data are not equal by default, how HashSet and Dictionary use GetHashCode and Equals together and why overriding only one of them breaks them, and how records give you value equality, ToString, with-expressions and deconstruction - plus the traps: lists inside records, mutable keys and case-sensitive strings.",
    estimatedTime: 21,

    scenario: {
        role: "Junior C# developer on the Sen Academy portal team, an after-school tutoring center in Hà Nội",
        problem:
            "Since October the front desk can sign students up directly, next to the website form. The billing job merges both lists and puts them through a HashSet to remove duplicates, a step that had been there for two years. On 1 November, 37 families who had signed up on both channels received two invoices for the same class, 66.6 million VND in total, and the accountant spent a week issuing refunds.",
    },

    content: [
        h2("1. The incident"),
        p("Until this term, every enrollment at Sen Academy came from the website form. In October the front desk at the Cầu Giấy campus got its own sign-up screen, so that parents who walk in can enroll on the spot. Some parents did both: they filled in the form at home, then confirmed at the desk when they dropped their child off."),
        p("The monthly billing job was ready for that, or so everyone thought. It loads the enrollments from both sources, adds them all to a `HashSet<Enrollment>` and bills each element once. A set never holds the same item twice - that is the point of a set. The step had been in the code for two years, written by a developer who has since left, and with a single source it had never had anything to remove."),
        p("On 1 November, Bùi Thị Hạnh, the accountant, got the first call: Nguyễn Gia Bảo's mother had two invoices for Toán 9, 1,800,000 VND each. By the evening there were 37 families on the list, 66.6 million VND billed twice, and Phạm Minh Tuấn, the team lead, asked you to find out why the set had not done its job."),

        h2("2. Reproduce it"),
        p("The billing job, cut down to four rows. `Enrollment` is the class from the code base:"),
        code("csharp", String.raw`
// October billing, cut down: two import sources, one HashSet to remove duplicates.
var fromWebsite = new List<Enrollment>
{
    new("HS-1024", "TOAN9-A", "2026-10"),
    new("HS-1025", "TOAN9-A", "2026-10"),
};
var fromFrontDesk = new List<Enrollment>
{
    new("HS-1024", "TOAN9-A", "2026-10"),   // Bảo's mother also signed him up at the desk
    new("HS-1026", "ANH7-B", "2026-10"),
};

var toBill = new HashSet<Enrollment>();
foreach (var e in fromWebsite.Concat(fromFrontDesk))
    toBill.Add(e);

Console.WriteLine($"rows: {fromWebsite.Count + fromFrontDesk.Count}, to bill: {toBill.Count}");
foreach (var e in toBill)
    Console.WriteLine($"{e.StudentId} {e.ClassCode} {e.Month}");

class Enrollment
{
    public string StudentId { get; }
    public string ClassCode { get; }
    public string Month { get; }

    public Enrollment(string studentId, string classCode, string month)
    {
        StudentId = studentId;
        ClassCode = classCode;
        Month = month;
    }
}`, "Billing.cs"),
        code("text", String.raw`
rows: 4, to bill: 4
HS-1024 TOAN9-A 2026-10
HS-1025 TOAN9-A 2026-10
HS-1024 TOAN9-A 2026-10
HS-1026 ANH7-B 2026-10`),
        p("Bảo is in the set twice. No exception, no warning: the set did exactly what it was asked to do. The question is what \"the same item\" means for a class, and the answer is not \"the same data\"."),

        h2("3. What a class is"),
        p("A **class** is a reference type (lesson 1-1): a variable of type `Enrollment` holds a reference to an object on the heap, and `new` creates a new object every time. The class above uses the everyday building blocks:"),
        bullets([
            "**Properties** like `public string StudentId { get; }` - a property looks like a field to the caller but is a pair of methods (`get`, and optionally `set` or `init`). Without `set`, it can only be assigned in the constructor: the object is read-only from outside.",
            "**A constructor**, `public Enrollment(...)`, which runs once when the object is created and is the only place that sets the read-only properties.",
            "**Encapsulation**: callers see properties and methods, not how the object stores its data. Fields - plain variables inside the object - are normally `private`.",
        ]),
        p("Since C# 12 a class can also have a **primary constructor**: the parameters go right after the class name, and the class body uses them directly. This is the same class in five lines instead of thirteen:"),
        code("csharp", String.raw`
class Enrollment(string studentId, string classCode, string month)
{
    public string StudentId { get; } = studentId;
    public string ClassCode { get; } = classCode;
    public string Month { get; } = month;
}`, "Enrollment.cs"),
        h3("Equality for a class is identity"),
        p("Every type inherits `Equals`, `GetHashCode` and `ToString` from `object`. For a class, the inherited versions are about **identity**: two references are equal only if they point to the same object. The data inside does not matter:"),
        code("csharp", String.raw`
var a = new Enrollment("HS-1024", "TOAN9-A", "2026-10");
var b = new Enrollment("HS-1024", "TOAN9-A", "2026-10");
Console.WriteLine(a == b);
Console.WriteLine(a.Equals(b));
Console.WriteLine(ReferenceEquals(a, b));
Console.WriteLine(a.GetHashCode() == b.GetHashCode());
Console.WriteLine(a);`, "Identity.cs"),
        code("text", String.raw`
False
False
False
False
Enrollment`),
        p("Two `new` expressions, two objects, so four times `False`. Even `ToString` only knows the type name. For most classes that is the right default: two `StudentAccount` objects for two different logins should not be \"equal\" because their balances happen to match. For data like an enrollment - a student, a class and a month - it is wrong."),

        h2("4. How HashSet decides \"already there\""),
        p("A `HashSet<T>` (and the keys of a `Dictionary<TKey, TValue>`) does not compare a new item with every item it holds. That would be slow. It works in two steps:"),
        numbered([
            "**`GetHashCode()`** turns the item into an `int`, and the set uses it to pick a **bucket**.",
            "**`Equals()`** compares the item only with the few items already in that bucket.",
        ]),
        p("That gives the one rule every type used as a key must follow: **if two objects are Equal, they must have the same hash code.** (Different objects may share a hash code; that only costs an extra `Equals` call.) The obvious repair - override `Equals` to compare the three properties - breaks exactly that rule:"),
        code("csharp", String.raw`
var a = new Enrollment("HS-1024", "TOAN9-A", "2026-10");
var b = new Enrollment("HS-1024", "TOAN9-A", "2026-10");
Console.WriteLine($"Equals: {a.Equals(b)}");
Console.WriteLine($"hash equal: {a.GetHashCode() == b.GetHashCode()}");
var set = new HashSet<Enrollment> { a, b };
Console.WriteLine($"set count: {set.Count}");
Console.WriteLine($"list contains: {new List<Enrollment> { a }.Contains(b)}");

class Enrollment(string studentId, string classCode, string month)
{
    public string StudentId { get; } = studentId;
    public string ClassCode { get; } = classCode;
    public string Month { get; } = month;
    public override bool Equals(object? obj) =>
        obj is Enrollment o && o.StudentId == StudentId && o.ClassCode == ClassCode && o.Month == Month;
}`, "HalfFix.cs"),
        code("text", String.raw`
HalfFix.cs(9,7): warning CS0659: 'Enrollment' overrides Object.Equals(object o) but does not override Object.GetHashCode()

Equals: True
hash equal: False
set count: 2
list contains: True`),
        p("`List.Contains` walks the whole list and calls `Equals`, so it finds Bảo. The set first looks at the hash code, which still comes from the object's identity, so `a` and `b` land in different buckets and `Equals` is never called. Code that half works like this is worse than code that does not work at all: a unit test with `List.Contains` passes, production with a `HashSet` fails. The compiler does warn (CS0659) - in a build log with a hundred other warnings."),
        p("The complete version overrides both methods, implements `IEquatable<T>` so that collections can call a typed `Equals` without casting, and combines the same three properties in both places:"),
        code("csharp", String.raw`
var a = new Enrollment("HS-1024", "TOAN9-A", "2026-10");
var b = new Enrollment("HS-1024", "TOAN9-A", "2026-10");
var set = new HashSet<Enrollment> { a, b };
Console.WriteLine($"Equals: {a.Equals(b)}, == {a == b}, set count: {set.Count}");

class Enrollment(string studentId, string classCode, string month) : IEquatable<Enrollment>
{
    public string StudentId { get; } = studentId;
    public string ClassCode { get; } = classCode;
    public string Month { get; } = month;

    public bool Equals(Enrollment? other) =>
        other is not null && StudentId == other.StudentId && ClassCode == other.ClassCode && Month == other.Month;
    public override bool Equals(object? obj) => Equals(obj as Enrollment);
    public override int GetHashCode() => HashCode.Combine(StudentId, ClassCode, Month);
}`, "FullFix.cs"),
        code("text", String.raw`
Equals: True, == False, set count: 1`),
        p("The set works now - and `==` still says `False`, because for classes `==` compares references unless the class also declares `operator ==` and `operator !=`. That is a lot of code to write by hand, and all of it has to be updated the day someone adds a property. C# has a type that writes it for you."),

        h2("5. Records: value equality for free"),
        p("A **record** is a class (or, as `record struct`, a struct) for which the compiler generates value-based members. The positional form declares the properties, the constructor and everything else in one line:"),
        code("csharp", String.raw`
var fromWebsite = new List<Enrollment>
{
    new("HS-1024", "TOAN9-A", "2026-10"),
    new("HS-1025", "TOAN9-A", "2026-10"),
};
var fromFrontDesk = new List<Enrollment>
{
    new("HS-1024", "TOAN9-A", "2026-10"),
    new("HS-1026", "ANH7-B", "2026-10"),
};
var toBill = new HashSet<Enrollment>(fromWebsite.Concat(fromFrontDesk));
Console.WriteLine($"rows: {fromWebsite.Count + fromFrontDesk.Count}, to bill: {toBill.Count}");
foreach (var e in toBill)
    Console.WriteLine(e);

record Enrollment(string StudentId, string ClassCode, string Month);`, "Billing.cs"),
        code("text", String.raw`
rows: 4, to bill: 3
Enrollment { StudentId = HS-1024, ClassCode = TOAN9-A, Month = 2026-10 }
Enrollment { StudentId = HS-1025, ClassCode = TOAN9-A, Month = 2026-10 }
Enrollment { StudentId = HS-1026, ClassCode = ANH7-B, Month = 2026-10 }`),
        p("Three invoice lines. For `record Enrollment(string StudentId, string ClassCode, string Month)` the compiler generates:"),
        bullets([
            "**Three public properties** with `get` and `init`, and a constructor that sets them.",
            "**`Equals`, `GetHashCode`, `==` and `!=`** that compare the type and every property, in step with each other - including properties added later.",
            "**`ToString()`** that prints the type and the properties, which makes logs readable for free.",
            "**`Deconstruct`**, so a record can be taken apart into variables, and support for **`with`-expressions**.",
        ]),
        image("class-vs-record-hashset", {
            alt: "Two panels side by side. Left, in red, class Enrollment (before): two objects, one from the website and one from the front desk, both holding HS-1024, TOAN9-A, 2026-10. Their hash codes come from the objects' identity and differ, so they land in different buckets of the HashSet; Equals is never called, Add returns true twice and Bảo is billed twice. Right, in green, record Enrollment (after): the same two objects get equal hash codes computed from the three values, so they land in the same bucket, HashSet asks Equals which returns true, the second Add returns false, and 4 rows become 3 enrollments to bill. A box at the bottom explains that GetHashCode picks the bucket and Equals compares only within it, that equal objects must have equal hash codes so you override both or neither or use a record, and that a property that is part of the key must not change while the object is in the set.",
            caption: "A HashSet only calls Equals for items in the same bucket. Without matching hash codes, equal data is never compared.",
        }),
        h3("with, deconstruction and record struct"),
        p("Records are meant to be immutable: the properties are `init`-only, so you change a record by making a modified copy with `with`:"),
        code("csharp", String.raw`
var bao = new Enrollment("HS-1024", "TOAN9-A", "2026-10");
var november = bao with { Month = "2026-11" };
Console.WriteLine(bao);
Console.WriteLine(november);
Console.WriteLine(bao == november);

var (student, classCode, month) = november;
Console.WriteLine($"{student} / {classCode} / {month}");

var p = new Payment("HS-1024", 1_800_000m);
var q = new Payment("HS-1024", 1_800_000m);
Console.WriteLine($"{p == q} {p}");

record Enrollment(string StudentId, string ClassCode, string Month);
readonly record struct Payment(string StudentId, decimal Amount);`, "With.cs"),
        code("text", String.raw`
Enrollment { StudentId = HS-1024, ClassCode = TOAN9-A, Month = 2026-10 }
Enrollment { StudentId = HS-1024, ClassCode = TOAN9-A, Month = 2026-11 }
False
HS-1024 / TOAN9-A / 2026-11
True Payment { StudentId = HS-1024, Amount = 1800000 }`),
        bullets([
            "**`bao with { Month = \"2026-11\" }`** copies every property and changes one. `bao` is unchanged: the October enrollment stays correct for October's report.",
            "**`var (student, classCode, month) = november;`** uses the generated `Deconstruct`, in the order of the positional parameters.",
            "**`readonly record struct`** is a value type with the same generated members: no heap allocation, copied on assignment like any struct (lesson 1-1). It suits small keys and values - a payment, a (class, term) pair. `readonly` makes its properties init-only like a record class; without it, a positional record struct has settable properties.",
        ]),
        p("Trying to change a record or an `init` property after construction does not compile, and `required` makes the compiler check that a property is set in every object initializer:"),
        code("csharp", String.raw`
var g = new Guardian { Phone = "0912 345 678" };
g.Name = "x";
var e = new Enrollment("HS-1024", "TOAN9-A", "2026-10");
e.Month = "2026-11";

class Guardian
{
    public required string Name { get; init; }
    public string? Phone { get; init; }
}
record Enrollment(string StudentId, string ClassCode, string Month);`, "Immutable.cs"),
        code("text", String.raw`
Immutable.cs(1,13): error CS9035: Required member 'Guardian.Name' must be set in the object initializer or attribute constructor.
Immutable.cs(2,1): error CS8852: Init-only property or indexer 'Guardian.Name' can only be assigned in an object initializer, or on 'this' or 'base' in an instance constructor or an 'init' accessor.
Immutable.cs(4,1): error CS8852: Init-only property or indexer 'Enrollment.Month' can only be assigned in an object initializer, or on 'this' or 'base' in an instance constructor or an 'init' accessor.`),
        challenge("chal_quiz_csf_311", "For the first question, remember that with copies property values: what is the value of a property that holds a List? For the second, think about which methods HashSet calls, and in which order."),

        h2("6. Classes that guard their data: the field keyword"),
        p("Records are for data. Classes are for objects with behaviour and rules - a student whose name must never be blank and is stored without double spaces, an account whose balance only changes through methods. A property with a body in its `set` accessor is where such rules live. Before C# 14 that meant declaring a private field by hand; C# 14 adds the **`field` keyword**, which refers to the property's compiler-generated backing field:"),
        code("csharp", String.raw`
var s = new Student("HS-1024", "  Nguyễn Gia Bảo ");
Console.WriteLine($"[{s.FullName}] {s.Id}");
s.FullName = "Nguyễn  Gia Bảo";
Console.WriteLine($"[{s.FullName}]");
try { s.FullName = "   "; }
catch (ArgumentException e) { Console.WriteLine(e.Message); }

class Student(string id, string fullName)
{
    public string Id { get; } = id;

    public string FullName
    {
        get;
        set
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(value);
            field = string.Join(' ', value.Split(' ', StringSplitOptions.RemoveEmptyEntries));
        }
    } = fullName;
}`, "Student.cs"),
        code("text", String.raw`
[  Nguyễn Gia Bảo ] HS-1024
[Nguyễn Gia Bảo]
The value cannot be an empty string or composed entirely of whitespace. (Parameter 'value')`),
        p("The setter works - the second line is clean, the blank name is rejected - but look at the first line: the name from the constructor kept its spaces. A **property initializer** (`= fullName` after the closing brace) writes the backing field directly; it does not run the setter. That is a real trap with validated properties. Assign in a constructor body instead, where `FullName = fullName` goes through the setter like any other assignment:"),
        code("csharp", String.raw`
var s = new Student("HS-1024", "  Nguyễn Gia Bảo ");
Console.WriteLine($"[{s.FullName}]");

class Student
{
    public string Id { get; }

    public string FullName
    {
        get;
        set
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(value);
            field = string.Join(' ', value.Split(' ', StringSplitOptions.RemoveEmptyEntries));
        }
    }

    public Student(string id, string fullName)
    {
        Id = id;
        FullName = fullName;   // goes through the setter
    }
}`, "Student.cs"),
        code("text", String.raw`
[Nguyễn Gia Bảo]`),

        h2("7. Traps that records do not remove"),
        h3("Collections inside a record"),
        p("The generated `Equals` compares each property with that type's own `Equals`. `string`, numbers, `DateOnly` and other records compare by value. `List<T>` and arrays do not override `Equals`, so they compare by **reference**:"),
        code("csharp", String.raw`
var a = new Family("Nguyễn", ["HS-1024", "HS-1031"]);
var b = new Family("Nguyễn", ["HS-1024", "HS-1031"]);
Console.WriteLine(a == b);
Console.WriteLine(a);
Console.WriteLine(a.Children.SequenceEqual(b.Children));
record Family(string Name, List<string> Children);`, "Family.cs"),
        code("text", String.raw`
False
Family { Name = Nguyễn, Children = System.Collections.Generic.List` + "`" + String.raw`1[System.String] }
True`),
        p("Two families with the same children are not equal, and `ToString` prints the list's type name. Keep collections out of records that you compare or use as keys, or write `Equals` yourself with `SequenceEqual`. And remember that `with` is a shallow copy: the copy's `Children` is the same list object."),
        h3("Mutable keys"),
        p("A record with `{ get; set; }` properties compiles fine - and becomes a time bomb as soon as it is a key. Its hash code changes with its data, but the set filed it under the old one:"),
        code("csharp", String.raw`
var set = new HashSet<Seat>();
var seat = new Seat { ClassCode = "TOAN9-A", Number = 12 };
set.Add(seat);
Console.WriteLine(set.Contains(seat));
seat.Number = 13;                       // the student moved to another seat
Console.WriteLine(set.Contains(seat));
Console.WriteLine(set.Contains(new Seat { ClassCode = "TOAN9-A", Number = 13 }));
Console.WriteLine(set.Count);
record Seat
{
    public required string ClassCode { get; set; }
    public int Number { get; set; }
}`, "Seat.cs"),
        code("text", String.raw`
True
False
False
1
`),
        p("The seat is in the set (`Count` is 1), yet the set cannot find it any more, not even with the same object. Keys must not change while they are in a set or a dictionary: use `init`, and make a new record with `with` instead."),
        h3("Strings compare exactly"),
        p("Record equality uses the default string equality: ordinal, every character, case-sensitive. And `decimal` compares by value, even when two values print differently:"),
        code("csharp", String.raw`
var x = new Enrollment("HS-1024", "TOAN9-A", "2026-10");
var y = new Enrollment("hs-1024", "TOAN9-A", "2026-10");
Console.WriteLine(x == y);
Console.WriteLine(new Score(8.5m) == new Score(8.50m));
Console.WriteLine($"{new Score(8.5m)} {new Score(8.50m)}");
record Enrollment(string StudentId, string ClassCode, string Month);
record Score(decimal Value);`, "Case.cs"),
        code("text", String.raw`
False
True
Score { Value = 8.5 } Score { Value = 8.50 }`),
        p("The front desk screen accepts `hs-1024` as typed. A record will not treat it as `HS-1024`: normalize the data (trim, upper-case) when you build the record, at the boundary where it enters your code. Do not try to compare \"loosely\" later."),

        h2("8. The fix"),
        p("The billing job now uses a record, normalizes the ids when the rows come in, and has the test that was missing: the same enrollment from both sources, once with a lower-case id and a stray space."),
        code("csharp", String.raw`
// Billing: one invoice line per enrollment, whichever source it came from.
static List<Enrollment> ToBill(IEnumerable<Enrollment> website, IEnumerable<Enrollment> frontDesk)
{
    var seen = new HashSet<Enrollment>();
    var result = new List<Enrollment>();
    foreach (var e in website.Concat(frontDesk))
    {
        var key = e with { StudentId = e.StudentId.Trim().ToUpperInvariant(), ClassCode = e.ClassCode.Trim().ToUpperInvariant() };
        if (seen.Add(key))          // false when an equal enrollment is already there
            result.Add(key);
    }
    return result;
}

List<Enrollment> website = [new("HS-1024", "TOAN9-A", "2026-10"), new("HS-1025", "TOAN9-A", "2026-10")];
List<Enrollment> frontDesk = [new("hs-1024 ", "TOAN9-A", "2026-10"), new("HS-1026", "ANH7-B", "2026-10")];

var bill = ToBill(website, frontDesk);
if (bill.Count != 3) throw new Exception($"expected 3 lines, got {bill.Count}");
if (!bill.Contains(new Enrollment("HS-1024", "TOAN9-A", "2026-10"))) throw new Exception("Bảo is missing");
foreach (var e in bill) Console.WriteLine(e);
Console.WriteLine("ok: 4 rows, 3 invoice lines");

record Enrollment(string StudentId, string ClassCode, string Month);`, "Billing.cs"),
        code("text", String.raw`
Enrollment { StudentId = HS-1024, ClassCode = TOAN9-A, Month = 2026-10 }
Enrollment { StudentId = HS-1025, ClassCode = TOAN9-A, Month = 2026-10 }
Enrollment { StudentId = HS-1026, ClassCode = ANH7-B, Month = 2026-10 }
ok: 4 rows, 3 invoice lines`),
        numbered([
            "**`record` instead of `class`**: equality, hash code and `ToString` come from the three values and stay in step when a property is added.",
            "**`HashSet.Add` returns `bool`**: `false` means \"an equal item is already there\", which lets the loop keep the first row of each duplicate and the original order. A `new HashSet<T>(rows)` would deduplicate too, but a set does not promise any order.",
            "**Normalization happens before the record is used as a key**, with `with`, so the rows from the website are untouched.",
            "**The test feeds the job duplicates from two sources.** The old job had no test with a duplicate in it - with one source there never was one.",
        ]),

        h2("9. Your turn"),
        p("Term averages have the same problem one level down. Test scores come from teachers typing them into the portal and from the online quiz system, and some tests arrive from both - in lower case, or as `8.50` instead of `8.5`. Build a record per row, remove the exact duplicates, and group what is left by a (class, term) record key. The test runner prints the counts and an average per class and term."),
        challenge("chal_coding_csf_312", "Normalize in ParseRow, so that equal rows build equal records. HashSet.Add tells you whether a row is new. For the groups, a readonly record struct makes a good Dictionary key, and TryGetValue avoids looking the key up twice."),

        h2("10. Pitfalls"),
        bullets([
            "**A `HashSet` or `Dictionary` key that is a plain class**: equality is identity, so equal data is never \"the same\". Use a record, or implement `IEquatable<T>`, `Equals` and `GetHashCode` together.",
            "**Overriding `Equals` without `GetHashCode`** (warning CS0659): `List.Contains` works, `HashSet` and `Dictionary` do not.",
            "**`==` on classes** compares references, even when `Equals` is overridden. Records generate `==`; classes do not.",
            "**Lists and arrays inside records** compare by reference, print as a type name, and are shared by `with` copies.",
            "**Keys that change** after they went into a set or dictionary can no longer be found. Keep keys immutable.",
            "**Unnormalized strings**: `\"hs-1024\"` and `\"HS-1024\"` are different keys. Normalize once, where the data comes in.",
            "**Property initializers bypass the setter**: `public string Name { get; set { ... field = ... } } = value;` stores `value` without validation.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Data that is compared, deduplicated or used as a key is a `record` (or a `readonly record struct` for small values).",
            "Classes that need custom equality implement `IEquatable<T>`, `Equals(object?)` and `GetHashCode` from the same properties, and the build treats CS0659 as an error.",
            "Records used as keys have only immutable members, and no collections.",
            "Ids, codes and other text keys are trimmed and normalized when the data enters the program.",
            "Properties with rules validate in `set` (with `field` in C# 14), and constructors assign through the property.",
            "Every deduplication step has a test with real duplicates in it.",
        ]),
        p("Next lesson: pattern matching and switch expressions. A sibling discount tier that no family could reach for a year, and a new kind of class that was free for two weeks."),
    ],
});
