// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-csf-2-1",
    title: "List, Dictionary & HashSet",
    slug: { _type: "slug", current: "csharp-list-dictionary-hashset" },
    description:
        "On the first day of term, Sen Academy's enrollment dashboard crashed with a KeyNotFoundException at 08:02. The hotfix counted a parent's double-click as two seats, so ANH7-B showed 'full' with two students and a third was sent to the waitlist. The clean-up script then crashed with 'Collection was modified'. Learn the three collections every C# program uses: List<T> for order and position, Dictionary<TKey, TValue> for lookups by key (and why reading a missing key throws), and HashSet<T> for 'is it already in?'. Then: comparers such as StringComparer.OrdinalIgnoreCase, why you sort before you print, and how to remove items without breaking a foreach.",
    estimatedTime: 21,

    scenario: {
        role: "Junior C# developer on the Sen Academy portal team, an after-school tutoring center in Hà Nội",
        problem:
            "Sign-ups for the new term opened at 07:00 on Monday. The dashboard that shows free seats per class went down at 08:02, came back at 08:40 with a hotfix, and then told parents that English 7 (ANH7-B) was full when only two students had a seat. Đỗ Mai Anh's father was told to join the waitlist and enrolled her at another center that afternoon.",
    },

    content: [
        h2("1. The incident"),
        p("Every term starts the same way at Sen Academy: at 07:00 on Monday the portal opens sign-ups, and parents race for the popular classes. The front desk in Cầu Giấy watches a dashboard that shows, for each class, how many seats are taken. Small classes fill in minutes: ANH7-B, thầy Lý Văn Đạt's English 7 group, has three seats."),
        p("At 08:02 the dashboard showed an error page. The log had one line: `KeyNotFoundException: The given key 'ANH7-B' was not present in the dictionary.` Phạm Minh Tuấn, the team lead, pushed a hotfix at 08:40. The dashboard came back, and at 08:51 it showed ANH7-B as 3/3 - full."),
        p("It was not full. Nguyễn Gia Bảo's mother had pressed \"Đăng ký\" twice on a slow phone connection, and the dashboard counted two seats for Bảo. Lê Hoàng Nam had the third. When Đỗ Mai Anh's father tried at 09:10, the portal put her on the waitlist, and he enrolled her at another center that afternoon. In the evening, the script that removes cancelled sign-ups from the rosters crashed too: `InvalidOperationException: Collection was modified; enumeration operation may not execute.`"),
        p("Three bugs, one root cause: the code used the right collections in the wrong way. This lesson goes through `List<T>`, `Dictionary<TKey, TValue>` and `HashSet<T>`, and for each one asks the question the incident got wrong."),

        h2("2. Reproduce it"),
        p("The first version of the dashboard counted sign-ups per class:"),
        code("csharp", String.raw`
// Enrollment dashboard, first version: count sign-ups per class.
string[] signUps =
[
    "HS-1024 ANH7-B",
    "HS-1025 TOAN9-A",
    "HS-1026 ANH7-B",
];

var counts = new Dictionary<string, int>();
foreach (var line in signUps)
{
    string[] f = line.Split(' ');
    counts[f[1]]++;
}

foreach (var (course, n) in counts)
    Console.WriteLine($"{course}: {n}");`, "Dashboard.cs"),
        code("text", String.raw`
Unhandled exception. System.Collections.Generic.KeyNotFoundException: The given key 'ANH7-B' was not present in the dictionary.
   at System.Collections.Generic.Dictionary` + "`" + String.raw`2.get_Item(TKey key)
   at Program.<Main>$(String[] args)`),
        p("`counts[f[1]]++` is shorthand for `counts[f[1]] = counts[f[1]] + 1`. The right-hand side **reads** the key first, and the very first sign-up for ANH7-B finds no entry. In the test data on the developer's machine, the dictionary was filled from last term's classes before counting started, so the bug never showed. On Monday, ANH7-B was a new class code."),
        p("The 08:40 hotfix created the entry first, and added the capacity check that the dashboard shows to parents:"),
        code("csharp", String.raw`
// Hotfix: create the entry first. Capacity of ANH7-B is 3 seats.
string[] signUps =
[
    "HS-1024 ANH7-B",
    "HS-1024 ANH7-B",   // Bảo's mother clicked "Đăng ký" twice
    "HS-1026 ANH7-B",
    "HS-1027 ANH7-B",
];
var capacity = new Dictionary<string, int> { ["ANH7-B"] = 3 };

var counts = new Dictionary<string, int>();
foreach (var line in signUps)
{
    string[] f = line.Split(' ');
    string student = f[0], course = f[1];
    if (!counts.ContainsKey(course))
        counts[course] = 0;
    if (counts[course] >= capacity[course])
    {
        Console.WriteLine($"{student}: {course} is full, added to the waitlist");
        continue;
    }
    counts[course]++;
    Console.WriteLine($"{student}: enrolled in {course} ({counts[course]}/{capacity[course]})");
}`, "Hotfix.cs"),
        code("text", String.raw`
HS-1024: enrolled in ANH7-B (1/3)
HS-1024: enrolled in ANH7-B (2/3)
HS-1026: enrolled in ANH7-B (3/3)
HS-1027: ANH7-B is full, added to the waitlist`),
        p("No exception any more, and a new bug: the dashboard counts **sign-ups**, not **students**. A number cannot remember who it counted. To ignore the second click, the code has to know which students already have a seat - a job for a set, not a counter. Before the fix, let's look at each collection properly."),

        h2("3. List<T>: order and position"),
        p("`List<T>` is the default collection in C#: a resizable array. It keeps items in the order you add them, lets you read any item by index, and allows duplicates."),
        code("csharp", String.raw`
var roster = new List<string>();
Console.WriteLine($"Count {roster.Count}, Capacity {roster.Capacity}");
roster.Add("HS-1024");
roster.Add("HS-1026");
roster.Add("HS-1027");
roster.Insert(0, "HS-1030");                 // shifts everything after index 0
Console.WriteLine($"Count {roster.Count}, Capacity {roster.Capacity}: {string.Join(", ", roster)}");

Console.WriteLine(roster[1]);                 // index: O(1)
Console.WriteLine(roster.Contains("HS-1027")); // linear search: O(n)
Console.WriteLine(roster.IndexOf("HS-1099"));  // -1 when missing

bool removed = roster.Remove("HS-1026");      // the first match only
int gone = roster.RemoveAll(id => id.EndsWith('7'));
Console.WriteLine($"{removed} {gone}: {string.Join(", ", roster)}");

List<string> waitlist = ["HS-1028", "HS-1029"];          // collection expression (C# 12)
List<string> everyone = [.. roster, .. waitlist, "HS-1031"]; // spread
Console.WriteLine(string.Join(", ", everyone));

try { Console.WriteLine(roster[5]); }
catch (ArgumentOutOfRangeException e) { Console.WriteLine(e.Message); }`, "Lists.cs"),
        code("text", String.raw`
Count 0, Capacity 0
Count 4, Capacity 4: HS-1030, HS-1024, HS-1026, HS-1027
HS-1024
True
-1
True 1: HS-1030, HS-1024
HS-1030, HS-1024, HS-1028, HS-1029, HS-1031
Index was out of range. Must be non-negative and less than the size of the collection. (Parameter 'index')`),
        bullets([
            "**`Count`** is how many items the list holds; **`Capacity`** is how many fit in the array behind it before it must grow. When it is full, `Add` allocates a bigger array (double the size) and copies: capacities go 4, 8, 16, 32, 64. If you know the size, `new List<string>(capacity: 30)` allocates once.",
            "**Index access and `Add` at the end are fast.** `Insert(0, x)`, `Remove(x)` and `Contains(x)` are not: they shift or walk the whole list. For 30 students that does not matter; for the 2,400 students of the whole school, checked once per sign-up, it does.",
            "**`Remove` returns `bool`** and removes only the first match. `RemoveAll(predicate)` removes every match in one pass and returns how many.",
            "**Collection expressions** (`[a, b]`, `[.. list, x]`) build lists, arrays and spans with one syntax since C# 12.",
            "**An index outside `0 .. Count - 1`** throws `ArgumentOutOfRangeException`. There is no \"default\" item.",
        ]),

        h2("4. Dictionary<TKey, TValue>: lookups by key"),
        p("A dictionary maps each key to one value, and finds the value for a key in constant time, however many entries it holds. The indexer behaves differently for reading and writing - the source of the 08:02 crash:"),
        code("csharp", String.raw`
var capacity = new Dictionary<string, int>
{
    ["TOAN9-A"] = 30,
    ["ANH7-B"] = 3,
};

capacity["LY10-A"] = 25;      // set: adds a new key
capacity["ANH7-B"] = 4;       // set: overwrites, no error
Console.WriteLine(capacity.Count);

try { Console.WriteLine(capacity["HOA11-A"]); }   // get: throws for a missing key
catch (KeyNotFoundException e) { Console.WriteLine(e.Message); }

if (capacity.TryGetValue("HOA11-A", out int seats))
    Console.WriteLine($"HOA11-A has {seats} seats");
else
    Console.WriteLine("HOA11-A: no capacity set");

Console.WriteLine(capacity.GetValueOrDefault("HOA11-A"));       // 0, the default of int
Console.WriteLine(capacity.GetValueOrDefault("HOA11-A", 20));   // your own default

Console.WriteLine(capacity.TryAdd("TOAN9-A", 99));  // false: the key exists, nothing changes
Console.WriteLine(capacity["TOAN9-A"]);
try { capacity.Add("TOAN9-A", 99); }                // Add throws instead
catch (ArgumentException e) { Console.WriteLine(e.Message); }

var counts = new Dictionary<string, int>();
foreach (var course in new[] { "ANH7-B", "TOAN9-A", "ANH7-B" })
    counts[course] = counts.GetValueOrDefault(course) + 1;
foreach (var (course, n) in counts)
    Console.WriteLine($"{course}: {n}");`, "Dictionaries.cs"),
        code("text", String.raw`
3
The given key 'HOA11-A' was not present in the dictionary.
HOA11-A: no capacity set
0
20
False
30
An item with the same key has already been added. Key: TOAN9-A
ANH7-B: 2
TOAN9-A: 1`),
        bullets([
            "**`d[key] = value`** never fails: it adds the key or overwrites its value.",
            "**`d[key]` as a read** throws `KeyNotFoundException` for a missing key - and so does `d[key]++` and `d[key] += 1`, because they read first.",
            "**`TryGetValue(key, out value)`** is the standard way to read a key that may be missing: one lookup, a `bool` for \"found\", and the value in the `out` variable.",
            "**`GetValueOrDefault(key)`** returns the type's default (`0`, `null`) or the default you pass. `counts[k] = counts.GetValueOrDefault(k) + 1` is the counting idiom.",
            "**`Add` throws** for a key that exists; **`TryAdd`** returns `false` and leaves the old value. Use `Add` when a duplicate means a bug, `TryAdd` when it means \"already done\".",
        ]),
        p("The hotfix's `if (!counts.ContainsKey(course)) counts[course] = 0;` works, but looks the key up twice before it even counts. `TryGetValue` or `GetValueOrDefault` do it once. In hot code that counts millions of items, `CollectionsMarshal.GetValueRefOrAddDefault(counts, key, out _)` (namespace `System.Runtime.InteropServices`) returns a `ref` to the value slot, adding it if needed, so `n++` costs exactly one lookup. You will rarely need it; know that it exists."),
        h3("Keys need equality and a hash code"),
        p("A dictionary finds a key by its hash code, then confirms with `Equals`. For `string` keys the default is **ordinal**: `\"ANH7-B\"` and `\"anh7-b\"` are different keys. Pass a comparer to the constructor when the domain says otherwise: `new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)`. Your own classes as keys come in lesson 3-1, on records and equality."),
        image("three-collections", {
            alt: "Three panels. List<string>, blue: ordered, indexed, duplicates allowed, with slots [0] HS-1024, [1] HS-1026, [2] HS-1027; list[i] and Add are fast, Contains, Remove and Insert(0, x) walk or shift the whole list; trap: Remove inside foreach throws InvalidOperationException Collection was modified, use RemoveAll. Dictionary<K, V>, amber: one value per key, with ANH7-B to 3, TOAN9-A to 28 and a dashed missing LY10-A; d[key] = v adds or overwrites, TryGetValue and GetValueOrDefault read without throwing; trap: d[\"LY10-A\"] and d[\"LY10-A\"]++ throw KeyNotFoundException. HashSet<string>, green: each item once, no order to rely on, holding HS-1024, HS-1026, HS-1027; Add(x) returns false if x is there, Contains and Remove are fast, UnionWith, IntersectWith, ExceptWith; tip: new(StringComparer.OrdinalIgnoreCase) treats hs-1024 and HS-1024 as one id. Bottom left, red: first day of term, ANH7-B with 3 seats: at 08:02 counts[course]++ on a new course threw KeyNotFoundException and the dashboard went down; at 08:40 the ContainsKey hotfix counted Bảo's double-click as two seats, so ANH7-B was full at 2 students and HS-1027 went to the waitlist. Bottom right, green: the fix, count students not clicks: Dictionary<string, HashSet<string>> maps each course to the set of its students; set.Add(student) is false for the second click; seats taken = set.Count, cancel = set.Remove.",
            caption: "A counter answers 'how many', a set answers 'who'. The dashboard needed 'who'.",
        }),

        h2("5. HashSet<T>: is it already in?"),
        p("A `HashSet<T>` holds each item at most once and answers \"is x in the set?\" in constant time. Its `Add` tells you whether the item was new - exactly the question the dashboard never asked:"),
        code("csharp", String.raw`
var anh7b = new HashSet<string>();
Console.WriteLine(anh7b.Add("HS-1024"));   // true: added
Console.WriteLine(anh7b.Add("HS-1024"));   // false: already there, nothing changes
anh7b.Add("HS-1026");
Console.WriteLine(anh7b.Count);

var toan9a = new HashSet<string> { "HS-1024", "HS-1025" };
var both = new HashSet<string>(anh7b);
both.IntersectWith(toan9a);                  // in both classes
var either = new HashSet<string>(anh7b);
either.UnionWith(toan9a);                    // in at least one
var onlyEnglish = new HashSet<string>(anh7b);
onlyEnglish.ExceptWith(toan9a);
Console.WriteLine($"both: {string.Join(",", both)} | either: {either.Count} | only ANH7-B: {string.Join(",", onlyEnglish)}");

var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "HS-1024" };
Console.WriteLine(ids.Add("hs-1024"));       // false: same id, other case
Console.WriteLine(ids.Contains("Hs-1024"));`, "Sets.cs"),
        code("text", String.raw`
True
False
2
both: HS-1024 | either: 3 | only ANH7-B: HS-1026
False
True`),
        bullets([
            "**`Add` returns `false`** for an item that is already in the set and changes nothing - no exception, no duplicate. That is the double-click check in one call.",
            "**`IntersectWith`, `UnionWith`, `ExceptWith`** change the set they are called on, which is why the example copies `anh7b` first with `new HashSet<string>(anh7b)`.",
            "**The comparer decides what \"the same\" means.** The front desk types ids by hand, and `hs-1024` is Bảo too. `StringComparer.OrdinalIgnoreCase` compares letters without case and without culture rules - the right choice for ids and codes.",
            "**A set has no index and no order you can rely on.** If you need \"who signed up first\", keep a `List<T>` next to the set.",
        ]),

        h2("6. Order: never print a dictionary as it comes"),
        p("A `Dictionary` usually returns its entries in the order you added them - until you remove one:"),
        code("csharp", String.raw`
var counts = new Dictionary<string, int>
{
    ["TOAN9-A"] = 28,
    ["ANH7-B"] = 3,
    ["LY10-A"] = 21,
};
Console.WriteLine(string.Join(" ", counts.Keys));
counts.Remove("TOAN9-A");
counts["HOA11-A"] = 17;
Console.WriteLine(string.Join(" ", counts.Keys));

foreach (var (course, n) in counts.OrderBy(kv => kv.Key, StringComparer.Ordinal))
    Console.Write($"{course}={n} ");
Console.WriteLine();

var sorted = new SortedDictionary<string, int>(counts, StringComparer.Ordinal);
sorted["ANH6-A"] = 12;
Console.WriteLine(string.Join(" ", sorted.Keys));`, "Order.cs"),
        code("text", String.raw`
TOAN9-A ANH7-B LY10-A
HOA11-A ANH7-B LY10-A
ANH7-B=3 HOA11-A=17 LY10-A=21
ANH6-A ANH7-B HOA11-A LY10-A`),
        p("HOA11-A, added last, comes out **first**: it took the slot TOAN9-A freed. The documentation says the order of a `Dictionary` is undefined, and code that depends on it will change behaviour the day someone adds a `Remove`. When the order matters - a report, a test's expected output, a file another program compares - sort explicitly. `OrderBy` comes from LINQ (next lesson); `list.Sort(StringComparer.Ordinal)` sorts a `List<string>` in place. If you need the entries sorted all the time, `SortedDictionary<TKey, TValue>` keeps them sorted by key, at the cost of slower lookups (a tree instead of a hash table)."),
        callout("tip", "Ordinal or culture order?",
            "StringComparer.Ordinal compares the UTF-16 code units: fast, the same on every machine, and digits sort as characters, so TOAN10-A comes before TOAN9-A. Culture-aware sorting follows a language's alphabet rules and can change with the server's culture. For codes, ids and anything a program reads, use ordinal. For names shown to people, a culture order may be what they expect; lesson 1-3 covers culture."),

        h2("7. Changing a collection while you loop over it"),
        p("The evening clean-up script removed cancelled sign-ups like this:"),
        code("csharp", String.raw`
var roster = new List<string> { "HS-1024", "HS-1026", "HS-1027", "HS-1028" };
var cancelled = new HashSet<string> { "HS-1026", "HS-1027" };

foreach (var student in roster)
{
    if (cancelled.Contains(student))
        roster.Remove(student);
}
Console.WriteLine(string.Join(", ", roster));`, "Cleanup.cs"),
        code("text", String.raw`
Unhandled exception. System.InvalidOperationException: Collection was modified; enumeration operation may not execute.
   at System.Collections.Generic.List` + "`" + String.raw`1.Enumerator.MoveNext()
   at Program.<Main>$(String[] args)`),
        p("`foreach` asks the list for an enumerator, a cursor over its items. The list keeps a version number that every change increases, and the enumerator checks it on each step: removing an item would shift the rest under the cursor, so .NET refuses instead of silently skipping one. The ways that work:"),
        code("csharp", String.raw`
var roster = new List<string> { "HS-1024", "HS-1026", "HS-1027", "HS-1028" };
var cancelled = new HashSet<string> { "HS-1026", "HS-1027" };

// 1. RemoveAll: one pass, no enumerator involved
var copy1 = new List<string>(roster);
copy1.RemoveAll(cancelled.Contains);
Console.WriteLine(string.Join(", ", copy1));

// 2. Walk backwards with an index: removing at i does not move the elements before i
var copy2 = new List<string>(roster);
for (int i = copy2.Count - 1; i >= 0; i--)
    if (cancelled.Contains(copy2[i]))
        copy2.RemoveAt(i);
Console.WriteLine(string.Join(", ", copy2));

// 3. Forward with an index looks fine, but skips the element after each removal
var copy3 = new List<string>(roster);
for (int i = 0; i < copy3.Count; i++)
    if (cancelled.Contains(copy3[i]))
        copy3.RemoveAt(i);
Console.WriteLine(string.Join(", ", copy3));`, "Cleanup.cs"),
        code("text", String.raw`
HS-1024, HS-1028
HS-1024, HS-1028
HS-1024, HS-1027, HS-1028`),
        p("Version 3 is the bug the exception protects you from: after removing HS-1026 at index 1, HS-1027 moves to index 1, and `i++` jumps over it. Prefer `RemoveAll`; walk backwards when you need the index; or collect what to remove first and remove it after the loop."),
        p("`Dictionary` is a little more relaxed since .NET Core 3.0: `Remove` and overwriting the value of an **existing** key are allowed during `foreach`. Adding a key is not:"),
        code("csharp", String.raw`
var seats = new Dictionary<string, int> { ["TOAN9-A"] = 0, ["ANH7-B"] = 3, ["LY10-A"] = 0 };
foreach (var (course, n) in seats)
    if (n == 0) seats.Remove(course);         // allowed since .NET Core 3.0
foreach (var course in seats.Keys)
    seats[course] = 30;                         // overwriting an existing key: allowed
Console.WriteLine(string.Join(" ", seats));
try
{
    foreach (var course in seats.Keys)
        seats[course + "-online"] = 30;         // adding a key: not allowed
}
catch (InvalidOperationException e) { Console.WriteLine(e.Message); }`, "DictionaryLoop.cs"),
        code("text", String.raw`
[ANH7-B, 30]
Collection was modified; enumeration operation may not execute.`),

        h2("8. The fix"),
        p("The dashboard now keeps, for each course, the **set** of its students. A seat count is the size of the set, a double-click is an `Add` that returns `false`, and a cancellation is a `Remove`:"),
        code("csharp", String.raw`
// Enrollment dashboard, fixed: one set of students per class.
string[] log =
[
    "enroll HS-1024 ANH7-B",
    "enroll HS-1024 ANH7-B",   // the double-click
    "enroll hs-1024 ANH7-B",   // the same student, typed by hand at the front desk
    "enroll HS-1026 ANH7-B",
    "enroll HS-1025 TOAN9-A",
    "cancel HS-1026 ANH7-B",
    "enroll HS-1027 ANH7-B",
];

var students = new Dictionary<string, HashSet<string>>();
foreach (var line in log)
{
    string[] f = line.Split(' ');
    string action = f[0], student = f[1], course = f[2];

    if (!students.TryGetValue(course, out HashSet<string>? set))
    {
        set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        students[course] = set;
    }

    if (action == "enroll" && !set.Add(student))
        Console.WriteLine($"{student} is already in {course}: ignored");
    else if (action == "cancel")
        set.Remove(student);
}

var codes = new List<string>(students.Keys);
codes.Sort(StringComparer.Ordinal);
foreach (var code in codes)
    Console.WriteLine($"{code}: {students[code].Count} ({string.Join(", ", students[code])})");`, "Dashboard.cs"),
        code("text", String.raw`
HS-1024 is already in ANH7-B: ignored
hs-1024 is already in ANH7-B: ignored
ANH7-B: 2 (HS-1024, HS-1027)
TOAN9-A: 1 (HS-1025)`),
        numbered([
            "**`TryGetValue` + add on a miss** is the \"get or create\" pattern: one lookup when the course exists, and no `KeyNotFoundException` when it is new.",
            "**The set remembers who**, so the count can never be larger than the number of different students. `OrdinalIgnoreCase` makes the front desk's `hs-1024` the same student.",
            "**The output is sorted** with `StringComparer.Ordinal`, so the dashboard, its tests and tomorrow's run all list the classes in the same order.",
            "**Mai Anh got her seat back.** Tuấn replayed Monday's sign-up log through the fixed code: ANH7-B had two students, so Mai Anh's 09:10 sign-up was a seat, not a waitlist place. The front desk called her father the next morning.",
        ]),

        h2("9. Your turn"),
        p("The real dashboard does more than count: each class has a capacity and a waitlist, cancellations move the first waiting student into the freed seat, and the report lists the students in the order they got their seats. The test runner replays a sign-up log - `capacity`, `enroll` and `cancel` commands - through your code and prints one line per class."),
        challenge("chal_coding_csf_211", "Keep three things per course: the seats in order (a List), the waitlist in order (another List), and everyone who is in either list (a HashSet with a case-insensitive comparer). Let HashSet.Add decide whether a sign-up is a duplicate, and let a cancellation of an enrolled student move Waitlist[0] into the seat."),

        h2("10. Pitfalls"),
        bullets([
            "**`d[key]++` or `d[key] += x` on a key that may be missing**: throws `KeyNotFoundException`. Use `d[key] = d.GetValueOrDefault(key) + x` or `TryGetValue`.",
            "**Counting events when you mean things**: a counter cannot ignore a duplicate. If \"the same one twice\" must count once, keep a `HashSet<T>` and use its `Count`.",
            "**Forgetting the comparer**: `string` keys and set items compare ordinally and case-sensitively by default. Ids typed by people need `StringComparer.OrdinalIgnoreCase`.",
            "**Printing a dictionary or set in its own order**: the order is undefined and changes after removals. Sort before output.",
            "**Removing inside `foreach`**: `InvalidOperationException` for `List<T>` and `HashSet<T>`, and for adding keys to a `Dictionary`. Use `RemoveAll`, a backwards `for`, or collect first.",
            "**`List<T>.Contains` in a loop over many items**: each call walks the list. A `HashSet<T>` answers in constant time.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Dictionary reads use `TryGetValue` or `GetValueOrDefault` unless a missing key really is a bug.",
            "Every collection of ids or codes says which comparer it uses.",
            "\"Is it already there?\" is answered by `HashSet<T>.Add` or `Contains`, not by a counter or a `List<T>.Contains` in a loop.",
            "Order that matters is kept in a `List<T>`; output is sorted explicitly, with `StringComparer.Ordinal` for codes.",
            "No collection is changed inside a `foreach` over itself.",
            "Lists that will hold a known number of items are created with that capacity.",
        ]),
        p("Next lesson: LINQ. Bùi Thị Hạnh, the accountant, found every late-fee reminder twice in the outbox, each copy with a different id - and the job's log said it had sent fewer reminders than it actually did."),
    ],
});
