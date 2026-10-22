// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-csf-1-1",
    title: "Types, var & value vs reference",
    slug: { _type: "slug", current: "csharp-types-var-value-vs-reference" },
    description:
        "One student's 50% scholarship gave the whole Toán 9 class half-price tuition for October. Learn the difference between value types and reference types in C# (what an assignment really copies, and why the same line of code behaves differently for a class and a struct), how var infers a static type, the built-in numeric types and their traps - int overflow that wraps silently, integer division, double rounding errors - and why money is decimal and rounded with an explicit MidpointRounding.",
    estimatedTime: 20,

    scenario: {
        role: "Junior C# developer on the Sen Academy portal team, an after-school tutoring center in Hà Nội",
        problem:
            "The October tuition run billed all 41 students of Toán 9 at 900,000 VND instead of 1,800,000. Only one of them, Trần Khánh Linh, has a 50% scholarship. The accountant found the gap of 36 million VND two weeks later, and the November run would have repeated it.",
    },

    content: [
        h2("1. The incident"),
        p("Sen Academy bills tuition once a month. A nightly job in Sen.Portal, the academy's ASP.NET Core service on .NET 10, walks through every class, starts each student's invoice from the class's default tuition plan and applies the student's discount: a scholarship, a sibling discount, a promotion."),
        p("Until September, discounts lived in a separate table and were applied at the very end. In September a refactoring moved the discount onto the plan itself, so that an invoice could carry everything it needs. The code review took five minutes: the change was small and every test passed."),
        p("On 14 October, Bùi Thị Hạnh, the accountant, compared the bank transfers with the invoices. All 41 students of Toán 9 had paid exactly 900,000 VND. The class costs 1,800,000 a month, and only Trần Khánh Linh has a 50% scholarship. The other classes were fine, because Linh is the only scholarship student this term. Phạm Minh Tuấn, the team lead, asked you to find out why before the November run."),

        h2("2. Reproduce it"),
        p("The billing job, cut down to one class and three students. `TuitionPlans.Math9` is the class's default plan:"),
        code("csharp", String.raw`
// Billing.cs - cut down to one class and three students.
var students = new[] { "Nguyễn Gia Bảo", "Trần Khánh Linh", "Lê Hoàng Nam" };
var invoices = new List<(string Student, TuitionPlan Plan)>();

foreach (var name in students)
{
    var plan = TuitionPlans.Math9;      // start from the class's default plan
    if (name == "Trần Khánh Linh")
        plan.DiscountPercent = 50;      // Linh has a 50% scholarship
    invoices.Add((name, plan));
}

foreach (var (student, plan) in invoices)
{
    int amount = plan.MonthlyFee * (100 - plan.DiscountPercent) / 100;
    Console.WriteLine($"{student,-16} {plan.Course}  {amount,9} VND");
}

class TuitionPlan
{
    public string Course = "";
    public int MonthlyFee;
    public int DiscountPercent;
}

static class TuitionPlans
{
    public static readonly TuitionPlan Math9 = new() { Course = "Toán 9", MonthlyFee = 1_800_000 };
}`, "Billing.cs"),
        code("text", String.raw`
$ dotnet run
Nguyễn Gia Bảo   Toán 9     900000 VND
Trần Khánh Linh  Toán 9     900000 VND
Lê Hoàng Nam     Toán 9     900000 VND`),
        p("Every student pays half, including Bảo, whose invoice was created **before** Linh's. The program uses C#'s **top-level statements**: the statements at the top of the file are the program's `Main`, and type declarations such as `class TuitionPlan` must come after them. It compiles without a single warning. `static readonly` did not help either: it stops anyone from replacing `Math9` with another plan, not from changing the plan it refers to."),
        p("To understand why Bảo's invoice changed after it was created, you need the most important distinction in C#'s type system."),

        h2("3. Value types and reference types"),
        p("Every type in C# is either a **value type** or a **reference type**, and the difference decides what `=` copies:"),
        bullets([
            "**A variable of a value type holds the value itself.** `int`, `long`, `double`, `decimal`, `bool`, `char`, enums, tuples and every `struct` are value types. Assigning one variable to another copies the whole value, field by field.",
            "**A variable of a reference type holds a reference** - an address - to an object that lives on the managed heap. Classes, arrays, `string`, `List<T>` and `Dictionary<TKey, TValue>` are reference types. Assigning copies the reference: afterwards two variables point to **one** object.",
        ]),
        code("csharp", String.raw`
int a = 1_800_000;
int b = a;              // int is a value type: b gets its own copy
b = 900_000;
Console.WriteLine($"int:    a = {a}, b = {b}");

var p1 = new PlanStruct { Fee = 1_800_000 };
var p2 = p1;            // struct: all fields are copied
p2.Fee = 900_000;
Console.WriteLine($"struct: p1 = {p1.Fee}, p2 = {p2.Fee}");

var c1 = new PlanClass { Fee = 1_800_000 };
var c2 = c1;            // class: only the reference is copied
c2.Fee = 900_000;
Console.WriteLine($"class:  c1 = {c1.Fee}, c2 = {c2.Fee}, same object: {ReferenceEquals(c1, c2)}");

int[] fees = [1_800_000, 1_500_000];
int[] alias = fees;     // arrays are reference types too
alias[0] = 0;
Console.WriteLine($"array:  fees[0] = {fees[0]}");

string course = "Toán 9";
string other = course;
other += " (nâng cao)"; // strings never change: += builds a new string
Console.WriteLine($"string: course = {course}, other = {other}");

struct PlanStruct { public int Fee; }
class PlanClass { public int Fee; }`, "Copies.cs"),
        code("text", String.raw`
int:    a = 1800000, b = 900000
struct: p1 = 1800000, p2 = 900000
class:  c1 = 900000, c2 = 900000, same object: True
array:  fees[0] = 0
string: course = Toán 9, other = Toán 9 (nâng cao)`),
        bullets([
            "**The struct and the class have the same field and the same code.** Only the keyword differs, and so does the result.",
            "**`ReferenceEquals(c1, c2)`** asks whether two references point to the same object. For `c1` and `c2` they do.",
            "**`string` is a reference type that behaves like a value**, because a string object can never change. `+=` creates a new string and points `other` at it; `course` still points to the old one.",
            "**`int[] fees = [1_800_000, 1_500_000];`** is a collection expression (C# 12). The underscores are digit separators: they make big VND amounts readable and mean nothing to the compiler.",
        ]),
        p("Now read the billing loop again. `TuitionPlan` is a class, so `var plan = TuitionPlans.Math9;` copies a reference to the **one** default plan object. Linh's line writes `DiscountPercent = 50` into that object. Bảo's invoice, Linh's invoice, Nam's invoice and `TuitionPlans.Math9` all refer to it, so all of them now show 50%. The invoices are only printed after the loop, which is why even Bảo's comes out at half price - and the default plan keeps its 50% for the rest of the process, so November would have been wrong too."),
        image("class-vs-struct-plan", {
            alt: "Two panels side by side. Left, in red, class TuitionPlan, a reference type: four variables named Math9, Bảo's plan, Linh's plan and Nam's plan all have arrows to one TuitionPlan object holding Course Toán 9, Fee 1800000 and Discount 50. A note says Linh's scholarship writes into the shared object, so every invoice and the default now say 50%, and the result line reads Bảo 900000, Linh 900000, Nam 900000. Right, in green, struct TuitionPlan, a value type: four separate boxes, each holding its own copy of Toán 9 and 1800000; Math9, Bảo's plan and Nam's plan have discount 0 and Linh's plan has discount 50. The result line reads Bảo 1800000, Linh 900000, Nam 1800000. Notes at the bottom list the value types (int, long, decimal, double, bool, char, enums, structs and tuples) and the reference types (classes, arrays, string, List and Dictionary), and give the rule: before you change an object you got from somewhere else, ask who else holds a reference to it.",
            caption: "Same code, different keyword: a class shares one object, a struct copies the value.",
        }),
        h3("Passing to a method"),
        p("A method parameter is just another variable, so the same rule applies when you call a method. A method that receives a struct gets a copy, and its changes are lost unless the parameter is declared `ref`:"),
        code("csharp", String.raw`
var plan = new TuitionPlan { Course = "Toán 9", MonthlyFee = 1_800_000 };
GiveScholarship(plan);
Console.WriteLine(plan.DiscountPercent);
GiveScholarshipRef(ref plan);
Console.WriteLine(plan.DiscountPercent);

static void GiveScholarship(TuitionPlan p) => p.DiscountPercent = 50;          // changes a copy
static void GiveScholarshipRef(ref TuitionPlan p) => p.DiscountPercent = 50;
struct TuitionPlan { public string Course; public long MonthlyFee; public decimal DiscountPercent; }`, "Params.cs"),
        code("text", String.raw`
0
50`),
        p("With a class, both methods would change the caller's object: the method receives a copy of the **reference**, which still points to the same object. That is why a method that takes a `List<T>` can add items the caller sees."),
        h3("== on references"),
        p("For classes, `==` compares references unless the class says otherwise. Two plans with the same fields are still two objects:"),
        code("csharp", String.raw`
var x = new PlanClass { Fee = 1_800_000 };
var y = new PlanClass { Fee = 1_800_000 };
Console.WriteLine(x == y);
Console.WriteLine(x.Fee == y.Fee);
var s1 = "Toán 9";
var s2 = string.Concat("Toán", " ", "9");
Console.WriteLine(s1 == s2);
Console.WriteLine(ReferenceEquals(s1, s2));
var m1 = new PlanStruct { Fee = 1 }; var m2 = new PlanStruct { Fee = 1 };
Console.WriteLine(m1.Equals(m2));
struct PlanStruct { public int Fee; }
class PlanClass { public int Fee; }`, "Equality.cs"),
        code("text", String.raw`
False
True
True
False
True`),
        p("`string` overrides `==` to compare the characters, so `s1 == s2` is true even though they are two different objects. Structs compare their fields with `Equals`. Lesson 6 comes back to equality with records, which give classes value-based equality in one keyword."),
        challenge("chal_quiz_csf_111", "For the first question, decide for each type whether var b = a copies the value or only a reference. For the second, evaluate each expression with its types in mind: what type is 9 / 12, and which rounding does Math.Round use when nobody tells it?"),

        h2("4. var and the built-in types"),
        p("`var` asks the compiler to infer the variable's type from the expression on the right. It does **not** make the variable dynamic: the type is fixed at compile time, exactly as if you had written it out."),
        code("csharp", String.raw`
var count = 41;                 // int
var fee = 1_800_000;            // int
long yearlyLong = 2_400L * 1_800_000;
var ratio = 0.5;                // double
var price = 1_800_000m;         // decimal (the m suffix)
var name = "Toán 9";            // string
Console.WriteLine($"{count.GetType().Name} {fee.GetType().Name} {ratio.GetType().Name} {price.GetType().Name} {name.GetType().Name}");
Console.WriteLine($"int.MaxValue = {int.MaxValue}");
Console.WriteLine($"2400 students x 1800000 as int:  {unchecked(2_400 * fee)}");
Console.WriteLine($"2400 students x 1800000 as long: {yearlyLong}");
int students = 2_400;
try { Console.WriteLine(checked(students * fee)); }
catch (OverflowException e) { Console.WriteLine($"checked: {e.Message}"); }`, "Types.cs"),
        code("text", String.raw`
Int32 Int32 Double Decimal String
int.MaxValue = 2147483647
2400 students x 1800000 as int:  25032704
2400 students x 1800000 as long: 4320000000
checked: Arithmetic operation resulted in an overflow.`),
        bullets([
            "**Integer literals are `int`** unless they do not fit, or you add a suffix: `L` for `long`, `m` for `decimal`. Literals with a decimal point are `double`; `f` makes a `float`.",
            "**`int` is 32 bits**, up to 2,147,483,647 - about 2.1 billion VND, which is the academy's tuition for 1,193 students for one month. The yearly revenue of 2,400 students does not fit, and by default C# does **not** report it: the multiplication wraps around and gives 25,032,704. Use `long` (64 bits) for totals.",
            "**`checked(...)`** turns a silent wrap into an `OverflowException`. With two constants, `2_400 * 1_800_000`, the compiler computes the value itself and refuses to build: error CS0220, \"The operation overflows at compile time in checked mode\".",
            "**`int.MaxValue`, `long.MaxValue` and `decimal.MaxValue`** are there when you need the limits.",
        ]),
        p("Because the type is fixed, a `var` declared from an integer stays an integer:"),
        code("csharp", String.raw`
var total = 0;
total += 0.5;`, "Var.cs"),
        code("text", String.raw`
main.cs(2,1): error CS0266: Cannot implicitly convert type 'double' to 'int'. An explicit conversion exists (are you missing a cast?)`),
        p("Use `var` when the type is obvious from the right-hand side (`var invoices = new List<Invoice>();`) and write the type when it is not, or when the literal would pick the wrong one: `decimal discount = 0;` is clearer than `var discount = 0m;`. For a `new` expression whose type is already written on the left, C# 9's **target-typed `new`** removes the repetition: `TuitionPlan plan = new() { ... };`."),

        h2("5. Integer division, double and decimal"),
        p("Two more number bugs from the academy's backlog. The attendance page showed 0% for students who had missed a single session, and the online-payment page sometimes asked for 1 VND less than the invoice. Both are about choosing the right type for the arithmetic:"),
        code("csharp", String.raw`
int attended = 11, sessions = 12;
Console.WriteLine(attended / sessions * 100);           // int / int
Console.WriteLine(attended * 100 / sessions);           // still int: 1100 / 12
Console.WriteLine(100.0 * attended / sessions);         // double
Console.WriteLine((double)attended / sessions * 100);

Console.WriteLine(0.1 + 0.2);
Console.WriteLine(0.1 + 0.2 == 0.3);
Console.WriteLine(0.1m + 0.2m == 0.3m);
double sumD = 0; decimal sumM = 0;
for (int i = 0; i < 10; i++) { sumD += 0.1; sumM += 0.1m; }
Console.WriteLine($"{sumD} {sumM}");

Console.WriteLine(Math.Round(2.5m));
Console.WriteLine(Math.Round(3.5m));
Console.WriteLine(Math.Round(2.5m, MidpointRounding.AwayFromZero));
Console.WriteLine(Math.Round(1_250_002.5m, MidpointRounding.AwayFromZero));
decimal fee = 1_800_000m;
decimal afterDiscount = fee * (100 - 12.5m) / 100;
Console.WriteLine(afterDiscount);
Console.WriteLine((int)7.9);
Console.WriteLine(7 / 2 + " " + 7 % 2 + " " + -7 / 2);`, "Numbers.cs"),
        code("text", String.raw`
0
91
91.66666666666667
91.66666666666666
0.30000000000000004
False
True
0.9999999999999999 1.0
2
4
3
1250003
1575000.0
7
3 1 -3`),
        bullets([
            "**`int / int` is integer division**: the result is truncated toward zero, so 11 / 12 is 0 and the attendance page showed 0%. Make one operand a `double` **before** dividing: `100.0 * attended / sessions`. Casting the result, `(double)(attended / sessions)`, is too late.",
            "**`double` is binary floating point**: fast and fine for measurements, but 0.1 has no exact binary representation, so ten times 0.1 is 0.9999999999999999. Never compare doubles with `==`.",
            "**`decimal` is base-10**, with 28-29 significant digits. 0.1m is exactly 0.1, so sums of money come out right. It is slower than `double`, which does not matter for invoices. **Money is `decimal`**, and so are percentages applied to money.",
            "**`Math.Round` uses banker's rounding by default** (`MidpointRounding.ToEven`): a value exactly halfway goes to the nearest **even** number, so 2.5 becomes 2 and 3.5 becomes 4. That is statistically fair, but it is not what an accountant expects. Say what you mean: `MidpointRounding.AwayFromZero`.",
            "**Casting to an integer truncates**: `(int)7.9` is 7. Round first, then cast.",
        ]),
        callout("warning", "Decide the rounding rule with the people who own the money",
            "Sen Academy rounds every VND amount to the nearest đồng and rounds a half up (away from zero), because that is what the accounting software does. Other businesses round down, round per line or per invoice, or follow a tax rule. Write the rule down, put it in one function, and test the x.5 cases explicitly."),

        h2("6. The fix"),
        p("Tuấn's first question in the review was: who else holds a reference to this plan? Since the answer is \"every invoice in the class and the default itself\", the plan must not be shared. The smallest change that makes the bug impossible is to make `TuitionPlan` a struct, so that `var plan = TuitionPlans.Math9;` copies it. While you are in there, the money moves to `long` and `decimal` and the rounding becomes explicit:"),
        code("csharp", String.raw`
// Billing.cs after the fix: TuitionPlan is a struct, money is decimal.
var students = new[] { "Nguyễn Gia Bảo", "Trần Khánh Linh", "Lê Hoàng Nam" };
var invoices = new List<(string Student, TuitionPlan Plan)>();

foreach (var name in students)
{
    var plan = TuitionPlans.Math9;      // a struct: plan is a copy of the default
    if (name == "Trần Khánh Linh")
        plan.DiscountPercent = 50;
    invoices.Add((name, plan));
}

foreach (var (student, plan) in invoices)
    Console.WriteLine($"{student,-16} {plan.Course}  {AmountDue(plan),9} VND");
Console.WriteLine($"default plan: {TuitionPlans.Math9.DiscountPercent}% discount");

static long AmountDue(TuitionPlan plan)
{
    decimal exact = plan.MonthlyFee * (100 - plan.DiscountPercent) / 100;
    return (long)Math.Round(exact, MidpointRounding.AwayFromZero);
}

struct TuitionPlan
{
    public string Course;
    public long MonthlyFee;
    public decimal DiscountPercent;
}

static class TuitionPlans
{
    public static readonly TuitionPlan Math9 = new() { Course = "Toán 9", MonthlyFee = 1_800_000 };
}`, "Billing.cs"),
        code("text", String.raw`
Nguyễn Gia Bảo   Toán 9    1800000 VND
Trần Khánh Linh  Toán 9     900000 VND
Lê Hoàng Nam     Toán 9    1800000 VND
default plan: 0% discount`),
        numbered([
            "**`struct TuitionPlan`**: every `var plan = TuitionPlans.Math9;` is now a copy, and the scholarship changes Linh's copy only.",
            "**`static readonly` now protects the default for real.** For a struct, the fields are part of the value, so `TuitionPlans.Math9.DiscountPercent = 50;` no longer compiles: error CS1650, \"Fields of static readonly field 'TuitionPlans.Math9' cannot be assigned to\".",
            "**`AmountDue` is the one place where money is computed**, in `decimal`, with the accountant's rounding rule written out.",
            "**`MonthlyFee` is a `long`**, so the yearly totals that are built from it cannot wrap.",
        ]),
        p("Copies come with their own trap. Items of a `List<TuitionPlan>` are returned as copies too, so `plans[0].DiscountPercent = 50;` would change a temporary copy - the compiler refuses it with error CS1612, \"Cannot modify the return value of 'List<TuitionPlan>.this[int]' because it is not a variable\". Keep structs small, and prefer to create a new value over changing one in place."),
        callout("info", "Is a struct the long-term design?",
            "For a hotfix, yes: one keyword, and the bug cannot come back. In the follow-up, Tuấn moved the discount off the plan and onto the invoice, because a discount belongs to a student, not to a class. Lesson 6 shows the tool most .NET teams use for small data types like this one: records, which copy with a with-expression and compare by value."),

        h2("7. Your turn"),
        p("The billing job needs the function that turns a fee and a discount into the amount on the invoice, plus the totals for the accountant's report. Write it with the right types: `decimal` for the computation, the accountant's rounding rule, and a total that a whole school cannot overflow."),
        challenge("chal_coding_csf_112", "Compute the exact amount in decimal first: monthlyFee * (100 - discountPercent) / 100. Then round with Math.Round and the MidpointRounding the accountant uses, and only then cast to long. For the total and the average, check what type your running sum has, and whether the division happens in decimal or in integers."),

        h2("8. Pitfalls"),
        bullets([
            "**Changing an object you got from somewhere else**: with a class, `var x = shared;` is not a copy. Ask who else holds the reference, or work on a copy.",
            "**Assuming `readonly` means immutable**: `static readonly` on a class field stops reassignment of the reference, not changes to the object.",
            "**`int` for totals**: tuition for a whole school does not fit in 2.1 billion, and the overflow is silent. Use `long`, or `checked` where a wrap would be a bug.",
            "**Integer division**: `a / b * 100` with two ints is 0 for any `a < b`. Convert before dividing.",
            "**`double` for money**: rounding errors add up, and `==` fails. Use `decimal`.",
            "**`Math.Round` without a `MidpointRounding`**: 2.5 becomes 2. State the rule.",
            "**Mutable structs in collections**: `list[i].Field = x` does not compile, and copies of a struct drift apart silently. Keep structs small and treat them as values.",
        ]),

        h2("9. Checklist"),
        bullets([
            "For every type you write, you know whether it is a value type or a reference type, and what `=` copies.",
            "Shared defaults are values, or are copied before anyone changes them.",
            "`var` is used where the type is obvious; literals carry the right suffix (`L`, `m`).",
            "Money is `decimal`, totals are `long` or `decimal`, and rounding names its `MidpointRounding`.",
            "Divisions that need a fraction convert an operand before dividing.",
            "Tests include the x.5 cases and a total larger than `int.MaxValue`.",
        ]),
        p("Next lesson: nullable reference types. On a Sunday evening the class-reminder job crashed with a NullReferenceException, and 400 parents did not get their SMS - after the compiler had warned about that exact line for months."),
    ],
});
