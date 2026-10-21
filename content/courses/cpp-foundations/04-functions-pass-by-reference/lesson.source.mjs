// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cppf-2-1",
    title: "Functions, overloading & pass-by-reference bugs",
    slug: { _type: "slug", current: "cpp-functions-overloading-pass-by-reference" },
    description:
        "The first C++ transcripts from Riverside Polytechnic kept every student's lowest CS101 quiz score, although the rule says it is dropped, and the scholarship ranking job slowed to about a quarter of an hour - both because functions received copies of vectors. Learn declarations and definitions, how to choose between passing by value, by reference and by const reference, how to return several results with a struct and structured bindings, how the compiler picks an overload (and when it refuses), and how default arguments work.",
    estimatedTime: 20,

    scenario: {
        role: "Junior developer in the exam office of Riverside Polytechnic, Hồ Chí Minh City, porting the 2010 C tools to C++23",
        problem:
            "The CS101 rule is \"best 3 of 4 quizzes\": the lowest quiz score is dropped before the average goes on the transcript. The new C++ transcript tool calls drop_lowest() for every student, the function erases the lowest score, and its own debug line says 3 scores are left - yet every transcript still averages all 4. In the same release, the scholarship ranking job, which looks up each of the 40,000 student records by id, went from finishing in seconds to running for about a quarter of an hour. Nothing crashed and the compiler printed no warning.",
    },

    content: [
        h2("1. The incident"),
        p("The exam office's C code passed a pointer and a length to every function: `void drop_lowest(double *scores, int *count)`. The port replaced those with `std::vector`, which was the right idea - and wrote the parameters the way you would write them in C for an `int`:"),
        code("cpp", String.raw`
// transcript.cpp - the first C++ release
void drop_lowest(std::vector<double> scores) {
    auto lowest = std::ranges::min_element(scores);
    scores.erase(lowest);
}

double course_average(std::vector<double> quiz) {
    drop_lowest(quiz);                       // "best 3 of 4"
    double sum = 0;
    for (double q : quiz) sum += q;
    return sum / quiz.size();
}

// ranking.cpp - called once for each of the 40,000 students
std::string find_name(std::vector<Student> all, const std::string& id) {
    for (const Student& s : all)
        if (s.id == id) return s.name;
    return "";
}`, "transcript.cpp"),
        p("Two weeks after the release, Nguyễn Thị Phương Thảo (`RP-2024-0137`) asked why her CS101 average was 7.25. Her quiz scores were 8.5, 7.0, 9.0 and 4.5; with the lowest dropped, the average is 8.17, which rounds to 8.2. Every transcript printed since the release had the same mistake. At the same time, the ranking job started to miss its 07:00 deadline."),
        bullets([
            "**`drop_lowest` worked perfectly - on its own copy.** `std::vector<double> scores` is a new vector, filled with copies of the caller's scores. The erase happened, and the copy was destroyed when the function returned.",
            "**`find_name` was correct but expensive.** `std::vector<Student> all` copies all 40,000 records - every id, every name, every score list - on every single call, only to read them.",
            "**The compiler had no reason to warn.** Both functions are valid C++. Passing by value is what you asked for when the parameter has no `&`.",
        ]),

        h2("2. Reproduce it"),
        p("Save this as `repro.cpp` and build it with `g++ -std=c++23 -Wall -Wextra repro.cpp` (g++ 15.2). The comments show the real output:"),
        code("cpp", String.raw`
#include <algorithm>
#include <print>
#include <vector>

void drop_lowest(std::vector<double> scores) {
    auto lowest = std::ranges::min_element(scores);
    scores.erase(lowest);
    std::println("  inside drop_lowest: {} scores", scores.size());
}

int main() {
    std::vector<double> quiz = {8.5, 7.0, 9.0, 4.5};   // RP-2024-0137, CS101
    drop_lowest(quiz);
    std::println("after drop_lowest: {} scores {}", quiz.size(), quiz);
}
// Output:
//   inside drop_lowest: 3 scores
// after drop_lowest: 4 scores [8.5, 7, 9, 4.5]`, "repro.cpp"),
        p("Inside the function there are 3 scores; back in `main` there are 4 again. No warning, even with `-Wall -Wextra`. (`std::println` prints a vector directly in C++23, and `{}` prints 7.0 as `7`.)"),
        p("For the ranking job, we built 40,000 `Student` records (an id, a Vietnamese name, 12 scores) and timed 200 lookups with each version of `find_name`, compiled with `-O2`:"),
        code("text", String.raw`
by value: 24.189 ms per lookup
by const&: 0.867 ms per lookup`, "lookup.cpp output"),
        p("The only difference between the two functions is the parameter type: `std::vector<Student> all` against `const std::vector<Student>& all`. At 24 ms per lookup, 40,000 lookups take about 960 seconds - 16 minutes - and almost all of it is spent copying strings and vectors that are thrown away immediately. Your numbers will differ with the machine; the ratio of roughly 28 to 1 is the point. (Even 0.867 ms is a scan through 40,000 records; the lesson **std::map vs std::unordered_map** makes the lookup itself fast.)"),

        h2("3. Declarations, definitions and default arguments"),
        p("Before choosing parameter types, one rule about where functions go in a file. C++ compiles a file from top to bottom, and a name must be **declared** before it is used. A **declaration** tells the compiler the function's name, parameter types and return type. A **definition** is a declaration with the body. If `main` comes first and calls a function defined below it, g++ stops:"),
        code("cpp", String.raw`
int main() {
    std::vector<double> quiz = {8.5, 7.0, 9.0};
    std::println("{}", average(quiz));
}

double average(const std::vector<double>& scores) { /* ... */ }

// decl.cpp:6:24: error: ‘average’ was not declared in this scope`, "decl.cpp"),
        p("The fix is a declaration - the first line of the function followed by `;` - above the first use. In a real project the declarations go in a **header** (`transcript.h`), every `.cpp` file that calls the functions writes `#include \"transcript.h\"`, and the definitions live in exactly one `.cpp` file:"),
        code("cpp", String.raw`
// transcript.h - what other files may call
#pragma once
#include <vector>

double average(const std::vector<double>& scores);
void drop_lowest(std::vector<double>& scores);`, "transcript.h"),
        p("The header is the function's **contract**: the parameter types in it tell every caller whether their data can change. That is why the choice of `&` or no `&` matters so much - it is the part of the function people read."),
        h3("Default arguments"),
        p("A parameter can have a default value, used when the caller leaves the argument out. Defaults must be the last parameters, and they are written **once, in the declaration**. Repeating them in the definition is an error:"),
        code("cpp", String.raw`
std::string format_score(double score, int decimals = 1);           // declaration: default here

std::string format_score(double score, int decimals = 1) { /* ... */ }
// defarg.cpp:6:13: error: default argument given for parameter 2 of
//   ‘std::string format_score(double, int)’ [-fpermissive]

std::string format_score(double score, int decimals) {              // definition: no default
    return std::format("{:.{}f}", score, decimals);
}`, "defarg.cpp"),
        p("Use defaults for settings that are almost always the same (the number of decimals, a pass mark of 5.0). Do not use them to make a parameter that changes the result look optional: a caller who forgets it gets the default without any error."),

        h2("4. Choosing how to pass and return"),
        p("A recap from **Types, references & const**: a reference is another name for an existing object, and `const` means it cannot be changed through that name. For parameters, that gives four choices. The diagram shows what each one means for the caller's vector:"),
        image("copy-alias-readonly", {
            alt: "On the left, the caller main() owns one vector quiz with the cells 8.5, 7.0, 9.0 and 4.5; the function wants to drop the lowest, 4.5. On the right, three rows. Red row, void f(std::vector<double> v): by value, v is a new vector, a copy of quiz; after the erase the copy holds 8.5, 7.0, 9.0 but the caller still sees 4 scores; cost: copies every element on every call; use when f wants its own copy to change. Green row, void f(std::vector<double>& v): by reference, v is another name for quiz, so v.erase removes 4.5 from quiz itself and the caller sees 3 scores; cost: no copy, only an address; use when f must change the caller's object. Blue row, void f(const std::vector<double>& v): a read-only alias; v.erase is a compile error, so f cannot change quiz; cost: no copy, only an address; use for big inputs that f only reads.",
            caption: "No & means a copy. & means the caller's object. const& means the caller's object, read-only.",
        }),
        bullets([
            "**Cheap types by value**: `int`, `double`, `bool`, `char`, and small structs of a few numbers. Copying 8 bytes is cheaper than going through a reference.",
            "**Big objects you only read: `const T&`**. `std::vector`, `std::string`, a `Student` with strings inside. No copy, and the compiler guarantees the function does not change the caller's data.",
            "**Read-only text: `std::string_view`**. It accepts a `std::string`, a string literal or a part of a string without copying any characters. Use it for parameters only; do not keep it after the call (the lesson **Object lifetime & RAII** explains why).",
            "**Change the caller's object: `T&`**. The `&` in the signature is the warning label. Name the function with a verb that says so: `drop_lowest`, `apply_curve`.",
            "**By value on purpose**: when the function needs its own copy to change anyway, take the parameter by value and change it. That copy is the one you wanted.",
        ]),
        p("What happens if you take `const&` and then try to change the object? The compiler refuses, which is exactly the protection you asked for:"),
        code("cpp", String.raw`
void drop_lowest(const std::vector<double>& scores) {
    scores.erase(std::ranges::min_element(scores));
}
// constref.cpp:5:17: error: passing ‘const std::vector<double>’ as ‘this’
//   argument discards qualifiers [-fpermissive]`, "constref.cpp"),
        p("This error means the function's job and its signature disagree. Decide which one is right: either the function must change the caller's data (use `T&`), or it must not (keep `const&` and return a new result). Copying the parameter into a local variable to make the error go away gives you the incident again."),
        h3("Results go out through the return value"),
        p("C functions often return results through pointer parameters (`void range(double *lo, double *hi)`), because a C function returns one value. In C++, return a **struct** with named fields, or a `std::pair`, and unpack it at the call site with **structured bindings**: `auto [a, b] = ...` creates two variables from the two members."),
        code("cpp", String.raw`
#include <format>
#include <print>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

struct ScoreRange {
    double lowest;
    double highest;
};

// declarations: the contract the rest of the file can call
double average(const std::vector<double>& scores);
ScoreRange score_range(const std::vector<double>& scores);
std::pair<int, int> pass_fail(const std::vector<double>& scores, double pass_mark = 5.0);
bool is_cs_course(std::string_view code);
std::string format_score(double score, int decimals = 1);

int main() {
    std::vector<double> quiz = {8.5, 7.0, 9.0, 4.5};
    std::string course = "CS101";

    auto [lowest, highest] = score_range(quiz);
    std::println("range {} - {}", lowest, highest);                       // range 4.5 - 9
    auto [passed, failed] = pass_fail(quiz);
    std::println("passed {}, failed {}", passed, failed);                 // passed 3, failed 1
    auto [p8, f8] = pass_fail(quiz, 8.0);
    std::println("with pass mark 8: passed {}, failed {}", p8, f8);       // with pass mark 8: passed 2, failed 2
    std::println("{} {}", is_cs_course(course), is_cs_course("MA201"));   // true false
    std::println("{} {}", format_score(highest), format_score(average(quiz), 3));  // 9.0 7.250
}

// definitions: the bodies, here or in another .cpp file
double average(const std::vector<double>& scores) {
    double sum = 0;
    for (double s : scores) sum += s;
    return sum / scores.size();
}

ScoreRange score_range(const std::vector<double>& scores) {
    ScoreRange r{scores.front(), scores.front()};
    for (double s : scores) {
        if (s < r.lowest) r.lowest = s;
        if (s > r.highest) r.highest = s;
    }
    return r;
}

std::pair<int, int> pass_fail(const std::vector<double>& scores, double pass_mark) {
    int passed = 0;
    for (double s : scores)
        if (s >= pass_mark) ++passed;
    return {passed, static_cast<int>(scores.size()) - passed};
}

bool is_cs_course(std::string_view code) { return code.starts_with("CS"); }

std::string format_score(double score, int decimals) {
    return std::format("{:.{}f}", score, decimals);
}`, "scores.cpp"),
        bullets([
            "**Prefer a struct to a pair** when the meaning is not obvious: `r.lowest` documents itself, `p.first` does not. The standard library has `std::ranges::minmax` for this exact job; the lesson **STL algorithms: sort, find, accumulate** covers it.",
            "**Returning a vector or a string is cheap.** The compiler builds the result directly in the caller's variable (copy elision) or moves it, which hands over the heap buffer instead of copying the elements. Do not use an out-parameter to \"save a copy\".",
            "**A returned value that nobody stores is lost.** `round_score(x);` computes a result and throws it away, with no warning. Mark functions whose result must be used with `[[nodiscard]]`.",
            "**Never return a reference to a local variable.** The local is destroyed when the function returns. g++ warns (`warning: reference to local variable ‘label’ returned [-Wreturn-local-addr]`), and in our run the program then crashed with a segmentation fault; with `-fsanitize=undefined` it reported `runtime error: reference binding to null pointer`. It is undefined behaviour, so a different build may do something else. Return by value.",
        ]),

        h2("5. Overloading: how the compiler picks"),
        p("C needs a different name for every function: `round_points`, `round_score_d`. C++ allows **overloading**: several functions with the same name and different parameter types. The port added two:"),
        code("cpp", String.raw`
#include <print>

void round_score(int points)   { std::println("int    overload: {} points", points); }
void round_score(double score) { std::println("double overload: {}", score); }

int main() {
    round_score(87);        // int literal
    round_score(8.25);      // double literal
    float legacy = 7.5f;    // old C struct stored scores as float
    round_score(legacy);
    short raw = 92;         // from the 2010 binary file
    round_score(raw);
    round_score('9');       // a char from a parsed line
    round_score(8);         // meant: 8 out of 10
}
// Output:
// int    overload: 87 points
// double overload: 8.25
// double overload: 7.5
// int    overload: 92 points
// int    overload: 57 points
// int    overload: 8 points`, "overloads.cpp"),
        p("For each call, the compiler ranks how well the argument matches each overload, and the best match wins:"),
        numbered([
            "**Exact match**: `87` is an `int`, `8.25` is a `double`.",
            "**Promotion**: a small type widened to its natural big type without losing anything - `float` to `double`, and `char`, `short` and `bool` to `int`. That is why the `float` goes to the double overload and `'9'` goes to the int overload, as the number 57.",
            "**Conversion**: everything else between number types - `double` to `int`, `long` to `int`, `long` to `double`, `unsigned` to `int`.",
        ]),
        p("If two overloads need a conversion of the same rank, neither is better, and the call does not compile. The ranking job counted points in a `long`:"),
        code("cpp", String.raw`
long total = 870;
round_score(total);
unsigned count = 3;
round_score(count);

// amb.cpp:8:16: error: call of overloaded ‘round_score(long int&)’ is ambiguous
// amb.cpp:8:16: note: there are 2 candidates
// amb.cpp:3:6: note: candidate 1: ‘void round_score(int)’
// amb.cpp:4:6: note: candidate 2: ‘void round_score(double)’
// amb.cpp:10:16: error: call of overloaded ‘round_score(unsigned int&)’ is ambiguous`, "amb.cpp"),
        p("The ambiguity error is the friendly case: it stops the build. The dangerous case is the last call above: `round_score(8)` was meant as 8.0 on the 0-10 scale, but `8` is an `int`, so it went to the 0-100 points overload. Nothing tells you."),
        h3("A string literal prefers bool"),
        p("One more surprise from the logging code. A string literal is a `const char*` underneath, and the conversion from a pointer to `bool` is a built-in conversion, while the conversion to `std::string` goes through a constructor - a user-defined conversion, which always ranks lower:"),
        code("cpp", String.raw`
void log_entry(bool passed)              { std::println("flag: {}", passed); }
void log_entry(const std::string& text)  { std::println("text: {}", text); }

int main() {
    log_entry("RP-2024-0137 enrolled in CS101");
    log_entry(std::string{"RP-2024-0137 enrolled in CS101"});
}
// Output:
// flag: true
// text: RP-2024-0137 enrolled in CS101`, "log.cpp"),
        callout("tip", "Overload only for the same meaning",
            "Overloads are right when every version does the same thing for a different type, like std::println for ints and strings. When the versions mean different things - points out of 100 against a score out of 10 - give them different names, such as round_points and round_score. Then an int argument cannot quietly choose the wrong meaning."),
        challenge("chal_quiz_cppf_211", "For the first question, ask for each call: does the function get a copy or the caller's vector, and does the caller store the returned value? For the second, check the type of each argument first - including what 17 / 2 and '9' really are."),

        h2("6. The fix"),
        p("Each function now says in its signature what it does with its input:"),
        code("cpp", String.raw`
#include <algorithm>
#include <cassert>
#include <print>
#include <string>
#include <string_view>
#include <vector>

struct Student {
    std::string id;
    std::string name;
    std::vector<double> scores;
};

// Changes the caller's vector: the & says so.
void drop_lowest(std::vector<double>& scores) {
    if (scores.size() < 2) return;               // keep the only score
    scores.erase(std::ranges::min_element(scores));
}

// Or: take a copy on purpose, change it, hand it back.
std::vector<double> without_lowest(std::vector<double> scores) {
    drop_lowest(scores);
    return scores;                               // moved out, not copied
}

// Reads only: const& for the records, string_view for the id.
std::string find_name(const std::vector<Student>& all, std::string_view id) {
    for (const Student& s : all)
        if (s.id == id) return s.name;
    return "";
}

int main() {
    std::vector<double> quiz = {8.5, 7.0, 9.0, 4.5};
    std::vector<double> best3 = without_lowest(quiz);
    assert(quiz.size() == 4 && best3.size() == 3);   // the original is untouched

    drop_lowest(quiz);
    assert(quiz == best3);

    std::vector<Student> all = {{"RP-2024-0137", "Nguyễn Thị Phương Thảo", quiz}};
    std::println("{} {}", find_name(all, "RP-2024-0137"), quiz);
}
// Output:
// Nguyễn Thị Phương Thảo [8.5, 7, 9]`, "transcript_fixed.cpp"),
        numbered([
            "**`std::vector<double>& scores`** - `drop_lowest` exists to change the caller's scores, so it takes a reference. The guard keeps a student with only one score from losing it.",
            "**`without_lowest(std::vector<double> scores)`** - the by-value version is correct here, because the copy is the point: the caller keeps the original and gets a new vector back. Pick one style per call site; both are tested above.",
            "**`const std::vector<Student>& all`** - the 40,000 records are read, never copied: 0.867 ms per lookup instead of 24 ms in our measurement.",
            "**`std::string_view id`** - the caller can pass a `std::string` or a literal such as `\"RP-2024-0137\"` without building a temporary `std::string`.",
            "**The overloads became `round_points(int)` and `round_score(double)`**, so a call with the wrong unit no longer compiles silently into the other meaning.",
            "**The test checks the caller's data after the call** - `quiz.size() == 4` after `without_lowest`, `3` after `drop_lowest`. The original release had a test that checked the function's debug output, which was always right.",
        ]),

        h2("7. Your turn"),
        p("The transcript job has three more functions with the same family of bugs. The test runner builds one class's transcript lines and the class summary, and prints both."),
        challenge("chal_fix_cppf_212", "For every function, ask what the caller must see after the call. If the caller's object must change, the parameter needs a &. If the function computes a new value, it must return it - and the caller must store it."),

        h2("8. Pitfalls"),
        bullets([
            "**A vector, string or struct parameter without `&`**: the function works on a copy. Changes vanish, and big inputs cost a full copy per call.",
            "**`const T&` plus a local copy to silence the const error**: the change still never reaches the caller. Decide whether the function changes its input, then pick `T&` or a return value.",
            "**A computed result that is never stored**: `round_score(x);` alone does nothing useful. Assign the result, and use `[[nodiscard]]` on functions whose result matters.",
            "**Returning a reference or pointer to a local variable**: it refers to a destroyed object. Return by value.",
            "**Default arguments repeated in the definition**: a compile error. Write them once, in the declaration in the header.",
            "**Overloads with different meanings**: `round_score(8)` with an `int` silently picks the int version. Use different names when the meaning differs.",
            "**`long`, `unsigned` or `std::size_t` passed to an `int`/`double` overload pair**: ambiguous, does not compile. Convert explicitly with `static_cast<double>(...)`, or fix the overload set.",
            "**A string literal passed to `bool` and `std::string` overloads**: the `bool` version wins.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Every function is declared before its first use; shared functions are declared in a header and defined in one `.cpp` file.",
            "`int`, `double`, `bool`, `char` and small structs are passed by value.",
            "Vectors, strings and structs that the function only reads are passed by `const&`; read-only text is `std::string_view`.",
            "A parameter is `T&` only when the function's job is to change the caller's object, and the function's name says so.",
            "Results leave the function through `return`; several results come back as a struct or `std::pair` and are unpacked with `auto [a, b] = ...`.",
            "No function returns a reference to one of its local variables.",
            "Overloads share a name only when they mean the same thing; default arguments appear once, in the declaration.",
            "Tests check the caller's data after the call, not only the function's own output.",
        ]),
    ],
});
