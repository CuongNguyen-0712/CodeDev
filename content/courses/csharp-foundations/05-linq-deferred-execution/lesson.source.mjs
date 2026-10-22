// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-csf-2-2",
    title: "LINQ: Where, Select, GroupBy & deferred execution",
    slug: { _type: "slug", current: "csharp-linq-deferred-execution" },
    description:
        "Sen Academy's 06:00 late-fee job queued every reminder twice, each copy with a different id, and its log announced 2 reminders on a morning when 4 families got an SMS. Nothing in the code was obviously wrong: one LINQ query, a Count() for the log line and a foreach to send. Learn LINQ the way you will use it every day - Where, Select, OrderBy, GroupBy, ToDictionary, Count, Sum, Average, MaxBy, Any, First and the .NET 9 CountBy and AggregateBy - and the rule behind the incident: a query is a recipe that runs every time it is enumerated, reads captured variables when it runs, and must not have side effects. Then fix the job with ToList and a plain foreach.",
    estimatedTime: 21,

    scenario: {
        role: "Junior C# developer on the Sen Academy portal team, an after-school tutoring center in Hà Nội",
        problem:
            "On the first Monday of October, Bùi Thị Hạnh, the accountant, compared the late-fee outbox with the SMS gateway's bill. The outbox had 6 rows for 4 SMS: Trần Khánh Linh and Lê Hoàng Nam appeared twice with different reminder ids, and two of the rows were never sent. The job's own log said it had 2 reminders to send. Parents who called the front desk were told different amounts depending on which row the staff found first.",
    },

    content: [
        h2("1. The incident"),
        p("Families at Sen Academy pay tuition in the first days of the month. Every morning at 06:00, a job looks for unpaid invoices that are more than five days late, queues a reminder with a 2% late fee in the outbox table, and sends an SMS to the parents. In September, a small change added a rule from the director: in the first month of term, the grace period is only three days."),
        p("On the first Monday of October, Bùi Thị Hạnh, the accountant, was reconciling the outbox with the SMS gateway's monthly bill. The numbers did not match. The outbox had six rows for that morning and the gateway had sent four SMS. Trần Khánh Linh (HS-1025) and Lê Hoàng Nam (HS-1026) each had two rows with different ids, #501 and #504 for Linh. Rows #501 and #502 had never been sent. And the job's log said: `2 reminders to send`."),
        p("Phạm Minh Tuấn's first guess was that the job had run twice. It had not: there was one log line, one process, one run. The job ran once - but its query ran twice."),

        h2("2. Reproduce it"),
        p("The job, cut down to five invoices. `Outbox.Queue` stands for the `INSERT` into the outbox table and returns the new row:"),
        code("csharp", String.raw`
// Late-fee reminder job, cut down. Runs every morning at 06:00.
var invoices = new List<Invoice>
{
    new("HS-1024", 1_800_000, DaysLate: 4, Paid: false),
    new("HS-1025", 1_800_000, DaysLate: 12, Paid: false),
    new("HS-1026", 1_500_000, DaysLate: 7, Paid: false),
    new("HS-1028", 1_500_000, DaysLate: 9, Paid: true),
    new("HS-1029", 1_800_000, DaysLate: 4, Paid: false),
};
var outbox = new Outbox();
bool firstMonthOfTerm = true;

int graceDays = 5;
var reminders = invoices
    .Where(i => !i.Paid && i.DaysLate > graceDays)
    .Select(i => outbox.Queue(i.Student, i.Amount / 50));   // late fee: 2% of the invoice

Console.WriteLine($"[log] {reminders.Count()} reminders to send");

if (firstMonthOfTerm)
    graceDays = 3;   // added in September: a shorter grace period in the first month

foreach (var r in reminders)
    Console.WriteLine($"[sms] #{r.Id} to the parents of {r.Student}: late fee {r.Fee} VND");

Console.WriteLine($"[db] outbox rows: {string.Join(", ", outbox.Rows.Select(r => $"#{r.Id} {r.Student}"))}");

record Invoice(string Student, long Amount, int DaysLate, bool Paid);
record Reminder(int Id, string Student, long Fee);

class Outbox
{
    private int _nextId = 501;
    public List<Reminder> Rows { get; } = [];

    // Queue inserts a reminder row and returns it (in the real job: an INSERT into the outbox table).
    public Reminder Queue(string student, long fee)
    {
        var r = new Reminder(_nextId++, student, fee);
        Rows.Add(r);
        return r;
    }
}`, "LateFeeJob.cs"),
        code("text", String.raw`
[log] 2 reminders to send
[sms] #503 to the parents of HS-1024: late fee 36000 VND
[sms] #504 to the parents of HS-1025: late fee 36000 VND
[sms] #505 to the parents of HS-1026: late fee 30000 VND
[sms] #506 to the parents of HS-1029: late fee 36000 VND
[db] outbox rows: #501 HS-1025, #502 HS-1026, #503 HS-1024, #504 HS-1025, #505 HS-1026, #506 HS-1029`),
        p("Exactly Monday's picture: the log says 2, four SMS go out with ids starting at #503, and the outbox has six rows. (`record Invoice(...)` declares a small data class in one line; lesson 3-1 is about records. Here they are just data holders.) To see why, you need to know what `reminders` is - and what it is not."),

        h2("3. LINQ in five minutes"),
        p("LINQ (Language Integrated Query) is a set of extension methods on `IEnumerable<T>` - every array, list, set and dictionary - in the namespace `System.Linq`, which the implicit usings already import. Each method takes a lambda that says what to do with one element:"),
        code("csharp", String.raw`
var scores = new List<Score>
{
    new("HS-1024", "TOAN9-A", 8.5),
    new("HS-1025", "TOAN9-A", 9.5),
    new("HS-1026", "ANH7-B", 6.0),
    new("HS-1027", "ANH7-B", 7.5),
    new("HS-1024", "ANH7-B", 9.0),
    new("HS-1028", "TOAN9-A", 4.5),
};

var good = scores.Where(s => s.Value >= 8.0);               // filter
var ids = good.Select(s => s.Student);                       // project
Console.WriteLine(string.Join(", ", ids));

var ranked = scores.OrderByDescending(s => s.Value).ThenBy(s => s.Student);
Console.WriteLine(string.Join(", ", ranked.Select(s => $"{s.Student} {s.Value}")));

Console.WriteLine($"count {scores.Count(s => s.Course == "ANH7-B")}, " +
                  $"avg {scores.Average(s => s.Value):F2}, " +
                  $"min {scores.Min(s => s.Value)}, max {scores.Max(s => s.Value)}");
Console.WriteLine(scores.MaxBy(s => s.Value));               // the element, not just the value
Console.WriteLine($"{scores.Any(s => s.Value < 5.0)} {scores.All(s => s.Value <= 10)}");

Console.WriteLine(scores.First(s => s.Course == "ANH7-B").Student);
Console.WriteLine(scores.FirstOrDefault(s => s.Course == "HOA11-A")?.Student ?? "none");
Console.WriteLine(string.Join(", ", scores.Select(s => s.Student).Distinct()));
Console.WriteLine(string.Join(", ", scores.DistinctBy(s => s.Course).Select(s => s.Student)));

record Score(string Student, string Course, double Value);`, "Basics.cs"),
        code("text", String.raw`
HS-1024, HS-1025, HS-1024
HS-1025 9.5, HS-1024 9, HS-1024 8.5, HS-1027 7.5, HS-1026 6, HS-1028 4.5
count 3, avg 7.50, min 4.5, max 9.5
Score { Student = HS-1025, Course = TOAN9-A, Value = 9.5 }
True True
HS-1026
none
HS-1024, HS-1025, HS-1026, HS-1027, HS-1028
HS-1024, HS-1026`),
        bullets([
            "**`Where`** keeps the elements for which the lambda returns `true`; **`Select`** turns each element into something else. Together they replace most `foreach` + `if` + `Add` loops.",
            "**`OrderBy` / `OrderByDescending`** sort by a key, **`ThenBy`** breaks ties. The sort is stable: equal keys keep their order.",
            "**`Count`, `Sum`, `Average`, `Min`, `Max`** reduce a sequence to one number, and most take a lambda that picks the value. **`MaxBy` / `MinBy`** (.NET 6) return the whole element with the largest key.",
            "**`Any` / `All`** answer yes/no questions and stop as soon as they know the answer.",
            "**`First`** throws when nothing matches; **`FirstOrDefault`** returns `null` (or `0`, `false` ...). **`Single`** insists on exactly one match and throws otherwise.",
            "**`Distinct`** removes duplicate elements; **`DistinctBy`** keeps the first element for each key.",
        ]),
        h3("Grouping and dictionaries"),
        p("The same `scores` list, grouped:"),
        code("csharp", String.raw`
foreach (var g in scores.GroupBy(s => s.Course))
    Console.WriteLine($"{g.Key}: {g.Count()} scores, avg {g.Average(s => s.Value):F2}, best {g.MaxBy(s => s.Value)!.Student}");

Dictionary<string, double> best = scores
    .GroupBy(s => s.Student)
    .ToDictionary(g => g.Key, g => g.Max(s => s.Value));
Console.WriteLine($"HS-1024 best: {best["HS-1024"]}");

ILookup<string, Score> byCourse = scores.ToLookup(s => s.Course);
Console.WriteLine($"{byCourse["ANH7-B"].Count()} {byCourse["HOA11-A"].Count()}");   // a missing key is empty, no exception

foreach (var (course, n) in scores.CountBy(s => s.Course))                        // .NET 9
    Console.Write($"{course}={n} ");
Console.WriteLine();
foreach (var (student, total) in scores.AggregateBy(s => s.Student, 0.0, (sum, s) => sum + s.Value))  // .NET 9
    Console.Write($"{student}={total} ");
Console.WriteLine();

foreach (var batch in scores.Select(s => s.Student).Chunk(4))                      // SMS gateway: 4 per request
    Console.WriteLine($"batch: {string.Join(",", batch)}");

var query = from s in scores
            where s.Course == "TOAN9-A"
            orderby s.Value descending
            select s.Student;
Console.WriteLine(string.Join(", ", query));`, "Groups.cs"),
        code("text", String.raw`
TOAN9-A: 3 scores, avg 7.50, best HS-1025
ANH7-B: 3 scores, avg 7.50, best HS-1024
HS-1024 best: 9
3 0
TOAN9-A=3 ANH7-B=3
HS-1024=17.5 HS-1025=9.5 HS-1026=6 HS-1027=7.5 HS-1028=4.5
batch: HS-1024,HS-1025,HS-1026,HS-1027
batch: HS-1024,HS-1028
HS-1025, HS-1024, HS-1028`),
        bullets([
            "**`GroupBy(key)`** returns groups; each group has a `Key` and is itself a sequence you can count, average or sort.",
            "**`ToDictionary(key, value)`** builds a `Dictionary` and throws if two elements have the same key - group first when keys repeat. **`ToLookup`** builds a read-only multi-map where a missing key gives an empty sequence.",
            "**`CountBy` and `AggregateBy`** (.NET 9) count or fold per key in one pass, without building the groups: `CountBy(s => s.Course)` is the short form of `GroupBy(...).Select(g => (g.Key, g.Count()))`.",
            "**`Chunk(n)`** cuts a sequence into arrays of at most `n` elements - for APIs that take a limited batch.",
            "**Query syntax** (`from ... where ... select`) compiles to the same method calls. Teams usually pick one style; method syntax covers more operators.",
        ]),

        h2("4. A query is a recipe, not a result"),
        p("Here is the rule the incident broke. `Where` and `Select` do not filter or project anything when they are called. They return an object that **remembers** the source and the lambdas, and does the work later, when something enumerates it - a `foreach`, `ToList()`, `Count()`, `Sum()`, `string.Join`. This is **deferred execution**, and it happens **every time** the query is enumerated:"),
        code("csharp", String.raw`
int[] daysLate = [4, 12, 7];

var late = daysLate
    .Where(d => { Console.WriteLine($"  Where looks at {d}"); return d > 5; })
    .Select(d => { Console.WriteLine($"  Select maps {d}"); return d * 1000; });
Console.WriteLine("query defined");

Console.WriteLine($"Count: {late.Count()}");
Console.WriteLine("foreach:");
foreach (var fee in late)
    Console.WriteLine($"  got {fee}");

Console.WriteLine("ToList:");
List<int> fees = late.ToList();
Console.WriteLine($"Count: {fees.Count}, again: {fees.Count}");`, "Deferred.cs"),
        code("text", String.raw`
query defined
  Where looks at 4
  Where looks at 12
  Select maps 12
  Where looks at 7
  Select maps 7
Count: 2
foreach:
  Where looks at 4
  Where looks at 12
  Select maps 12
  got 12000
  Where looks at 7
  Select maps 7
  got 7000
ToList:
  Where looks at 4
  Where looks at 12
  Select maps 12
  Where looks at 7
  Select maps 7
Count: 2, again: 2`),
        bullets([
            "**\"query defined\" comes first**: defining the query ran neither lambda.",
            "**`Count()` ran the whole pipeline**, `Select` included, only to count the results - and threw them away.",
            "**`foreach` ran it again from the start.** Elements flow through one at a time: `Where`, then `Select`, then the loop body, then the next element.",
            "**`ToList()` ran it a third time**, but stored the results. `fees.Count` is a property of the list: reading it twice runs nothing.",
        ]),
        p("Methods that return a sequence (`Where`, `Select`, `OrderBy`, `GroupBy`, `Distinct`, `Chunk` ...) are deferred. Methods that return a single value or a collection (`Count`, `Sum`, `Average`, `First`, `Any`, `ToList`, `ToArray`, `ToDictionary` ...) run the query immediately. In the job, `Count()` was the first run and the `foreach` the second, and `Queue` - a side effect hidden in `Select` - ran in both."),
        image("one-query-two-runs", {
            alt: "Left: the query object reminders holds no results, only a recipe: the source list invoices, the Where lambda which reads the variable graceDays, and the Select lambda which calls outbox.Queue to insert a row. Nothing runs until someone enumerates it, and then all of it. Right, run 1, orange: reminders.Count() for the log line with graceDays = 5 inserts rows #501 HS-1025 and #502 HS-1026, nothing is sent, and the log says 2 reminders to send. A dashed step: if (firstMonthOfTerm) graceDays = 3, so the lambda will read 3 next time. Run 2, blue: the foreach that sends the SMS with graceDays = 3 inserts #503 HS-1024, #504 HS-1025, #505 HS-1026 and #506 HS-1029. Bottom left, red: the outbox Bùi Thị Hạnh found, 6 rows for 4 SMS: #501 HS-1025 and #502 HS-1026 never sent, #503 HS-1024 sent, #504 HS-1025 and #505 HS-1026 sent as second rows, #506 HS-1029 sent; the log said 2, parents of 4 students got an SMS. Bottom right, green: the fix, decide, run once, then act: 1. set graceDays before the query runs; 2. materialize once with var due = invoices.Where(...).ToList(); 3. side effects in a foreach, once per item: foreach (var i in due) outbox.Queue(...); due.Count, the SMS and the outbox now agree: 4 rows, #501 to #504.",
            caption: "Count() and foreach are two separate runs of the same recipe. Whatever the recipe does, it does twice.",
        }),

        h2("5. Captured variables are read when the query runs"),
        p("The lambda `i => i.DaysLate > graceDays` does not copy the value of `graceDays`. It **captures the variable** itself, and reads it each time the lambda is called. The query also reads its source list as it is at that moment:"),
        code("csharp", String.raw`
var invoices = new List<int> { 4, 12, 7 };   // days late
int graceDays = 5;

var overdue = invoices.Where(d => d > graceDays);      // captures the VARIABLE graceDays
List<int> snapshot = invoices.Where(d => d > graceDays).ToList();

graceDays = 3;
invoices.Add(20);

Console.WriteLine($"overdue:  {string.Join(", ", overdue)}");
Console.WriteLine($"snapshot: {string.Join(", ", snapshot)}");`, "Captured.cs"),
        code("text", String.raw`
overdue:  4, 12, 7, 20
snapshot: 12, 7`),
        p("`overdue` sees the new grace period and the invoice added later; `snapshot` was computed while `graceDays` was 5. Neither is wrong in itself - sometimes you want a live view. The bug is to log one run and act on another. In the job, the September change put `graceDays = 3` **between** the two runs, so the log counted with 5 days and the SMS went out with 3."),
        callout("warning", "Multiple enumeration is not only a correctness problem",
            "When the source is a database query (Entity Framework) or a file read with File.ReadLines, every enumeration goes back to the database or the disk. A Count() before a foreach is then two round trips, and the two can even see different data if rows changed in between. Many IDEs warn about 'possible multiple enumeration of IEnumerable' for exactly this reason. Materialize once with ToList() when you will read the results more than once."),

        h2("6. Empty sequences and other traps"),
        code("csharp", String.raw`
var none = new List<double>();
Console.WriteLine(none.Sum());
Console.WriteLine(none.DefaultIfEmpty().Average());
Console.WriteLine(none.Count == 0 ? "n/a" : none.Average().ToString());
try { Console.WriteLine(none.Average()); }
catch (InvalidOperationException e) { Console.WriteLine($"Average: {e.Message}"); }
try { Console.WriteLine(none.Max()); }
catch (InvalidOperationException e) { Console.WriteLine($"Max: {e.Message}"); }

string[] students = ["HS-1024", "HS-1025", "HS-1024"];
try { Console.WriteLine(students.Single(s => s == "HS-1024")); }
catch (InvalidOperationException e) { Console.WriteLine($"Single: {e.Message}"); }
try { Console.WriteLine(students.First(s => s == "HS-1099")); }
catch (InvalidOperationException e) { Console.WriteLine($"First: {e.Message}"); }
Console.WriteLine(students.FirstOrDefault(s => s == "HS-1099") ?? "null");`, "Empty.cs"),
        code("text", String.raw`
0
0
n/a
Average: Sequence contains no elements
Max: Sequence contains no elements
Single: Sequence contains more than one matching element
First: Sequence contains no matching element
null`),
        p("`Sum` of nothing is 0, but there is no average or maximum of nothing, so `Average`, `Min` and `Max` throw on an empty sequence of numbers. A class with no scores yet, a month with no late invoices - decide what the report should say (`n/a` is usually more honest than 0) and check `Count == 0` or `Any()` first. `DefaultIfEmpty()` turns \"nothing\" into a single `0`, which silently makes an empty class average 0."),
        challenge("chal_quiz_csf_221", "For the first question, ask at which line string.Join runs the query, and what graceDays and the list contain at that moment. For the second, sort the methods into deferred ones (they return a recipe) and immediate ones (they return a value or a new collection)."),

        h2("7. Side effects do not belong in a query"),
        p("`Select(i => outbox.Queue(...))` reads nicely - \"turn each invoice into a queued reminder\" - but a lambda in a LINQ query should **compute**, not **do**. How often it runs depends on who enumerates the query and how many times: zero times if nobody does, twice if someone logs a count first, a third time if a later change adds a `Sum` for the daily report. Inserting rows, sending messages, writing files and incrementing counters belong in statements, where they run exactly as often as the code says."),

        h2("8. The fix"),
        p("Tuấn's fix separates the three steps the old code mixed up: decide the inputs, run the query once, then act on each result:"),
        code("csharp", String.raw`
// 1. Decide every input of the query first.
int graceDays = firstMonthOfTerm ? 3 : 5;

// 2. Run the query once, and keep the result. No side effects inside it.
List<Invoice> due = invoices
    .Where(i => !i.Paid && i.DaysLate > graceDays)
    .ToList();

Console.WriteLine($"[log] {due.Count} reminders to send");

// 3. Side effects are statements, once per item.
foreach (var invoice in due)
{
    Reminder r = outbox.Queue(invoice.Student, invoice.Amount / 50);
    Console.WriteLine($"[sms] #{r.Id} to the parents of {r.Student}: late fee {r.Fee} VND");
}`, "LateFeeJob.cs"),
        code("text", String.raw`
[log] 4 reminders to send
[sms] #501 to the parents of HS-1024: late fee 36000 VND
[sms] #502 to the parents of HS-1025: late fee 36000 VND
[sms] #503 to the parents of HS-1026: late fee 30000 VND
[sms] #504 to the parents of HS-1029: late fee 36000 VND
[db] outbox rows: #501 HS-1024, #502 HS-1025, #503 HS-1026, #504 HS-1029`),
        numbered([
            "**`graceDays` is final before the query exists.** The first-month rule is part of computing the input, not a change made halfway through.",
            "**`ToList()` runs the query exactly once.** `due.Count` is a property of the list, and the `foreach` walks the list: no second run, whatever else is added later.",
            "**The query is pure.** It only filters; it inserts nothing. Running it once more by accident would cost time, not money.",
            "**The log, the SMS and the outbox agree**: 4, 4 and 4 rows numbered from #501. Hạnh deleted the two orphan rows of each morning that week, and the front desk got one amount per family again.",
        ]),

        h2("9. Your turn"),
        p("The real job also prints a second log line with the total of the late fees, for Hạnh's daily report - one more enumeration of the same query. The test runner reads the grace setting, whether it is the first month of term and the invoices, runs `RunReminderJob` and prints every outbox row."),
        challenge("chal_fix_csf_222", "Count how many times the reminders query is enumerated in the starter: each enumeration calls Queue again. Then check when graceDays gets its final value compared with the first enumeration. Both bugs must go: decide graceDays first, and make sure Queue runs exactly once per overdue invoice."),

        h2("10. Pitfalls"),
        bullets([
            "**Enumerating the same query more than once** (`Count()` then `foreach`, or `Any()` then `First()`): the whole pipeline runs again each time. Call `ToList()` once when you need the results more than once.",
            "**Side effects in `Select` or `Where`**: inserts, sends, counters and logging run once per enumeration - zero, one or many times. Keep lambdas pure; act in a `foreach`.",
            "**Changing a captured variable after defining a query**: the query reads the new value when it runs. Decide inputs first, or materialize right away.",
            "**`Average`, `Min`, `Max` on an empty sequence** throw `InvalidOperationException`. Check `Count == 0` or `Any()` first and say `n/a`.",
            "**`First` when nothing may match, `Single` when several may match**: both throw. Use `FirstOrDefault` and handle `null`.",
            "**`ToDictionary` on duplicate keys** throws `ArgumentException`. Group first, or use `ToLookup`.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Every query that is read more than once is materialized once with `ToList()` or `ToArray()`.",
            "Lambdas inside LINQ queries compute values; they do not insert, send, write or increment.",
            "All variables a query captures have their final values before the query first runs.",
            "Aggregates over possibly empty sequences handle the empty case explicitly.",
            "`GroupBy`, `CountBy` or `ToLookup` replace hand-written dictionary-of-lists loops where they read better.",
            "Reports sort with `OrderBy` / `ThenBy` and never rely on the order of a dictionary or a group.",
        ]),
        p("Next lesson: classes, records and equality. Some parents were billed twice for the same class, because a `HashSet<Enrollment>` did not recognise two identical enrollments as the same."),
    ],
});
