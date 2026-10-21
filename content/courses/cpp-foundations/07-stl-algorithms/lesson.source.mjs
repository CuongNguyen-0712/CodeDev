// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases and the solution live in challenges.json and challenges/ (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cppf-3-1",
    title: "STL algorithms: sort, find, accumulate",
    slug: { _type: "slug", current: "cpp-stl-algorithms-sort-find-accumulate" },
    description:
        "The scholarship ranking ported from C to C++ gave the Riverside Polytechnic merit scholarship to the wrong student: std::accumulate with an init value of 0 turned a 9.25 average into 8.00, and the comparator used >=. Learn iterator pairs and lambdas, std::find, std::find_if and std::count_if, std::accumulate and std::ranges::fold_left and why the init value decides the type, std::max_element and std::transform, and how to sort with std::sort and std::ranges::sort: strict weak ordering, descending order, tie-breakers, std::stable_sort and projections.",
    estimatedTime: 25,

    scenario: {
        role: "Junior developer in the exam office IT team at Riverside Polytechnic, Hồ Chí Minh City",
        problem:
            "The new C++23 scholarship ranking gave the cohort's only merit scholarship to Lê Thị Hồng (average 9.00). Nguyễn Văn An, whose transcript says 9.25, came second with 8.00 - every average in the report was a whole number. A debug build of the same tool then refused to run at all and aborted inside std::sort.",
    },

    content: [
        h2("1. The incident"),
        p("Every September the exam office ranks each cohort by average score and gives the **Riverside merit scholarship** to the first student of the list. The ranking tool was a 2010 C program built around `qsort`. This year it was the first tool ported to C++23, and the port looked clean: a `Student` struct, a `std::vector`, two STL algorithms instead of thirty lines of hand-written loops."),
        code("cpp", String.raw`
struct Student {
    std::string id;
    std::string name;
    std::vector<double> scores;
    double average = 0.0;
};

void rank_cohort(std::vector<Student>& cohort) {
    for (Student& s : cohort)
        s.average = std::accumulate(s.scores.begin(), s.scores.end(), 0) / s.scores.size();

    std::sort(cohort.begin(), cohort.end(),
              [](const Student& a, const Student& b) { return a.average >= b.average; });
}`, "ranking.cpp"),
        p("It compiled with `-Wall -Wextra` and no warnings. The report went to the dean, the scholarship letter went to **Lê Thị Hồng** (four 9s, average 9.00), and two weeks later **Nguyễn Văn An** came to the office with his transcript: 9.5, 9.5, 9.5 and 8.5, average **9.25**. The transcript tool, still the old C code, was right. The new ranking had printed his average as **8.00**."),
        bullets([
            "**Every average in the report was a whole number**: 9.00, 8.00, 8.00, 7.00. Nobody noticed, because whole numbers look like normal scores.",
            "**Students with the same (wrong) average came out in an order nobody chose.** An and Phạm Minh Khoa both showed 8.00, and Khoa was listed first.",
            "**A debug build aborted.** When a colleague rebuilt the tool with the library's debug checks turned on, it stopped inside `std::sort` before printing anything.",
        ]),
        p("Two bugs, one per algorithm: the third argument of `std::accumulate`, and the comparator passed to `std::sort`. This lesson is about how those algorithms work, so that neither bug can get past you."),

        h2("2. Reproduce it"),
        p("Three students from the cohort, the shipped code, nothing else. Build with `g++ -std=c++23 -Wall -Wextra repro.cpp` (g++ 15.2); the comments show the real output:"),
        code("cpp", String.raw`
#include <algorithm>
#include <numeric>
#include <print>
#include <string>
#include <vector>

struct Student {
    std::string id;
    std::string name;
    std::vector<double> scores;
    double average = 0.0;
};

int main() {
    std::vector<Student> cohort = {
        {"RP-2024-0137", "Nguyễn Văn An", {9.5, 9.5, 9.5, 8.5}},
        {"RP-2024-0052", "Lê Thị Hồng", {9, 9, 9, 9}},
        {"RP-2024-0219", "Phạm Minh Khoa", {8.5, 8.5, 9, 9}},
    };
    for (Student& s : cohort)
        s.average = std::accumulate(s.scores.begin(), s.scores.end(), 0) / s.scores.size();

    std::sort(cohort.begin(), cohort.end(),
              [](const Student& a, const Student& b) { return a.average >= b.average; });

    for (int rank = 1; const Student& s : cohort)
        std::println("{}. {} {} {:.2f}", rank++, s.id, s.name, s.average);
}
// 1. RP-2024-0052 Lê Thị Hồng 9.00
// 2. RP-2024-0219 Phạm Minh Khoa 8.00
// 3. RP-2024-0137 Nguyễn Văn An 8.00`, "repro.cpp"),
        p("An's real average is 9.25 and Khoa's is 8.75; both print 8.00. Now build the same file with `-D_GLIBCXX_DEBUG`, which switches libstdc++ (the standard library that comes with g++) into a checking mode:"),
        code("text", String.raw`
$ g++ -std=c++23 -Wall -Wextra -g -D_GLIBCXX_DEBUG repro.cpp && ./a.out
/usr/include/c++/15/bits/stl_algo.h:4872:
In function:
    constexpr void std::sort(_RAIter, _RAIter, _Compare) [with ...]

Error: comparison doesn't meet irreflexive requirements, assert(!(a < a)).
...
Aborted (core dumped)`),
        p("The debug library called the comparator with the **same** student on both sides, got `true`, and stopped. \"Irreflexive\" means a value must never be ordered before itself. `a.average >= b.average` breaks that rule for every student. That is not a style issue: passing such a comparator to `std::sort` is **undefined behaviour**. With three students the normal build happened to print a list; with a bigger cohort and many equal averages, the sort is allowed to do anything, including reading past the end of the vector."),

        h2("3. Iterator pairs and lambdas"),
        p("Almost every classic algorithm takes a **pair of iterators** `first, last`. An iterator is a position in a container: `v.begin()` is the first element and `v.end()` is **one past the last** element, not the last one. The pair describes the half-open range `[first, last)`: `first` is included, `last` is not. So `std::sort(v.begin(), v.end())` sorts everything, `std::sort(v.begin(), v.begin() + 3)` sorts only the first three elements, and an empty range is simply `first == last`. The lesson on iterators and invalidation bugs goes deeper; for now, `begin()` and `end()` are all you need."),
        p("The `std::ranges::` versions (C++20) take the whole container instead of two iterators: `std::ranges::sort(v)`. They cannot be given the begin of one vector and the end of another by mistake, and they accept **projections** (section 6). Both forms are in `<algorithm>`."),
        h3("Lambdas"),
        p("Many algorithms take a function that decides something: which element to find, how to compare two elements. You usually write it in place, as a **lambda**: `[captures](parameters) { body }`. The square brackets say which local variables the lambda may use:"),
        code("cpp", String.raw`
std::vector<double> cs101 = {7.5, 4.0, 9.0, 3.5, 6.0, 4.5};
double pass_mark = 5.0;

// [pass_mark]: the lambda gets its own copy of pass_mark (capture by value)
auto failed = std::ranges::count_if(cs101, [pass_mark](double x) { return x < pass_mark; });
std::println("{}", failed);   // 3

// [&seen]: the lambda uses the caller's variable itself (capture by reference)
int seen = 0;
std::ranges::for_each(cs101, [&seen](double) { ++seen; });
std::println("{}", seen);     // 6`, "lambdas.cpp"),
        bullets([
            "**Capture by value** (`[pass_mark]`) copies the variable when the lambda is created. Use it for small read-only values such as thresholds.",
            "**Capture by reference** (`[&seen]`) lets the lambda change the caller's variable. The variable must still be alive when the lambda runs, which is always true when you pass the lambda straight to an algorithm.",
            "**`[=]` and `[&]`** capture everything that is used, by value or by reference. Naming each variable is clearer in a code review.",
            "**`[]`** captures nothing. Comparators usually look only at their two parameters, so they start with `[]`.",
        ]),

        h2("4. Finding and counting"),
        p("`std::find` looks for a value, `std::find_if` for the first element that makes a predicate (a function returning `bool`) true. Both return an **iterator**, and when nothing matches they return `end()`. That is the answer \"not found\", so every search is followed by a check:"),
        code("cpp", String.raw`
std::vector<std::string> ids = {"RP-2024-0137", "RP-2024-0052", "RP-2024-0219"};

auto it = std::ranges::find(ids, "RP-2024-0052");
if (it != ids.end())
    std::println("found at index {}", it - ids.begin());    // found at index 1

auto missing = std::find(ids.begin(), ids.end(), "RP-2024-9999");
std::println("{}", missing == ids.end());                   // true

auto first_fail = std::ranges::find_if(cs101, [pass_mark](double x) { return x < pass_mark; });
if (first_fail != cs101.end())
    std::println("first fail: {} at index {}", *first_fail, first_fail - cs101.begin());
// first fail: 4 at index 1`, "find.cpp"),
        p("`it - ids.begin()` turns the iterator into an index. `*it` reads the element - but only after the check. Reading through `end()` is undefined behaviour, because there is no element there. With `-D_GLIBCXX_DEBUG`, `std::println(\"{}\", *missing);` stops the program:"),
        code("text", String.raw`
/usr/include/c++/15/debug/safe_iterator.h:352:
...
Error: attempt to dereference a past-the-end iterator.
...
Aborted (core dumped)`),
        p("In a normal build nothing checks it, and what you get may differ from run to run. Build your tests with `-D_GLIBCXX_DEBUG` from time to time: it turns many silent bugs like this into a clear message."),
        p("The ranges versions can also search by one member of a struct. The third argument is a **projection**: the algorithm compares `s.id`, not the whole `Student`:"),
        code("cpp", String.raw`
auto an = std::ranges::find(cohort, "RP-2024-0137", &Student::id);
if (an != cohort.end())
    std::println("{}", an->name);   // Nguyễn Văn An`),
        p("`std::count` and `std::count_if` answer \"how many?\" with the same arguments, as shown in the lambda example above. They return a signed count (`std::ptrdiff_t`, a `long` on 64-bit Linux), not a `bool` and not an iterator."),

        h2("5. Adding up: std::accumulate and its init value"),
        p("`std::accumulate` lives in `<numeric>`, not `<algorithm>`. It takes a range and an **initial value**, and works like this loop:"),
        code("cpp", String.raw`
T sum = init;                   // T is the type of init - not the type of the elements
for (auto x : range) sum = sum + x;
return sum;`),
        p("The type of the third argument decides the type of every partial sum and of the result. `0` is an `int`, so `sum + x` is computed as a `double` and then **stored back into an int**, which throws away the fraction - at every step. `0.0` is a `double`, and nothing is lost:"),
        code("cpp", String.raw`
#include <numeric>

std::vector<double> scores = {9.5, 9.5, 9.5, 8.5};
auto wrong = std::accumulate(scores.begin(), scores.end(), 0);     // int
auto right = std::accumulate(scores.begin(), scores.end(), 0.0);   // double
std::println("{} {}", wrong, right);                                // 35 37
std::println("{} {}", wrong / scores.size(), right / scores.size()); // 8 9.25`, "accumulate.cpp"),
        image("accumulate-init-type", {
            alt: "Top row, in red: std::accumulate(b, e, 0) on the scores 9.5, 9.5, 9.5, 8.5. The init box holds 0, type int. Each step box shows the addition and what is kept: 0 + 9.5 = 9.5 kept as 9, 9 + 9.5 = 18.5 kept as 18, 18 + 9.5 = 27.5 kept as 27, 27 + 8.5 = 35.5 kept as 35. The result box shows 35 / 4 = 8: int divided by size_t gives 8.00. Middle row, in green: std::accumulate(b, e, 0.0) with init 0.0 of type double: 0.0 + 9.5 = 9.5, 9.5 + 9.5 = 19.0, 19.0 + 9.5 = 28.5, 28.5 + 8.5 = 37.0, and 37.0 / 4 = 9.25. Bottom panel: a comparator answers whether a must come before b. First key: average, higher first, using > and never >=. Second key, only when averages are equal: id, smaller first. Without a second key std::sort may put equal students in any order. An example turns the input order RP-2024-0311 8.75, RP-2024-0137 9.25, RP-2024-0219 8.75 into 1. RP-2024-0137 9.25, 2. RP-2024-0219 8.75, 3. RP-2024-0311 8.75.",
            caption: "The init value is the accumulator: an int init truncates every partial sum. Equal averages need a second sort key.",
        }),
        p("The last line has a second trap: `wrong / scores.size()` divides an `int` by a `std::size_t`, which is **integer division** - 35 / 4 is 8, not 8.75. In the incident both happened, which is why every average came out whole. With a `double` sum, `sum / scores.size()` is a floating-point division and gives 9.25."),
        callout("warning", "No warning for the int init",
            "g++ 15 with -Wall -Wextra compiles std::accumulate(scores.begin(), scores.end(), 0) on a vector of double without a single warning: the narrowing happens inside a standard header. Read the third argument of every accumulate call in code review - it must have the type you want the result to have (0.0 for doubles, 0LL for large integer totals)."),
        h3("C++23: std::ranges::fold_left"),
        p("C++23 adds `std::ranges::fold_left` in `<algorithm>`: a range, an initial value and the operation. It picks the accumulator type from the **result** of the operation, not from the init value alone:"),
        code("cpp", String.raw`
auto a = std::ranges::fold_left(scores, 0, std::plus{});       // int + double -> double
auto b = std::ranges::fold_left(scores, 0, std::plus<int>{});  // forced to int
std::println("{} {}", a, b);                                   // 37 35`, "fold.cpp"),
        p("`std::plus{}` adds whatever it is given, `int + double` is a `double`, so `a` is a `double` (a `static_assert` with `std::same_as<decltype(a), double>` compiles). That makes `fold_left` safer than `accumulate`, but writing `0.0` is still the clearest way to say what you mean."),
        h3("Largest, smallest, and transforming"),
        p("`std::ranges::max_element` and `min_element` return an **iterator** to the largest or smallest element (the first one if several are equal), or `end()` for an empty range - check it like a `find` result. With a projection they compare one member:"),
        code("cpp", String.raw`
std::vector<Student> cohort = {
    {"RP-2024-0219", "Phạm Minh Khoa", {}, 8.75},
    {"RP-2024-0137", "Nguyễn Văn An", {}, 9.25},
    {"RP-2024-0052", "Lê Thị Hồng", {}, 9.00},
    {"RP-2024-0311", "Võ Thị Lan", {}, 8.75},
};
auto best = std::ranges::max_element(cohort, {}, &Student::average);
if (best != cohort.end())
    std::println("{} {:.2f}", best->name, best->average);   // Nguyễn Văn An 9.25

std::vector<double> averages;
std::ranges::transform(cohort, std::back_inserter(averages), &Student::average);
std::println("{}", averages);                               // [8.75, 9.25, 9, 8.75]`, "minmax.cpp"),
        p("The `{}` before the projection means \"the default comparison\" (`std::ranges::less`). `std::ranges::transform` calls a function on each element and writes the results to an output position; `std::back_inserter(averages)` (from `<iterator>`) appends each one to the vector."),

        h2("6. Sorting"),
        p("`std::sort(first, last)` and `std::ranges::sort(v)` sort in place, smallest first, using `<`. To sort in another order, pass a **comparator**: a function `comp(a, b)` that returns `true` when `a` must come **before** `b`:"),
        code("cpp", String.raw`
std::vector<double> v = {7.5, 9.0, 4.0, 8.5};
std::ranges::sort(v);
std::println("{}", v);                            // [4, 7.5, 8.5, 9]
std::ranges::sort(v, std::ranges::greater{});     // descending
std::println("{}", v);                            // [9, 8.5, 7.5, 4]
std::sort(v.begin(), v.end(), std::greater<>{});  // the same with iterators`, "sort.cpp"),
        h3("Strict weak ordering: never <= or >="),
        p("The comparator must be a **strict weak ordering**. In practice that means three rules:"),
        numbered([
            "**`comp(a, a)` is always false.** Nothing comes before itself. `<=` and `>=` break this rule for every element - that is what the debug build caught in section 2.",
            "**If `comp(a, b)` is true, `comp(b, a)` is false.** Two elements cannot both come first.",
            "**It is transitive.** If `a` comes before `b` and `b` before `c`, then `a` comes before `c`; and elements that are \"equal\" (neither comes first) form consistent groups.",
        ]),
        p("Implementations rely on these rules; libstdc++'s `std::sort`, for example, skips bounds checks in its inner loops because a valid comparator guarantees it stops in time. A comparator that breaks them is undefined behaviour - not a slightly different order. For descending order, write `>` (or `std::ranges::greater{}`), never `>=`."),
        h3("Tie-breakers"),
        p("When two elements are equal under the comparator, `std::sort` may put them in **any** order. It is not random, but it is not the input order either, and it can change when the input or the library changes. Here are 20 rows whose averages alternate between 9 and 8, with ids 00 to 19 in input order:"),
        code("cpp", String.raw`
auto by_average_desc = [](const Row& x, const Row& y) { return x.average > y.average; };
auto r1 = rows, r2 = rows;
std::sort(r1.begin(), r1.end(), by_average_desc);
std::stable_sort(r2.begin(), r2.end(), by_average_desc);
// std::sort:        00 02 18 04 06 16 08 10 14 12 19 17 15 13 11 09 07 05 03 01
// std::stable_sort: 00 02 04 06 08 10 12 14 16 18 01 03 05 07 09 11 13 15 17 19`, "ties.cpp"),
        p("Both results are correctly sorted by average. Only the order **inside** each group of equal averages differs. With three or four students the order of equal elements often survives `std::sort` - which is exactly why the bug hides in small tests. If the order of ties matters (and for a scholarship it does), say so in the comparator: compare the first key, and only when it is equal, compare the second key. The same pattern sorts an enrolment list by course, then by student id:"),
        code("cpp", String.raw`
struct Enrolment {
    std::string course;
    std::string id;
};

std::vector<Enrolment> list = {
    {"CS102", "RP-2024-0219"}, {"CS101", "RP-2024-0137"}, {"CS102", "RP-2024-0052"},
    {"MA101", "RP-2024-0311"}, {"CS101", "RP-2024-0052"},
};
std::ranges::sort(list, [](const Enrolment& x, const Enrolment& y) {
    if (x.course != y.course) return x.course < y.course;   // 1st key
    return x.id < y.id;                                     // 2nd key, only for the same course
});
// CS101/RP-2024-0052 CS101/RP-2024-0137 CS102/RP-2024-0052 CS102/RP-2024-0219 MA101/RP-2024-0311`, "enrolment.cpp"),
        p("Each key can go in its own direction: `>` for a key sorted high to low, `<` for one sorted low to high. A comparator built this way is still strict: for an element and itself, both comparisons are false."),
        h3("std::stable_sort"),
        p("`std::stable_sort` (and `std::ranges::stable_sort`) guarantees that equal elements keep their **input order**, as the second line of the ties example shows. That gives another way to sort by two keys: sort by the second key first, then stable-sort by the first key. It does two passes and uses extra memory, so a single comparator with a tie-breaker is the usual choice - but stable sorting is the right tool when the input order itself is meaningful, for example the order in which applications arrived."),
        h3("Projections"),
        p("The ranges algorithms take a projection after the comparator, so sorting a struct by one member needs no lambda at all:"),
        code("cpp", String.raw`
std::ranges::sort(cohort, {}, &Student::id);                         // by id, ascending
std::ranges::sort(cohort, std::ranges::greater{}, &Student::average); // by average, descending
std::ranges::sort(cohort, {}, &Student::name);                       // by name - see the warning`),
        callout("warning", "Sorting Vietnamese names",
            "std::string compares bytes. In UTF-8, Đ is the two bytes 0xC4 0x90, which are larger than every ASCII letter, so sorting by name puts \"Đặng Hải Yến\" after \"Võ Thị Lan\". That is fine for a stable, repeatable order (for example a tie-breaker), but it is not Vietnamese alphabetical order. Ids are plain ASCII and sort correctly, which is one more reason to break ties by id."),
        p("A projection sorts by **one** key only. For a ranking with a tie-breaker you still need either a comparator that looks at both keys or the two-pass stable sort."),
        challenge("chal_coding_cppf_311", "Three small functions: get the sum's type right before you divide, give the comparator a second key for equal averages (and check it is false for a student compared with itself), and read the threshold rule carefully - \"at least\" includes the threshold."),

        h2("7. The fix"),
        p("Two changes in `ranking.cpp`, one per bug:"),
        code("cpp", String.raw`
void rank_cohort(std::vector<Student>& cohort) {
    for (Student& s : cohort)
        s.average = std::accumulate(s.scores.begin(), s.scores.end(), 0.0) / s.scores.size();

    // Rule 4.2 of the scholarship regulations: equal averages are ranked by student id.
    std::ranges::sort(cohort, {}, &Student::id);
    std::ranges::stable_sort(cohort, std::ranges::greater{}, &Student::average);
}
// 1. RP-2024-0137 Nguyễn Văn An 9.25
// 2. RP-2024-0052 Lê Thị Hồng 9.00
// 3. RP-2024-0219 Phạm Minh Khoa 8.75`, "ranking.cpp"),
        numbered([
            "**`0.0` instead of `0`.** The sum is a `double` from the first step, and `double / std::size_t` is a floating-point division. An's average is 9.25 again.",
            "**No comparator with `>=`.** `std::ranges::greater{}` is a strict `>`, so the debug build no longer aborts.",
            "**The tie rule is written down in code.** The tool now sorts by id first and then stable-sorts by average, so students with equal averages always come out by id - whatever order the enrolment file had. A single comparator with a tie-breaker, as in section 6, is an equally good fix.",
            "**A test with equal averages and a non-integer average.** The exam office added a cohort file where two students tie and one has a 9.25, and the CI build runs it with `-D_GLIBCXX_DEBUG`.",
        ]),
        p("The scholarship went to Nguyễn Văn An. The exam office also re-ran the ranking for every cohort processed by the new tool; two more classes had a different first place."),

        h2("8. Pitfalls"),
        bullets([
            "**`std::accumulate(..., 0)` on doubles**: an `int` accumulator, the fraction is dropped at every step, and there is no warning. Use `0.0`.",
            "**`int` or `double` divided by `size()`**: an `int` sum divided by `std::size_t` is integer division. Make the sum a `double` first.",
            "**Average of an empty vector**: `accumulate` returns the init value, and `0.0 / 0` is not a number: in our g++ 15 run on x86-64, `std::println` printed `-nan`. Check `empty()` first when the data can be empty.",
            "**`<=` or `>=` in a comparator**: not a strict weak ordering, undefined behaviour in `std::sort`. Use `<` or `>`.",
            "**No tie-breaker**: equal elements come out in an unspecified order that small tests do not reveal. Add a second key, or use `std::stable_sort` when the input order is the rule.",
            "**Using the result of `find`, `find_if` or `max_element` without comparing it to `end()`**: reading through `end()` is undefined behaviour.",
            "**Forgetting `#include <numeric>`**: `std::accumulate` is not in `<algorithm>`.",
            "**Mixing ranges**: `std::sort(a.begin(), b.end())` with two different vectors compiles. The `std::ranges::` forms take one container and cannot get this wrong.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Every `std::accumulate` has an init value of the result type: `0.0` for doubles.",
            "Averages are computed with a floating-point division and printed with an explicit precision such as `{:.2f}`.",
            "Every comparator uses `<` or `>` and returns `false` for an element compared with itself.",
            "Every sort whose tie order matters has a tie-breaker in the comparator, or uses `std::stable_sort` on purpose.",
            "Every `find`, `find_if`, `max_element` and `min_element` result is compared to `end()` before it is used.",
            "Predicates and comparators are lambdas next to the call; captures are named (`[threshold]`, `[&count]`).",
            "Tests include equal values, a non-integer average and an empty or one-element input, and run once with `-D_GLIBCXX_DEBUG`.",
        ]),
    ],
});
