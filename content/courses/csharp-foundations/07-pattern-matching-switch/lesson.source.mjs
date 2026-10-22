// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-csf-3-2",
    title: "Pattern matching & switch expressions",
    slug: { _type: "slug", current: "csharp-pattern-matching-switch-expressions" },
    description:
        "Online classes were billed 0 VND for two weeks, and while fixing that the team found a sibling discount tier no family had reached in a year. Both bugs compiled without a warning. Learn C# pattern matching - type, constant, relational, logical, property, positional and list patterns, var patterns and when guards - and switch expressions, where the compiler reports unreachable arms as errors and missing cases as warnings. Rewrite the tuition rules so that the next mistake of this kind does not build.",
    estimatedTime: 20,

    scenario: {
        role: "Junior C# developer on the Sen Academy portal team, an after-school tutoring center in Hà Nội",
        problem:
            "Sen Academy started online classes in October. For the first two weeks, every online enrollment produced an invoice of 0 VND, until a parent asked on Zalo whether the classes were really free. Looking at the tuition code, the team found a second bug: the 15% discount for families with three or more children, added a year ago, had never been applied to anyone.",
    },

    content: [
        h2("1. The incident"),
        p("Online classes were Sen Academy's big project for the new school year: the same teachers, a lower price, no traffic on the way to Cầu Giấy. On 1 October the enum in Sen.Portal got its third value, `ClassKind.Online`, the sign-up form got a new option, and 37 students enrolled in the first two weeks."),
        p("On 14 October a parent wrote to the academy's Zalo account: the invoice said 0 VND - were the online classes really free this month? Bùi Thị Hạnh, the accountant, checked: all 37 online invoices were 0 VND. Phạm Minh Tuấn opened the tuition code with you, found the cause in two minutes - and then saw something else in the same file."),
        p("The sibling discount has two tiers: 10% for a family with two children at the academy, 15% for three or more. The 15% tier was added in September last year. Đỗ Mai Anh's family has three children enrolled, and their invoices had always said 10%. So did the invoices of every other large family: the 15% branch had never run, not once in a year."),

        h2("2. Reproduce it"),
        p("The two rules as they were in production, with a few calls:"),
        code("csharp", String.raw`
// Sen Academy tuition rules, as they were in production (cut down).
Console.WriteLine($"Group, 8 sessions:   {MonthlyFee(ClassKind.Group, 8),10:N0} VND");
Console.WriteLine($"Private, 8 sessions: {MonthlyFee(ClassKind.Private, 8),10:N0} VND");
Console.WriteLine($"Online, 8 sessions:  {MonthlyFee(ClassKind.Online, 8),10:N0} VND");
for (int siblings = 1; siblings <= 4; siblings++)
    Console.WriteLine($"{siblings} sibling(s): {SiblingDiscountPercent(siblings)}%");

static decimal MonthlyFee(ClassKind kind, int sessions)
{
    switch (kind)
    {
        case ClassKind.Group:
            return 150_000m * sessions;
        case ClassKind.Private:
            return 400_000m * sessions;
        default:
            return 0m;   // "cannot happen"
    }
}

static int SiblingDiscountPercent(int siblings)
{
    if (siblings >= 2)
        return 10;
    else if (siblings >= 3)
        return 15;       // added in September 2025
    return 0;
}

enum ClassKind { Group, Private, Online }`, "Tuition.cs"),
        code("text", String.raw`
Group, 8 sessions:    1,200,000 VND
Private, 8 sessions:  3,200,000 VND
Online, 8 sessions:           0 VND
1 sibling(s): 0%
2 sibling(s): 10%
3 sibling(s): 10%
4 sibling(s): 10%`),
        bullets([
            "**The `default` branch** was written when there were two kinds, as a value for a case that \"cannot happen\". When `Online` was added, nothing told anyone that this `switch` needed a new `case`: the code compiled, and `Online` went to `default`.",
            "**The `if` chain** checks `siblings >= 2` first. For 3 siblings that is already true, so the function returns 10 and never reaches `siblings >= 3`. The author added the new tier below the old one, where it reads naturally - and where it can never run.",
        ]),
        p("Neither bug is exotic, and neither produced a warning. Both are about **which branch handles which values**, and that is exactly what the compiler can check for you - if you write the rules as patterns in a switch expression."),

        h2("3. Switch expressions"),
        p("A **switch expression** produces a value: the input, the keyword `switch`, then arms of the form `pattern => result`, separated by commas. Here are the two rules written that way, in the original order:"),
        code("csharp", String.raw`
static int SiblingDiscountPercent(int siblings) => siblings switch
{
    >= 2 => 10,
    >= 3 => 15,
    _ => 0,
};
Console.WriteLine(SiblingDiscountPercent(3));`, "Siblings.cs"),
        code("text", String.raw`
Siblings.cs(4,5): error CS8510: The pattern is unreachable. It has already been handled by a previous arm of the switch expression or it is impossible to match.`),
        p("The year-old bug does not compile. The compiler knows which values `>= 2` matches, sees that `>= 3` matches nothing new, and reports the arm as unreachable. Now the missing class kind:"),
        code("csharp", String.raw`
Console.WriteLine(MonthlyFee(ClassKind.Group, 8));
Console.WriteLine(MonthlyFee(ClassKind.Online, 8));

static decimal MonthlyFee(ClassKind kind, int sessions) => kind switch
{
    ClassKind.Group => 150_000m * sessions,
    ClassKind.Private => 400_000m * sessions,
};

enum ClassKind { Group, Private, Online }`, "Fee.cs"),
        code("text", String.raw`
Fee.cs(4,65): warning CS8509: The switch expression does not handle all possible values of its input type (it is not exhaustive). For example, the pattern 'ClassKind.Online' is not covered.

1200000
Unhandled exception. System.Runtime.CompilerServices.SwitchExpressionException: Non-exhaustive switch expression failed to match its input.
Unmatched value was Online.
   at <PrivateImplementationDetails>.ThrowSwitchExpressionException(Object unmatchedValue)
   at Program.<<Main>$>g__MonthlyFee|0_0(ClassKind kind, Int32 sessions)
   at Program.<Main>$(String[] args)`),
        p("Two layers of protection. At compile time, warning **CS8509** names the missing value. If the warning is ignored, the switch expression **throws** `SwitchExpressionException` for the unmatched input instead of returning a made-up value. A crashed billing job on 1 October is an incident of an hour; 37 invoices of 0 VND is an incident of two weeks."),
        h3("How a switch expression is evaluated"),
        bullets([
            "**Arms are tried from top to bottom**, and the first pattern that matches wins. Order matters: put the most specific patterns first.",
            "**An arm that can never be reached is an error** (CS8510), because some earlier arm already covers every value it matches.",
            "**Inputs that no arm matches give a warning** (CS8509) and an exception at run time.",
            "**`_` is the discard pattern**: it matches anything. As the last arm it makes the switch exhaustive - which also silences CS8509, so use it only when \"everything else\" really has one answer.",
        ]),
        image("if-chain-vs-switch", {
            alt: "Two panels. Left, in red, if/else and switch with default (before): if siblings >= 2 return 10, else if siblings >= 3 return 15, return 0 - for 3 siblings the first branch wins, so 15% is unreachable and nothing says so. Below, a switch statement with case ClassKind.Group returning 150_000m times n, case ClassKind.Private returning 400_000m times n and default returning 0m: when ClassKind.Online is added in October it compiles, lands in default and costs 0 VND. A red box: Build 0 errors, 0 warnings, both bugs ship, one lasts a year, one two weeks. Right, in green, switch expressions (after): siblings switch with >= 2 => 10, then >= 3 => 15 marked error CS8510, the pattern is unreachable, fix the order. Below, kind switch with arms for Group and Private only: warning CS8509 says ClassKind.Online is not covered, and at run time it throws SwitchExpressionException instead of returning 0 VND. A green box: most specific first, no silent default: >= 3 => 15, 2 => 10, _ => 0 and one arm per kind. A bottom box explains that arms are tried from top to bottom and the compiler knows which values each pattern matches: an unreachable arm is an error and an input no arm matches is a warning that can be made an error in the .csproj.",
            caption: "The if chain and the switch statement say what to do. The switch expression also says which values go where, so the compiler can check it.",
        }),

        h2("4. The patterns"),
        p("A **pattern** is a test against a value, written so that the compiler understands it. Patterns work in switch expressions, in `case` labels of switch statements and after `is`. This function uses most of them:"),
        code("csharp", String.raw`
object[] values = [8.5m, "HS-1024", 12, -3, null!, new Enrollment("HS-1025", ClassKind.Online, 8, 2)];
foreach (var v in values)
    Console.WriteLine(Describe(v));

static string Describe(object? value) => value switch
{
    null => "nothing",                                      // constant pattern
    decimal score when score is >= 0 and <= 10 => $"a score: {score}",  // type pattern + when
    string id when id.StartsWith("HS-") => $"a student id: {id}",
    int n and < 0 => $"a negative number: {n}",             // declaration + relational
    int n => $"a number: {n}",
    Enrollment { Kind: ClassKind.Online, Sessions: > 4 } e => $"an online enrollment of {e.StudentId}",  // property pattern
    _ => $"something else: {value}",                        // discard
};

record Enrollment(string StudentId, ClassKind Kind, int Sessions, int Siblings);
enum ClassKind { Group, Private, Online }`, "Patterns.cs"),
        code("text", String.raw`
a score: 8.5
a student id: HS-1024
a number: 12
a negative number: -3
nothing
an online enrollment of HS-1025`),
        bullets([
            "**Constant pattern**: `null`, `2`, `ClassKind.Online`, `\"HK1\"` - the value equals the constant.",
            "**Type and declaration patterns**: `decimal score` matches when the value is a `decimal` and puts it, already converted, into `score`. No cast, no second check.",
            "**Relational patterns**: `< 0`, `>= 12`, `<= 10` compare with a constant.",
            "**Logical patterns**: `and`, `or`, `not` combine patterns: `>= 0 and <= 10`, `ClassKind.Group or ClassKind.Online`, `not null`.",
            "**Property patterns**: `{ Kind: ClassKind.Online, Sessions: > 4 }` tests properties with nested patterns. Since C# 10, nested properties can be written with a dot: `{ Student.Grade: 9 }`.",
            "**`when` guards** add any boolean condition to an arm, for tests that are not patterns, like `id.StartsWith(\"HS-\")`. The compiler cannot reason about a guard, so an arm with `when` never makes a later arm unreachable.",
        ]),
        h3("Positional, tuple and list patterns"),
        p("Records with a positional declaration can be matched by position, like the deconstruction from lesson 3-1. A switch on a **tuple** combines several values in one rule table, and **list patterns** match arrays and lists by their elements:"),
        code("csharp", String.raw`
string[][] weeks = [[], ["KT15-1"], ["KT15-1", "KT15-2", "KT45-1"], ["KT45-1", "KT15-3"]];
foreach (var tests in weeks)
    Console.WriteLine(tests switch
    {
        [] => "no tests",
        [var only] => $"one test: {only}",
        ["KT45-1", ..] => "starts with the 45-minute test",
        [var first, .., var last] => $"{tests.Length} tests, {first} to {last}",
    });

var e = new Enrollment("HS-1027", ClassKind.Group, 12, 3);
if (e is (_, ClassKind.Group, >= 12, var siblings))
    Console.WriteLine($"a full month of group classes, {siblings} siblings");

Console.WriteLine((e.Kind, e.Siblings) switch
{
    (ClassKind.Private, _) => "no sibling discount for private lessons",
    (_, >= 3) => "15%",
    (_, 2) => "10%",
    _ => "0%",
});

record Enrollment(string StudentId, ClassKind Kind, int Sessions, int Siblings);
enum ClassKind { Group, Private, Online }`, "Shapes.cs"),
        code("text", String.raw`
no tests
one test: KT15-1
3 tests, KT15-1 to KT45-1
starts with the 45-minute test
a full month of group classes, 3 siblings
15%`),
        bullets([
            "**`[]`, `[var only]`, `[var first, .., var last]`**: an empty list, exactly one element, at least two elements. `..` is a **slice pattern** that matches any number of elements, at most once per list pattern.",
            "**`(_, ClassKind.Group, >= 12, var siblings)`** matches the record's four positional properties: anything, a group class, 12 or more sessions, and any sibling count, captured into `siblings` - the **var pattern** always matches and only gives the value a name.",
            "**`(e.Kind, e.Siblings) switch`** turns two inputs into one table: each row reads like a line in the price list.",
        ]),
        h3("Patterns in if and in switch statements"),
        p("`is` with a pattern is the short form for one test. A **switch statement** with patterns is useful when each case does several things instead of producing a value:"),
        code("csharp", String.raw`
string[] lines = ["HS-1024 8.5", "HS-1025 eleven", "HS-1026 10.5", "HS-1027"];
foreach (var line in lines)
{
    switch (line.Split(' '))
    {
        case [var id, var text] when decimal.TryParse(text, out var score) && score is >= 0 and <= 10:
            Console.WriteLine($"{id}: {score}");
            break;
        case [var id, _]:
            Console.WriteLine($"{id}: not a score between 0 and 10");
            break;
        case [var id]:
            Console.WriteLine($"{id}: no score");
            break;
    }
}
object input = 9.25m;
if (input is decimal d and > 9)
    Console.WriteLine($"top score {d}");
if (input is not string)
    Console.WriteLine("not text");`, "Statements.cs"),
        code("text", String.raw`
HS-1024: 8.5
HS-1025: not a score between 0 and 10
HS-1026: not a score between 0 and 10
HS-1027: no score
top score 9.25
not text`),
        p("`case [var id, var text] when ...` combines a list pattern with a guard, and `out var score` declares a variable that the case body can use. Note `input is not string`: `not` reads better than `!(input is string)`, and `x is not null` is the idiomatic null check from lesson 1-2."),

        h2("5. Enums are not closed"),
        p("One more detail before the fix. An enum is a named `int`, and any `int` can be cast to it - `(ClassKind)7` is a legal value that matches none of the names. So a switch expression with one arm per named value is still not exhaustive:"),
        code("csharp", String.raw`
static decimal PricePerSession(ClassKind kind) => kind switch
{
    ClassKind.Group => 150_000m,
    ClassKind.Private => 400_000m,
    ClassKind.Online => 100_000m,
};
Console.WriteLine(PricePerSession(ClassKind.Online));
enum ClassKind { Group, Private, Online }`, "Price.cs"),
        code("text", String.raw`
Price.cs(1,56): warning CS8524: The switch expression does not handle some values of its input type (it is not exhaustive) involving an unnamed enum value. For example, the pattern '(ClassKind)3' is not covered.`),
        p("This warning is different from CS8509: every named value is handled, and only values like `(ClassKind)3` - from a bad cast, a database column, a newer client - are not. The idiomatic last arm for that is a discard that **throws**, never one that returns a default price:"),
        code("csharp", String.raw`
_ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "no price for this class kind"),`),
        p("There is a trade-off. With a `_` arm the switch is exhaustive, so when someone adds `ClassKind.Camp` next year, this switch no longer warns: the forgotten kind becomes an exception at run time instead of a warning at build time. Many teams therefore leave out `_` in switches over enums they own, and make both warnings errors so that neither can be ignored:"),
        code("xml", String.raw`
<PropertyGroup>
  <WarningsAsErrors>$(WarningsAsErrors);CS8509;CS8524</WarningsAsErrors>
</PropertyGroup>`, "Sen.Portal.csproj"),

        h2("6. The fix"),
        p("Both rules are now switch expressions, ordered from the most specific case to the least, with a test that checks every tier and every class kind:"),
        code("csharp", String.raw`
// The new rules, with the tests the old ones never had.
static int SiblingDiscountPercent(int siblings) => siblings switch
{
    >= 3 => 15,
    2 => 10,
    _ => 0,
};

static decimal PricePerSession(ClassKind kind) => kind switch
{
    ClassKind.Group => 150_000m,
    ClassKind.Private => 400_000m,
    ClassKind.Online => 100_000m,
    _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "no price for this class kind"),
};

int[] expectedDiscount = [0, 0, 10, 15, 15];
for (int s = 1; s <= 4; s++)
    if (SiblingDiscountPercent(s) != expectedDiscount[s])
        throw new Exception($"{s} siblings: {SiblingDiscountPercent(s)}%");
foreach (var kind in Enum.GetValues<ClassKind>())
    if (PricePerSession(kind) <= 0)
        throw new Exception($"{kind} is free");
Console.WriteLine("ok: 4 sibling tiers, every class kind has a price");

enum ClassKind { Group, Private, Online }`, "Tuition.cs"),
        code("text", String.raw`
ok: 4 sibling tiers, every class kind has a price`),
        numbered([
            "**`>= 3` comes before `2`.** Written the other way round (`>= 2` first), the compiler would reject the switch with CS8510. Writing `2` instead of `>= 2` also makes each arm say exactly which values it handles.",
            "**No arm returns a made-up price.** An unknown kind throws; a new named kind shows up as CS8509 on every switch that misses it.",
            "**The test loops over `Enum.GetValues<ClassKind>()`**, so it covers class kinds that do not exist yet: the day `Camp` is added without a price, the test fails.",
            "**The academy refunded nothing and billed the 37 online students late**, with an apology; the large families got the 5% difference for the last year as a credit. The code change was 14 lines.",
        ]),

        h2("7. Your turn"),
        p("The full tuition rules have more than two inputs: a base price per class kind (now with holiday camps at a flat price), a volume discount that depends on the kind and the number of sessions, the sibling discount, a cap on the total discount, and enrollments with no sessions that are not billed at all. Write them as switch expressions with property and relational patterns. The test runner reads one enrollment per line and prints each bill."),
        challenge("chal_coding_csf_321", "One switch expression per rule keeps each rule readable: e.Kind switch for the base price, and switches on e itself with property patterns like { Kind: ClassKind.Group or ClassKind.Online, Sessions: >= 12 } for the discounts. Check the order of the sibling tiers, the exact thresholds (12 and 8 sessions count), the cap, and which rules do not apply to Camp."),

        h2("8. Pitfalls"),
        bullets([
            "**`if`/`else if` chains with overlapping conditions**: the first true condition wins, and a later, more specific one may never run. In a switch expression, the compiler reports it (CS8510).",
            "**`default:` or `_ =>` returning a \"safe\" value**: 0 VND, an empty string, `false`. It turns a missing case into wrong data. Throw instead, or leave the arm out and let CS8509 tell you.",
            "**Ignoring CS8509 and CS8524**: the warnings name the missing value. Make them errors for enums you own.",
            "**Relying on a `when` guard for coverage**: the compiler does not look inside guards, so an arm with `when` does not count towards exhaustiveness.",
            "**Order of arms**: specific before general - `>= 3` before `2` before `_`, `{ Kind: Online, Sessions: >= 12 }` before `{ Kind: Online }`.",
            "**Enums from outside the program**: a value read from a database or a request can be any `int`. Validate with `Enum.IsDefined` or `Enum.TryParse` at the boundary.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Rules that map inputs to values (prices, discounts, ranks, statuses) are switch expressions, one table per rule.",
            "Arms go from the most specific pattern to the least specific.",
            "No arm returns a placeholder value for \"cannot happen\"; unknown values throw.",
            "CS8509 and CS8524 are errors in the project file.",
            "Tests loop over `Enum.GetValues<T>()` and over every boundary (11, 12, 13 sessions; 1, 2, 3, 4 siblings).",
            "Type checks use patterns (`value is decimal score`) instead of a check followed by a cast.",
        ]),
        p("Next lesson: exceptions, TryParse and guard clauses. One word in a score column stopped the nightly import of 2,000 attendance rows - and the quick fix that followed silently gave students a score of 0."),
    ],
});
