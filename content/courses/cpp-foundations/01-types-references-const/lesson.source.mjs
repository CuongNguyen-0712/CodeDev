// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cppf-1-1",
    title: "Types, references & const",
    slug: { _type: "slug", current: "cpp-types-references-const" },
    description:
        "The exam board granted every student in CS101 a 0.5-point bonus, the new C++ bonus script ran without an error, and the exported scores did not change by a single point - while the class average came out as 7 instead of 7.75. Learn how to compile and run C++23, the fundamental types and their sizes, integer division and static_cast, why signed overflow is undefined behaviour, brace initialization and narrowing, what auto really deduces, and how references and const decide whether your code changes the caller's data or a copy of it.",
    estimatedTime: 25,

    scenario: {
        role: "Junior developer in the exam office at Riverside Polytechnic, porting the 2010 C tools to C++23",
        problem:
            "After a marking error in the CS101 final, the exam board granted all 32 students a 0.5-point bonus. The bonus script - one of the first tools ported from C to C++ - ran, printed \"bonus applied\", and the export it produced still held the old scores. The same export listed the class average as 7, while the scores on the board averaged 7.75. Nobody had touched the bonus formula; the bugs are in how the values are passed around.",
    },

    content: [
        h2("1. The incident"),
        p("The exam office keeps one `std::vector<double>` of scores per class, 0 to 10 with one decimal. The C version of the bonus tool worked on a `double*` and a length. The port to C++ looked straightforward, and it compiled with no warnings under `-Wall -Wextra`:"),
        code("cpp", String.raw`
void add_bonus(double score, double bonus) {
    score += bonus;
}

void apply_board_bonus(std::vector<double>& scores, double bonus) {
    for (auto s : scores) {
        add_bonus(s, bonus);
    }
    std::println("bonus applied");
}

// export: the class average for the transcript office
int total = 0;
for (auto s : scores) total += s;
int count = scores.size();
int avg = total / count;`, "bonus.cpp"),
        p("The board meeting was on Friday. On Monday the head of the exam office compared the export with the board's list: every one of the 32 scores was unchanged, and the average on the cover sheet said 7. Students who needed the bonus to pass CS101 were still listed as failed."),
        bullets([
            "**Nothing crashed and nothing was logged.** The program did exactly what the code says - just not what its author meant.",
            "**Two separate bugs, one root.** The bonus was added to **copies** of the scores, and the average was computed in **integer** arithmetic. Both come from C habits meeting C++ rules about types and values.",
            "**The fix is a few characters long.** Finding it requires knowing what `auto`, `&` and `int` mean exactly - which is this lesson.",
        ]),

        h2("2. Reproduce it"),
        h3("Compiling and running C++"),
        p("C++ is compiled: a compiler turns your `.cpp` file into a program, and then you run that program. This course uses g++ 15 and the C++23 standard. Save this as `hello.cpp`:"),
        code("cpp", String.raw`
#include <print>

int main() {
    std::println("Riverside Polytechnic - exam office tools");
    std::println("{} students in {}", 32, "CS101");
}`, "hello.cpp"),
        code("bash", String.raw`
g++ -std=c++23 -Wall -Wextra hello.cpp
./a.out
# Riverside Polytechnic - exam office tools
# 32 students in CS101`),
        bullets([
            "**`-std=c++23`** selects the language version. `std::println` (header `<print>`) is C++23; it prints its arguments into the `{}` placeholders and ends the line.",
            "**`-Wall -Wextra`** turns on the common warnings. Read every warning; most of them are bugs.",
            "**`./a.out`** runs the result. Without `-o name` the compiler writes `a.out` (`a.exe` on Windows with MinGW). `-o bonus` names it `bonus`.",
            "**`main` returns 0 automatically** when it reaches its end, which tells the shell the program succeeded.",
        ]),
        h3("The bonus bug in 25 lines"),
        code("cpp", String.raw`
#include <print>
#include <vector>

void add_bonus(double score, double bonus) {
    score += bonus;                       // changes the local copy only
}

int main() {
    std::vector<double> scores{7.5, 8.0, 6.5, 9.0};

    for (auto s : scores) {               // s is a copy of each element
        add_bonus(s, 0.5);
    }

    int total = 0;
    for (auto s : scores) total += s;     // C habit: int accumulator
    int count = scores.size();
    int avg = total / count;

    std::println("scores: {}", scores);
    std::println("average: {}", avg);
}`, "repro.cpp"),
        code("text", String.raw`
$ g++ -std=c++23 -Wall -Wextra repro.cpp && ./a.out
scores: [7.5, 8, 6.5, 9]
average: 7`),
        p("The scores should be `[8, 8.5, 7, 9.5]` after the bonus, and even the old scores average 7.75, not 7. (`std::println` prints a `double` such as 8.0 as `8`; you will see `{:.1f}` for fixed decimals later.) No warning appeared. Add `-Wconversion` and g++ points at the average code:"),
        code("text", String.raw`
repro.cpp:16:33: warning: conversion from 'double' to 'int' may change value [-Wfloat-conversion]
   16 |     for (auto s : scores) total += s;     // C habit: int accumulator
repro.cpp:17:28: warning: conversion from 'std::vector<double>::size_type' {aka 'long unsigned int'} to 'int' may change value [-Wconversion]
   17 |     int count = scores.size();`),
        p("It says nothing about the bonus loop: copying a `double` is perfectly legal. To see that bug you have to know what the declarations mean."),

        h2("3. Fundamental types, sizes and arithmetic"),
        p("C++ has the same **fundamental types** as C. Their sizes are not fixed by the standard (only minimums are), so print them on the platform you ship to. `sizeof` gives the size in bytes:"),
        code("cpp", String.raw`
#include <cstddef>
#include <print>

int main() {
    std::println("bool        {} byte", sizeof(bool));        // bool        1 byte
    std::println("char        {} byte", sizeof(char));        // char        1 byte
    std::println("int         {} bytes", sizeof(int));        // int         4 bytes
    std::println("long long   {} bytes", sizeof(long long));  // long long   8 bytes
    std::println("double      {} bytes", sizeof(double));     // double      8 bytes
    std::println("std::size_t {} bytes", sizeof(std::size_t));// std::size_t 8 bytes
}`, "sizes.cpp"),
        bullets([
            "**`int`**: 4 bytes here, from -2147483648 to 2147483647. Counts, student numbers, points out of 100.",
            "**`long long`**: at least 8 bytes. Use it when a sum can pass two billion - for example, total points over every exam in ten years.",
            "**`double`**: 8-byte floating point, about 15-16 significant digits. Scores with decimals. It cannot store 0.1 exactly, so print with a fixed number of decimals instead of comparing for exact equality after long calculations.",
            "**`bool`**: `true` or `false`. **`char`**: one byte - not one letter: \"Nguyễn\" is 6 letters but 8 bytes in UTF-8. Text belongs in `std::string` (next lesson).",
            "**`std::size_t`**: an **unsigned** integer big enough for any object size. `scores.size()` returns this type (written `size_type` in the warning above).",
        ]),
        h3("Integer division"),
        p("When both operands of `/` are integers, the result is an integer: the fraction is **thrown away** (truncated toward zero), not rounded. That is the second bug: `30 / 4` is 7."),
        code("cpp", String.raw`
int passed = 27;
int enrolled = 32;

std::println("{}", passed / enrolled);                          // 0
std::println("{}", 100 * passed / enrolled);                    // 84
std::println("{}", static_cast<double>(passed) / enrolled);     // 0.84375
std::println("{:.1f}%", 100.0 * passed / enrolled);             // 84.4%
std::println("{}", 7 / 2);                                      // 3
std::println("{}", -7 / 2);                                     // -3
std::println("{}", 7 % 2);                                      // 1`, "division.cpp"),
        p("If one operand is a `double`, the other is converted and the division is done in floating point. `static_cast<double>(passed)` is the C++ way to say \"convert this value to double\". It replaces the C cast `(double)passed`: it is easy to search for, and the compiler refuses the dangerous conversions a C cast would silently allow. Writing `100.0` instead of `100` has the same effect for a literal."),
        p("In the repro there is one more loss **before** the division: `total += s` with an `int total` converts each score to `int`, so 7.5 adds 7 and 6.5 adds 6. The sum becomes 30 instead of 31, then `30 / 4` is 7. The fix needs both: a `double` total and a floating-point division."),
        h3("Signed overflow is undefined behaviour"),
        p("An `int` cannot hold a value above 2147483647. What happens if you go past it?"),
        code("cpp", String.raw`
#include <climits>
#include <print>

int main() {
    int total_points = INT_MAX;          // 2147483647
    total_points += 1;                   // signed overflow: undefined behaviour
    std::println("{}", total_points);

    unsigned int seats = 0;
    seats -= 1;                          // unsigned: wraps around, well defined
    std::println("{}", seats);
}`, "overflow.cpp"),
        p("In our run it printed `-2147483648` and then `4294967295`. Only the second line is guaranteed. Overflowing a **signed** integer is **undefined behaviour** (UB): the standard places no requirement at all on what the program does, and the optimizer is allowed to assume it never happens - so with other flags or another compiler the result may differ, or code around it may behave strangely. The undefined behaviour sanitizer catches it at run time:"),
        code("text", String.raw`
$ g++ -std=c++23 -Wall -Wextra -g -fsanitize=undefined overflow.cpp && ./a.out
overflow.cpp:6:18: runtime error: signed integer overflow: 2147483647 + 1 cannot be represented in type 'int'
-2147483648
4294967295`),
        p("**Unsigned** types never overflow in that sense: their arithmetic wraps around modulo 2 to the power of the bit count, so `0u - 1` is 4294967295 for a 4-byte `unsigned int`. That is defined, but rarely what you want: `scores.size() - 1` on an empty vector is not -1, it is the largest `std::size_t` value. Use `-fsanitize=undefined` (and `-fsanitize=address`) while developing; they cost speed, not correctness."),

        h2("4. Initialization, narrowing and auto"),
        p("C++ has several ways to give a variable its first value. The one to prefer is **brace initialization**, because it refuses conversions that lose information - **narrowing conversions** such as `double` to `int`:"),
        code("cpp", String.raw`
int main() {
    int a = 7.5;     // compiles, a == 7
    int b(7.5);      // compiles, b == 7
    int x{7.5};      // error: narrowing
    return a + b + x;
}`, "narrowing.cpp"),
        code("text", String.raw`
narrowing.cpp: In function 'int main()':
narrowing.cpp:4:11: error: narrowing conversion of '7.5e+0' from 'double' to 'int' [-Wnarrowing]
    4 |     int x{7.5};      // error: narrowing
      |           ^~~`),
        p("The first two lines compiled without a single warning under `-Wall -Wextra`: the C rules convert silently. With braces the same mistake stops the build. Braces still accept conversions that cannot lose anything, such as `int` to `long long`."),
        callout("warning", "g++ only warns when the value is not a constant",
            "The standard says every narrowing inside braces is ill-formed. g++ makes it an error for constants like 7.5, but for a computed value such as int avg{total / 4.0} it prints only warning: narrowing conversion of '(total / 4.0e+0)' from 'double' to 'int' [-Wnarrowing]. Compile with -pedantic-errors (or -Werror) and it becomes an error too."),
        p("Brace initialization also works for containers: `std::vector<double> scores{7.5, 8.0}` creates a vector with those two elements. And `int count{}` with empty braces means zero - never leave a local `int` uninitialized, because reading it is undefined behaviour."),
        h3("auto deduces a type - and makes a copy"),
        p("`auto` asks the compiler to take the type from the initializer. `auto n = 32;` is an `int`, `auto avg = 7.75;` is a `double`, `auto count = scores.size();` is a `std::size_t` - which is exactly the type you want there, and spelling it out as `int` is how the repro got its `-Wconversion` warning."),
        p("The rule that caused the incident: **plain `auto` deduces a value type.** If the initializer is a reference to something, `auto` drops the reference (and a top-level `const`) and the new variable is a **copy**. `auto s = scores[0];` is a new `double` that happens to start with the same value. That is what `for (auto s : scores)` does on every iteration."),

        h2("5. References and const"),
        p("A **reference** `T&` is another name for an existing object. It is not a pointer you must dereference and not a copy: every use of the reference **is** a use of the object it refers to."),
        code("cpp", String.raw`
double score = 7.5;
double& r = score;          // r is another name for score
r += 0.5;
std::println("{} {}", score, r);       // 8 8   - both names, one object

double other = 9.0;
r = other;                  // NOT reseating: copies 9.0 into score
other = 1.0;
std::println("{} {} {}", score, r, other);   // 9 9 1`, "refs.cpp"),
        bullets([
            "**A reference must be initialized.** `double& r;` is an error: `'r' declared as reference but not initialized`. There is no such thing as a reference to nothing.",
            "**It cannot be reseated.** Once `r` refers to `score`, it refers to `score` for its whole life. `r = other` assigns the **value** of `other` into `score`; it does not make `r` refer to `other`, so changing `other` later does not affect `r`.",
            "**A reference parameter lets a function change the caller's variable.** With `void add_bonus(double& score, double bonus)`, the call `add_bonus(s, 0.5)` makes `score` another name for `s`. With `double score`, the function gets its own copy - which is what the C-style port did.",
        ]),
        h3("auto&, const auto& and range-for"),
        p("Add `&` to `auto` and you get a reference instead of a copy. This matters most in range-for loops, where the loop variable is declared once per element:"),
        code("cpp", String.raw`
std::vector<double> scores{7.5, 8.0};
auto first = scores[0];     // auto deduces double: a copy
first += 1.0;
auto& second = scores[1];   // auto& deduces double&: an alias
second += 1.0;
std::println("{}", scores);              // [7.5, 9]

for (auto& s : scores) s += 0.5;
std::println("{}", scores);              // [8, 9.5]`, "refs.cpp"),
        image("copy-vs-reference", {
            alt: "Two panels side by side. Left, in red, titled for (auto s : scores): the vector scores holds 7.5, 8.0, 6.5 and 9.0; a dashed arrow labelled copied leads from the first element to a separate box s (a copy) where 7.5 + 0.5 = 8.0 is computed, and a box add_bonus(double score) notes that score is a copy of the copy; the note below says scores after the loop is still [7.5, 8, 6.5, 9], nothing changed. Right, in green, titled for (auto& s : scores): the first element of scores is now 8.0 and highlighted; an arrow labelled same object leads from a box s (an alias) with s += 0.5 straight into that element, and a box add_bonus(double& score) notes that score is the element itself; the note says scores after the loop is [8, 8.5, 7, 9.5]. A bottom panel lists the rule: auto x = v[i] is a copy and changes stay in x; auto& x = v[i] is an alias and changes reach v[i]; const auto& x = v[i] is a read-only alias with no copy; void f(double s) gets its own copy; void f(double& s) changes the caller's variable; void f(const T& s) reads it without copying.",
            caption: "Plain auto and by-value parameters make copies; & makes a second name for the same element.",
        }),
        h3("const and const T&"),
        p("`const` means \"this name will not be used to change the object\". `const double max_score = 10.0;` can never be assigned again. On a reference, `const T&` gives you the two things you usually want for an input parameter: **no copy** (important for a vector of 30 000 scores or a long string) and **no changes**. The compiler enforces the promise:"),
        code("cpp", String.raw`
double total(const std::vector<double>& scores) {
    scores[0] = 10.0;           // error: scores is const
    return scores[0];
}`, "const_errors.cpp"),
        code("text", String.raw`
const_errors.cpp:4:15: error: assignment of read-only location '(& scores)->std::vector<double>::operator[](0)'`),
        p("One more rule completes the picture. A **non-const** reference must refer to an existing object it is allowed to change, so you cannot pass it a temporary value such as a literal: with `void add_bonus(double& score, double bonus)`, the call `add_bonus(7.5, 0.5)` fails with `cannot bind non-const lvalue reference of type 'double&' to an rvalue of type 'double'`. A `const double&` **can** bind to a temporary - it only reads it - so `const double& ok = 7.5;` compiles."),
        p("The resulting habit, which the rest of this course follows:"),
        bullets([
            "**Small values you only read** (`int`, `double`, `bool`, `char`): pass by value. Copying 8 bytes is free.",
            "**Big objects you only read** (`std::vector`, `std::string`): pass `const T&`.",
            "**Objects the function must change**: pass `T&`, and let the function name say so (`apply_...`, `add_...`).",
            "**Range-for**: `for (const auto& s : scores)` to read, `for (auto& s : scores)` to change. Plain `for (auto s : scores)` only when you really want a copy.",
        ]),
        h3("constexpr in one paragraph"),
        p("`constexpr` goes one step beyond `const`: the value must be known **at compile time**. `constexpr double max_score = 10.0;` is a named constant with no run-time cost, and it replaces C's `#define MAX_SCORE 10.0`, which has no type and ignores scopes. A function marked `constexpr` can be evaluated by the compiler when its arguments are constants, so `static_assert(cap(12.0) == 10.0);` is checked during compilation - if it is false, the build fails. Use `constexpr` for fixed limits like the maximum score or the number of exam sessions per year."),
        challenge("chal_quiz_cppf_111", "For every name, ask: is it declared with &, or is it a new variable that was copied? For every initialization, ask: are there braces, and can the value be represented exactly in the target type?"),

        h2("6. The fix"),
        p("Two characters fix the bonus, and a `double` total fixes the average:"),
        code("cpp", String.raw`
#include <print>
#include <vector>

void add_bonus(double& score, double bonus) {   // & : score IS the caller's double
    score += bonus;
}

void print_report(const std::vector<double>& scores) {   // const& : no copy, read-only
    double total = 0.0;
    for (const auto& s : scores) total += s;
    std::println("scores: {}", scores);
    std::println("average: {:.2f}", total / static_cast<double>(scores.size()));
}

int main() {
    std::vector<double> scores{7.5, 8.0, 6.5, 9.0};

    for (auto& s : scores) {               // s is each element, not a copy
        add_bonus(s, 0.5);
    }
    print_report(scores);
}`, "fix.cpp"),
        code("text", String.raw`
$ g++ -std=c++23 -Wall -Wextra -Wconversion fix.cpp && ./a.out
scores: [8, 8.5, 7, 9.5]
average: 8.25`),
        numbered([
            "**`double& score`** - the helper now works on the caller's variable instead of a copy.",
            "**`for (auto& s : scores)`** - the loop variable is each element itself. Both `&` are needed: a reference parameter receiving a copy still changes only the copy.",
            "**`const std::vector<double>&`** - `print_report` reads the scores without copying the vector, and the compiler stops it from changing them.",
            "**`double total` and `static_cast<double>(scores.size())`** - every step of the average stays in floating point, and `-Wconversion` is quiet. `{:.2f}` prints exactly two decimals.",
            "**Test with data that would show the bug**: values like 7.5 and 6.5, whose average is not a whole number, and a check that the vector really changed after the call.",
        ]),

        h2("7. Your turn"),
        p("The exam board's real rule has one more condition: no score may end above 10.0. Write the function that applies the curve to a class in place, and the average the transcript office needs. The test runner reads the class list from stdin and prints every curved score."),
        challenge("chal_coding_cppf_112", "Which parameter must be a reference so the caller's vector changes, and which one only reads? Add the bonus first and cap the result afterwards; a score counts as changed only if its new value differs from its old one. Keep every step of the average in double."),

        h2("8. Pitfalls"),
        bullets([
            "**`for (auto s : v)` when you meant to change `v`**: you change copies. Use `auto&`; use `const auto&` when you only read.",
            "**A by-value parameter for data the function must change**: the caller's variable is untouched and nothing warns you.",
            "**`int / int`**: the fraction is dropped, `30 / 4` is 7. Convert one operand with `static_cast<double>` or use a `double` from the start.",
            "**An `int` accumulator for `double` values**: each value is truncated before it is added. Only `-Wconversion` warns.",
            "**Signed overflow**: undefined behaviour, not wrap-around. Use `long long` for big sums and `-fsanitize=undefined` while testing.",
            "**`size() - 1` on an empty container**: unsigned arithmetic wraps to a huge number instead of -1.",
            "**`int x = 7.5;`**: silently 7. Braces turn it into an error; for computed values g++ needs `-pedantic-errors` or `-Werror` to stop the build.",
            "**`r = other` on a reference**: copies a value into the referred object; a reference can never be pointed somewhere else.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Compile with `-std=c++23 -Wall -Wextra`, add `-Wconversion` for numeric code, and run tests under `-fsanitize=address,undefined`.",
            "Variables are initialized when they are declared, preferably with braces: `int count{}`, `double bonus{0.5}`.",
            "Averages, percentages and ratios are computed in `double`; every integer operand is converted with `static_cast<double>` before dividing.",
            "Sizes and indexes use `std::size_t` (or `auto` from `size()`), not `int`.",
            "Parameters: small values by value, big read-only objects by `const T&`, objects the function changes by `T&`.",
            "Range-for loops say what they mean: `const auto&` to read, `auto&` to change.",
            "Fixed limits are `constexpr` constants with a name, not magic numbers or `#define`.",
            "Every test that checks a change also checks that the caller's data actually changed.",
        ]),
    ],
});
