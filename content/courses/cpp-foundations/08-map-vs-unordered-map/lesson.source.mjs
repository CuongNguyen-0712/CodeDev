// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cppf-3-2",
    title: "std::map vs std::unordered_map",
    slug: { _type: "slug", current: "cpp-map-vs-unordered-map" },
    description:
        "The CS101 attendance report of Riverside Polytechnic listed 57 students for a class of 40: the warning check attendance[id] < 3 quietly added every id it did not know. A week later the team switched to std::unordered_map \"for speed\" and the nightly CSV came out in a new order. Learn how std::map (a sorted tree) and std::unordered_map (a hash table) store keys, why operator[] inserts and does not compile on a const map, how to look up without inserting (find, contains, at), how to insert and erase on purpose, and which container to pick.",
    estimatedTime: 22,

    scenario: {
        role: "Junior developer on the exam office team at Riverside Polytechnic, Hồ Chí Minh City",
        problem:
            "The attendance tool, ported from C to C++23, warns the faculty office about students with fewer than 3 sessions. On Monday the CS101 group 3 report showed 57 students for a class of 40, 17 of them with 0 sessions: typos and students of other groups that were only in the office's request list. A week later a \"faster\" version with std::unordered_map produced the same numbers in a different row order, and the nightly diff of the reports was 40 lines of noise.",
    },

    content: [
        h2("1. The incident"),
        p("The exam office keeps attendance per class: student id to number of sessions attended. Every Monday the faculty office sends a list of ids it wants checked, and the report warns about everyone below 3 sessions. The C version used two parallel arrays and a linear search. The C++ port replaced them with a `std::map` and looked much cleaner:"),
        code("cpp", String.raw`
// attendance_report.cpp - CS101 group 3, ported from C in 2026
std::map<std::string, int> attendance = load_attendance("CS101-G3");   // 40 students
std::vector<std::string> request = read_request("faculty-request.txt");  // 57 ids

for (const auto& id : request) {
    if (attendance[id] < 3) {
        warn(id, attendance[id]);
    }
}
export_csv("cs101-g3-attendance.csv", attendance);
std::println("class size: {}", attendance.size());`, "attendance_report.cpp"),
        p("The faculty office's list had 57 ids. 40 belonged to the group; the other 17 were typos (`RP-2024-0317` for `RP-2024-0137`) and students of other groups. The report warned about all 17 with \"0 sessions\", the exported CSV had 57 rows, and the last line said `class size: 57`. Two lecturers emailed to ask who the new students were."),
        p("A week later a colleague replaced `std::map` with `std::unordered_map` \"because hash maps are faster\" and fixed the typo problem separately. The numbers were right again, but the CSV rows came out in a different order than the week before - not sorted by id any more - and the nightly diff that compares this week's report with last week's showed every line as changed."),
        bullets([
            "**Reading a value changed the data.** `attendance[id]` is not a read: when `id` is missing, it inserts it.",
            "**Nothing failed.** The code compiles without a warning and runs without an error. The only symptom is wrong numbers.",
            "**The \"faster\" map changed the output.** `std::unordered_map` has no sorted order, and the export depended on one.",
        ]),

        h2("2. Reproduce it"),
        p("A small version with 5 students and 4 requested ids. Compiled with `g++ -std=c++23 -Wall -Wextra` (GCC 15); the output is below the code:"),
        code("cpp", String.raw`
#include <map>
#include <print>
#include <string>
#include <vector>

int main() {
    // CS101, group 3: sessions attended so far (5 students for this demo)
    std::map<std::string, int> attendance{
        {"RP-2024-0137", 9}, {"RP-2024-0142", 2}, {"RP-2024-0150", 11},
        {"RP-2024-0163", 1}, {"RP-2024-0171", 7},
    };
    std::println("class size before: {}", attendance.size());

    // ids sent by the faculty office: one typo, one student from another group
    std::vector<std::string> request{"RP-2024-0142", "RP-2024-0317", "RP-2024-0163", "RP-2023-0088"};
    for (const auto& id : request) {
        if (attendance[id] < 3) {
            std::println("WARNING {}: {} sessions", id, attendance[id]);
        }
    }
    std::println("class size after:  {}", attendance.size());

    for (const auto& [id, count] : attendance) {
        std::println("{},{}", id, count);
    }
}`, "repro.cpp"),
        code("text", `
class size before: 5
WARNING RP-2024-0142: 2 sessions
WARNING RP-2024-0317: 0 sessions
WARNING RP-2024-0163: 1 sessions
WARNING RP-2023-0088: 0 sessions
class size after:  7
RP-2023-0088,0
RP-2024-0137,9
RP-2024-0142,2
RP-2024-0150,11
RP-2024-0163,1
RP-2024-0171,7
RP-2024-0317,0`),
        p("Two ids that were never in the class are now in it, with 0 sessions, and they show up in the export. Now put the same 5 students into a `std::unordered_map<std::string, int>` (header `<unordered_map>`) and run only the CSV loop:"),
        code("text", `
RP-2024-0171,7
RP-2024-0150,11
RP-2024-0163,1
RP-2024-0142,2
RP-2024-0137,9`),
        p("Same data, same loop, different order. That is the nightly diff. The rest of the lesson explains both symptoms."),

        h2("3. std::map: keys kept in sorted order"),
        p("A **map** stores key/value pairs and finds a value by its key: here the key is the student id and the value is the number of sessions. Every key appears at most once. `std::map` (header `<map>`) keeps its entries **sorted by key**, using `<` on the key type - for `std::string`, that is character-by-character order. Inside, it is a balanced binary search tree: a lookup walks from the root down, so it costs **O(log n)** comparisons, and a loop over the map visits the keys in sorted order."),
        code("cpp", String.raw`
#include <map>
#include <print>
#include <string>

int main() {
    std::map<std::string, int> attendance;
    attendance["RP-2024-0150"] = 11;   // not there yet: inserted
    attendance["RP-2024-0137"] = 9;
    attendance["RP-2024-0142"] = 2;
    attendance["RP-2024-0150"] = 12;   // already there: overwritten
    for (const auto& [id, count] : attendance) {
        std::println("{} attended {}", id, count);
    }
    std::println("{} students", attendance.size());
}
// RP-2024-0137 attended 9
// RP-2024-0142 attended 2
// RP-2024-0150 attended 12
// 3 students`, "map_basics.cpp"),
        bullets([
            "**Each element is a `std::pair<const Key, Value>`.** The key is `const`: you can change the value of an entry, never its key, because that would break the sorted order. To \"rename\" a key, erase the entry and insert a new one.",
            "**`for (const auto& [id, count] : attendance)`** is a range-for with **structured bindings**: each pair is unpacked into two names. Without them you write `entry.first` and `entry.second`.",
            "**`const auto&`** avoids copying every string. Drop the `const` only when the loop changes the values (`for (auto& [id, count] : attendance) count = 0;`).",
            "**`std::println(\"{}\", attendance)`** prints the whole map in C++23: `{\"RP-2024-0137\": 9, \"RP-2024-0142\": 2, ...}`. Handy for debugging.",
        ]),
        p("In C you would have kept two arrays (`char ids[40][16]` and `int counts[40]`) and searched them with a loop and `strcmp`, or sorted them and used `bsearch`. `std::map` does the sorting, the searching and the memory for you."),

        h2("4. operator[] inserts"),
        p("`m[key]` returns a **reference to the value** for `key`. If the key is not in the map, `operator[]` first **inserts** it with a value-initialized value - `0` for `int`, `\"\"` for `std::string`, an empty vector for `std::vector` - and returns a reference to that new value. It has to: it returns a reference, and a reference must refer to something that exists. So `attendance[id] < 3` means \"insert `id` with 0 if it is missing, then compare\". In the incident it ran 57 times and inserted 17 ids."),
        image("missing-key-lookup", {
            alt: "Four panels. Top left, in red, titled attendance[\"RP-2024-0317\"]: a tree with 0142 : 2 at the root and 0137 : 9 and 0150 : 11 below it gains a new red node 0317 : 0 under 0150, with the note that operator[] on a missing key inserts it with int{} = 0 and the size goes from 3 to 4, a phantom student. Top right, in green, titled find(id) / contains(id): the same three-node tree stays unchanged; find(id) == end() and contains(id) == false, the size stays 3 and the report can say unknown. Bottom left, std::map, a sorted tree with O(log n) lookup: the keys 0137, 0142, 0150, 0163, 0171 in sorted order; a range-for always visits them in that order, so the nightly diff stays clean. Bottom right, std::unordered_map, hash buckets with average O(1): the same five keys iterate as 0171, 0150, 0163, 0142, 0137 with 13 buckets and as 0137, 0142, 0163, 0150, 0171 after rehash(64) in a real GCC 15 run; the order is unspecified and can change with inserts, rehashing or another library version.",
            caption: "operator[] adds a missing key; find and contains only look. std::map iterates in key order, std::unordered_map in an unspecified order.",
        }),
        h3("It does not compile on a const map"),
        p("Because `operator[]` may insert, it is not a `const` member function. A function that takes the map by `const&` - the right way to say \"I only read this\" - cannot call it:"),
        code("cpp", String.raw`
int sessions(const std::map<std::string, int>& attendance, const std::string& id) {
    return attendance[id];
}`, "constmap.cpp"),
        code("text", `
constmap.cpp: In function ‘int sessions(const std::map<std::__cxx11::basic_string<char>, int>&, const std::string&)’:
constmap.cpp:5:25: error: passing ‘const std::map<std::__cxx11::basic_string<char>, int>’ as ‘this’ argument discards qualifiers [-fpermissive]
    5 |     return attendance[id];
      |                         ^
/usr/include/c++/15/bits/stl_map.h:527:7: note:   in call to ‘std::map<_Key, _Tp, _Compare, _Alloc>::mapped_type& std::map<_Key, _Tp, _Compare, _Alloc>::operator[](const key_type&) [with ...]’`),
        p("\"Discards qualifiers\" means: you have a `const` map, and this function needs a non-const one. This error is a gift. The attendance report did all its work in one function on a non-const map, so nothing stopped the insert. Had the warning loop been a function taking `const std::map<...>&`, the bug would not have compiled. Do not \"fix\" the error by removing `const`; use a lookup that does not insert (next section)."),
        h3("When inserting is what you want: counting"),
        p("For counting, inserting 0 for a new key is exactly right, and `++m[key]` is the standard idiom:"),
        code("cpp", String.raw`
std::vector<std::string> checkins{"RP-2024-0142", "RP-2024-0137", "RP-2024-0142", "RP-2024-0150", "RP-2024-0142"};
std::map<std::string, int> per_student;
for (const auto& id : checkins) {
    ++per_student[id];   // inserting 0 for a new id IS what we want here
}
std::println("{}", per_student);
// {"RP-2024-0137": 1, "RP-2024-0142": 3, "RP-2024-0150": 1}`, "count.cpp"),
        p("The rule: use `m[key]` when you **mean** \"create it if it is missing\" - counting, grouping, building the map. For every question (\"is this id here? how many sessions does it have?\") use a lookup that leaves the map alone."),

        h2("5. Looking up without inserting"),
        p("Three ways, for three situations:"),
        code("cpp", String.raw`
std::map<std::string, int> attendance{{"RP-2024-0137", 9}, {"RP-2024-0142", 2}};

// 1. find: an iterator to the entry, or end() if there is none
if (auto it = attendance.find("RP-2024-0317"); it != attendance.end()) {
    std::println("found: {}", it->second);
} else {
    std::println("RP-2024-0317: unknown");
}

// 2. contains (C++20): only a yes/no answer
std::println("contains 0142: {}", attendance.contains("RP-2024-0142"));
std::println("size: {}", attendance.size());

// 3. at: the value, or an exception if the key is missing
try {
    std::println("{}", attendance.at("RP-2024-0317"));
} catch (const std::out_of_range& e) {
    std::println("out_of_range: {}", e.what());
}
std::println("size: {}", attendance.size());
// RP-2024-0317: unknown
// contains 0142: true
// size: 2
// out_of_range: map::at
// size: 2`, "lookup.cpp"),
        bullets([
            "**`find(key)`** returns an iterator. Compare it with `end()` before you use it; if it is valid, `it->first` is the key and `it->second` the value. Use it when you need the value **and** have to handle \"missing\". The `if (auto it = ...; condition)` form (C++17) keeps `it` inside the `if`/`else`.",
            "**`contains(key)`** (C++20) returns `bool`. Use it when the answer is only yes or no. Before C++20 people wrote `count(key) != 0`, which still works.",
            "**`at(key)`** returns a reference to the value, or throws `std::out_of_range` (header `<stdexcept>`) when the key is missing. With GCC's standard library `what()` is just `map::at` (`unordered_map::at` for the hash map) - it does not tell you which key. Use `at` when a missing key is a bug that should stop the program, not for normal \"not found\" cases.",
            "**All three work on a `const` map**, and none of them changes the size.",
        ]),
        callout("warning", "Do not look up twice",
            "if (attendance.contains(id)) use(attendance[id]); is correct, but it searches twice, and the [] still compiles only on a non-const map. When you need the value, call find once and use it->second."),

        h2("6. Inserting and erasing on purpose"),
        p("When you do want to change the map, say which kind of change you mean. Each insert function returns a pair: an iterator to the entry, and a `bool` that says whether a new entry was added. Structured bindings unpack it:"),
        code("cpp", String.raw`
// attendance: {"RP-2024-0137": 9, "RP-2024-0142": 2}
auto [it1, added1] = attendance.insert({"RP-2024-0137", 0});
std::println("insert 0137: added={} value={}", added1, it1->second);
auto [it2, added2] = attendance.try_emplace("RP-2024-0150", 11);
std::println("try_emplace 0150: added={} value={}", added2, it2->second);
auto [it3, added3] = attendance.insert_or_assign("RP-2024-0142", 3);
std::println("insert_or_assign 0142: added={} value={}", added3, it3->second);

std::println("erase 0150: {}", attendance.erase("RP-2024-0150"));
std::println("erase 0150 again: {}", attendance.erase("RP-2024-0150"));
// insert 0137: added=false value=9
// try_emplace 0150: added=true value=11
// insert_or_assign 0142: added=false value=3
// erase 0150: 1
// erase 0150 again: 0`, "insert_erase.cpp"),
        bullets([
            "**`insert({key, value})`** adds the pair only if the key is new. An existing value is **not** overwritten: `0137` keeps its 9 sessions.",
            "**`try_emplace(key, args...)`** does the same, but builds the value in place from `args`, and only if the key is new. Prefer it over `insert` for new code; `try_emplace(id)` alone adds `id` with a default value.",
            "**`insert_or_assign(key, value)`** always ends with `value` stored: it inserts or overwrites, and the `bool` tells you which happened. It says what `m[key] = value` does, but explicitly.",
            "**`erase(key)`** removes the entry and returns how many it removed: 1 or 0. Erasing a missing key is not an error.",
        ]),
        p("Erasing while you loop over the same map needs care - that is part of the lesson Iterators & invalidation bugs."),

        h2("7. std::unordered_map: a hash table"),
        p("`std::unordered_map` (header `<unordered_map>`) has almost the same interface: `operator[]`, `find`, `contains`, `at`, `insert`, `try_emplace`, `insert_or_assign`, `erase`, structured bindings. Everything in sections 4-6 applies to it unchanged - including `operator[]` inserting. What differs is how it stores the keys."),
        p("A **hash table** computes a number from each key with a **hash function** (`std::hash<std::string>` here) and uses it to pick a **bucket**. A lookup hashes the key and only compares the keys in that one bucket, so it costs **O(1) on average**, independent of the size. When the table gets too full, it allocates more buckets and moves every entry into its new bucket: a **rehash**."),
        p("The order of a loop over an unordered map is the order of the buckets, so the standard leaves it **unspecified**. It is not random - the same program with the same library and the same inserts gave the same order in every run here - but it is nothing you can rely on: it depends on the hash function, the bucket count and the history of inserts, so it can change after more inserts, after a rehash, or with another compiler or library version. Here are the same five students before and after a `rehash`:"),
        code("cpp", String.raw`
void dump(const std::unordered_map<std::string, int>& m) {
    for (const auto& [id, count] : m) std::print("{} ", id.substr(8));
    std::println("({} buckets)", m.bucket_count());
}

int main() {
    std::unordered_map<std::string, int> attendance{
        {"RP-2024-0137", 9}, {"RP-2024-0142", 2}, {"RP-2024-0150", 11},
        {"RP-2024-0163", 1}, {"RP-2024-0171", 7},
    };
    dump(attendance);
    attendance.rehash(64);
    dump(attendance);
}
// 0171 0150 0163 0142 0137 (13 buckets)
// 0137 0142 0163 0150 0171 (67 buckets)`, "unordered_order.cpp"),
        p("Nothing about the data changed, only the number of buckets. That is why the nightly export changed when the type changed, and why it could change again next term when the class grows and the table rehashes. If you need sorted output from an unordered map, copy the pairs into a `std::vector` and sort it (see STL algorithms: sort, find, accumulate) - or keep a `std::map`."),
        h3("Which one to pick"),
        bullets([
            "**`std::map`** when the order of the keys matters: sorted reports and exports, \"first/last id\", ranges of keys (`lower_bound`, `upper_bound`), stable diffs. O(log n) per operation; the key needs `<`.",
            "**`std::unordered_map`** when you only look up by exact key and never need an order: caches, indexes from id to record, \"have I seen this?\". Average O(1); the key needs `std::hash` and `==` (built in for `std::string` and the integer types).",
            "**For a class of 40 or a college of 20,000, both are fast.** A lookup in a `std::map` of 20,000 keys walks a tree of about 15-30 levels. Pick by the behaviour you need - order or no order - and measure before you switch \"for speed\".",
        ]),
        p("**Sets** are the same two designs without a value: `std::set<std::string>` keeps unique keys sorted, `std::unordered_set<std::string>` keeps unique keys in a hash table. They answer \"is this id in the group?\" and remove duplicates. `insert` returns the same `{iterator, bool}` pair as the maps, and the `bool` is `false` when the key was already there - an easy way to notice a duplicate. A set can also be the **value** of a map: `std::map<std::string, std::set<std::string>>` maps a course code to the unique ids enrolled in it."),
        challenge("chal_quiz_cppf_321", "For each call, ask: can it insert? Only operator[] (and the insert functions) add keys; find, contains and at never do. For each container, ask: does this job need the keys in order?"),

        h2("8. The fix"),
        p("The warning loop becomes a function that takes the map by `const&`, so the compiler guarantees it only reads, and it answers ids that are not in the class explicitly instead of inventing them. The container stays a `std::map`, because the export must be sorted by id:"),
        code("cpp", String.raw`
#include <map>
#include <print>
#include <string>
#include <vector>

// Read-only: the report can no longer change the class, and the compiler checks it.
void warn_low_attendance(const std::map<std::string, int>& attendance,
                         const std::vector<std::string>& request) {
    for (const auto& id : request) {
        auto it = attendance.find(id);
        if (it == attendance.end()) {
            std::println("SKIP {}: not in this class", id);
        } else if (it->second < 3) {
            std::println("WARNING {}: {} sessions", id, it->second);
        }
    }
}

int main() {
    std::map<std::string, int> attendance{
        {"RP-2024-0137", 9}, {"RP-2024-0142", 2}, {"RP-2024-0150", 11},
        {"RP-2024-0163", 1}, {"RP-2024-0171", 7},
    };
    std::vector<std::string> request{"RP-2024-0142", "RP-2024-0317", "RP-2024-0163", "RP-2023-0088"};
    warn_low_attendance(attendance, request);
    std::println("class size: {}", attendance.size());
    for (const auto& [id, count] : attendance) {   // std::map: always sorted by id
        std::println("{},{}", id, count);
    }
}`, "attendance_report.cpp"),
        code("text", `
WARNING RP-2024-0142: 2 sessions
SKIP RP-2024-0317: not in this class
WARNING RP-2024-0163: 1 sessions
SKIP RP-2023-0088: not in this class
class size: 5
RP-2024-0137,9
RP-2024-0142,2
RP-2024-0150,11
RP-2024-0163,1
RP-2024-0171,7`),
        numbered([
            "**`find` instead of `[]`.** One search, the value through `it->second`, and \"missing\" is handled instead of turned into 0.",
            "**`const std::map<...>&` parameter.** Writing `attendance[id]` in this function is now a compile error, so the bug cannot come back unnoticed.",
            "**Unknown ids are reported, not hidden.** The faculty office learns that `RP-2024-0317` is a typo instead of seeing a student with 0 sessions.",
            "**`std::map` for the export.** The CSV is sorted by id on every run, so the nightly diff only shows real changes.",
        ]),

        h2("9. Your turn"),
        p("Write the full attendance report from the raw card scans: count sessions per student (a card scanned twice in one session counts once), answer the faculty office's queries without adding anyone, and list the class sorted by id. The starter file has the input format, the rules and an example."),
        challenge("chal_coding_cppf_322", "Put every student of the class list into the container first. After that, nothing may add a key: check membership before you count a scan or answer a query. Think about which container gives you the sorted list for free, and which one remembers \"already seen in this session\"."),

        h2("10. Pitfalls"),
        bullets([
            "**`m[key]` to read a value**: inserts the key with 0 or \"\" when it is missing; `size()`, loops and exports now include it. Use `find`, `contains` or `at`.",
            "**Removing `const` to make `m[key]` compile**: the error was right. Keep the `const&` parameter and use `find`.",
            "**`contains(key)` followed by `m[key]`**: two searches, and it does not compile on a const map. Use one `find`.",
            "**Expecting `at()` to tell you the key**: `what()` is only `map::at` with GCC. Catch it close to the call and add the key to your own message, or use `find`.",
            "**Relying on the order of an `unordered_map`**: unspecified; it changes with rehashing, more inserts or a new library version. Sort a copy, or use `std::map`.",
            "**Switching to `unordered_map` \"for speed\" without measuring**: for small maps the difference is rarely visible, and you lose the order.",
            "**Expecting `insert` to overwrite**: it keeps the existing value. Use `insert_or_assign` (or `m[key] = value`) to overwrite.",
        ]),

        h2("11. Checklist"),
        bullets([
            "`m[key]` appears only where inserting is intended: counting (`++m[key]`), grouping, filling the map.",
            "Every question about a key uses `find` (need the value), `contains` (yes/no) or `at` (missing is a bug).",
            "Functions that only read a map take it as `const std::map<K, V>&` or `const std::unordered_map<K, V>&`.",
            "Any output whose order matters - reports, CSV exports, test expectations - comes from a `std::map` or a sorted copy.",
            "`std::unordered_map` is chosen for exact-key lookups where order never matters, not by habit.",
            "Inserts say what they mean: `try_emplace` for \"add if new\", `insert_or_assign` for \"set\".",
            "Loops over maps use `for (const auto& [key, value] : m)`.",
        ]),
    ],
});
