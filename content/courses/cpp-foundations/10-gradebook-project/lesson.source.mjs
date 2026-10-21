// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cppf-4-2",
    title: "Mini project: a grade book",
    slug: { _type: "slug", current: "cpp-mini-project-grade-book" },
    description:
        "At the end of the semester the old C grade book printed CS101 transcripts where a student who had dropped the course still got an F, a student with no scores got \"-nan\" and an F, and two students whose average was exactly 8.50 got a B+. Rebuild it in C++23 with everything from this course: a GradeBook class with a private std::map from id to Student, lookups that never invent a student, averages with std::accumulate and a 0.0 start, a written boundary table and one rounding rule, std::format output and a line-by-line command parser.",
    estimatedTime: 25,

    scenario: {
        role: "Junior developer on the exam office team at Riverside Polytechnic, Hồ Chí Minh City",
        problem:
            "Transcripts for CS101 went out on Friday. By Monday the exam office had three complaints: Trần Thị Bích Ngọc, who withdrew in week 4, has an F on her record; Lê Hoàng Phúc, who enrolled late, has an average of \"-nan\" and an F; and Nguyễn Văn An and Phạm Thị Phương Thảo both have an average of 8.50 next to a B+, although the rules say 8.5 is an A. The grade book is the last C tool on the list. You rebuild it in C++23.",
    },

    content: [
        h2("1. The incident"),
        p("The grade book was written in 2010. It keeps every student in a fixed array of structs, and the transcript loop prints one line per array entry:"),
        code("c", String.raw`
#define MAX_STUDENTS 200
#define MAX_SCORES 10

struct student {
    char id[16];
    char name[64];
    double scores[MAX_SCORES];
    int n_scores;
    int dropped;
};

struct student book[MAX_STUDENTS];
int n_students = 0;

const char *letter(double avg) {
    if (avg > 8.5) return "A";
    if (avg >= 8.0) return "B+";
    if (avg >= 7.0) return "B";
    if (avg >= 6.5) return "C+";
    if (avg >= 5.5) return "C";
    if (avg >= 5.0) return "D+";
    if (avg >= 4.0) return "D";
    return "F";
}

void print_transcripts(void) {
    for (int i = 0; i < n_students; i++) {
        double sum = 0;
        for (int j = 0; j < book[i].n_scores; j++)
            sum += book[i].scores[j];
        double avg = sum / book[i].n_scores;
        printf("%s | %s | %.2f | %s\n", book[i].id, book[i].name, avg, letter(avg));
    }
}`, "gradebook.c"),
        p("Four lines of the CS101 transcript, four different problems:"),
        bullets([
            "**A dropped student is still graded.** Dropping a student sets `dropped = 1`. Nothing removes the entry, and `print_transcripts` never looks at the flag, so her one quiz score of 3.0 became an F.",
            "**No scores, no average.** A student who enrolled late has `n_scores == 0`. `sum / 0` is not a number, `printf` prints it as `-nan`, and every comparison with NaN is false, so `letter` falls through to F.",
            "**8.5 is not an A.** The rule says \"8.5 and above\", the code says `> 8.5`.",
            "**8.50 is not 8.5.** Even with `>=`, one student with 7.1, 9.2 and 9.2 (25.5 / 3 = 8.5 on paper) still gets a B+. The printed average says 8.50; the number the code compared is slightly smaller.",
        ]),

        h2("2. Reproduce it"),
        p("Add this `main` to the code above (plus `#include <stdio.h>` and `<string.h>` at the top) and build it with `gcc -std=c23 -Wall -Wextra gradebook.c` (gcc 15.2):"),
        code("c", String.raw`
void add(const char *id, const char *name) {
    strcpy(book[n_students].id, id);
    strcpy(book[n_students].name, name);
    n_students++;
}

void score(int i, double s) { book[i].scores[book[i].n_scores++] = s; }

int main(void) {
    add("RP-2024-0137", "Nguyễn Văn An");
    add("RP-2024-0152", "Trần Thị Bích Ngọc");
    add("RP-2024-0161", "Lê Hoàng Phúc");
    add("RP-2024-0178", "Phạm Thị Phương Thảo");
    score(0, 8.0); score(0, 9.0);                /* exactly 8.5 */
    score(1, 3.0); book[1].dropped = 1;          /* dropped in week 4 */
                                                 /* 0161: enrolled late, no scores yet */
    score(3, 7.1); score(3, 9.2); score(3, 9.2); /* 25.5 / 3 = 8.5 on paper */
    print_transcripts();
    return 0;
}`, "gradebook.c"),
        code("text", String.raw`
RP-2024-0137 | Nguyễn Văn An | 8.50 | B+
RP-2024-0152 | Trần Thị Bích Ngọc | 3.00 | F
RP-2024-0161 | Lê Hoàng Phúc | -nan | F
RP-2024-0178 | Phạm Thị Phương Thảo | 8.50 | B+`),
        p("The obvious patch is to change `>` to `>=`. Rebuilt and run again:"),
        code("text", String.raw`
RP-2024-0137 | Nguyễn Văn An | 8.50 | A
RP-2024-0152 | Trần Thị Bích Ngọc | 3.00 | F
RP-2024-0161 | Lê Hoàng Phúc | -nan | F
RP-2024-0178 | Phạm Thị Phương Thảo | 8.50 | B+`),
        p("One line fixed, three to go, and the last one is the most confusing: same printed average as the line above it, different letter. The C++ standard calls division by zero undefined behaviour; a C compiler that follows IEEE 754 (C's Annex F, as gcc does here) gives a NaN for `0.0 / 0`, and in this run it printed as `-nan`. Another compiler or platform may print `nan`. Either way, a transcript must never contain it."),
        p("Patching the C code one bug at a time is how the tool got here. Instead, you rebuild it with the pieces from this course, and each piece closes one of these holes by design."),

        h2("3. The design: a class around one map"),
        p("A grade book answers four kinds of command: add a student, record a score, drop a student, print the report. Every answer depends on looking a student up by id, and the report must come out in id order. That gives the data structure:"),
        bullets([
            "**`Student` is a plain struct**: a `std::string name` (UTF-8, any length, no `char[64]`) and a `std::vector<double> scores` (no `MAX_SCORES`).",
            "**`std::map<std::string, Student>` keyed by id**: lookup by id, at most one entry per id, and iteration in sorted key order, so the report is sorted with no extra step. With `std::unordered_map` you would have to copy the keys and sort them (see the lesson \"std::map vs std::unordered_map\").",
            "**The map is a private member of a `GradeBook` class.** Only the member functions can change it, so every rule (no phantom students, a drop really removes) is enforced in one place.",
            "**Dropping erases.** There is no `dropped` flag that some loop may forget to check: a dropped student is simply not in the map.",
        ]),
        image("gradebook-data-flow", {
            alt: "Data flow of the grade book in four stages from left to right. stdin holds command lines: add id name, score id 8.5, drop id, report. The parser reads one line with std::getline, splits cmd and id with in >> cmd >> id, takes the name as the rest of the line, and reports bad lines as errors. GradeBook, with private data, holds a std::map from std::string to Student, where Student is name and scores; lookups use find and contains, and drop uses erase(id), which returns 1 or 0. report() const iterates in id order, sums with accumulate starting at 0.0, prints a dash when there are no scores and rounds once before grading. Red cards under each stage mark the bugs that could happen there: under stdin, the old C tool with a fixed array, char name[64] and a dropped flag the report loop forgot, so a dropped student still got an F; under the parser, std::cin >> name stopping at the first space and score text like 8,5 or 11 that must be checked; under GradeBook, students_[id] on a lookup inserting a phantom student, Student s = students_.at(id) making a copy so the score is lost, and erase inside a range-for invalidating the iterator; under report, accumulate with an int 0 losing decimals, 0.0 divided by 0 scores printing -nan and grading F, and avg > 8.5 plus 8.4999 printed as 8.50 giving B+. A green bar lists the guards: private map, find and contains, erase, const report(), 0.0 init, a dash for no scores, one rounding rule.",
            caption: "Each old bug has one place in the pipeline. The design puts the guard there.",
        }),
        p("Here is the interface. It is the same one you will implement in the challenge; the bodies are yours to write:"),
        code("cpp", String.raw`
struct Student {
    std::string name;
    std::vector<double> scores;
};

class GradeBook {
public:
    bool add_student(const std::string& id, const std::string& name); // false: id already exists
    bool add_score(const std::string& id, double score);              // false: unknown id
    bool drop(const std::string& id);                                 // false: unknown id
    std::vector<std::string> report() const;                          // the report lines

private:
    std::map<std::string, Student> students_;
};`, "gradebook.hpp"),
        bullets([
            "**Parameters are `const std::string&`**: the function reads the id, it does not need a copy and must not change the caller's string (the lesson \"Functions, overloading & pass-by-reference bugs\").",
            "**Changing functions return `bool`.** The class does not print; it tells the caller whether the command did anything, and the caller decides what error line to print. That keeps the class testable.",
            "**`report() const`** promises that printing the report changes nothing. The compiler enforces that promise, as the next section shows.",
            "**`report` returns lines instead of printing them.** A test can compare the lines, and `main` decides where they go.",
        ]),

        h2("4. Lookups that never invent a student"),
        p("In the old tool, a typo in an id (`0173` instead of `0137`) went to the wrong array slot or nowhere. In a map, the classic mistake is `operator[]`. It is a lookup **and** an insert: if the key is missing, it creates a default value for it."),
        code("cpp", String.raw`
#include <map>
#include <print>
#include <string>
#include <vector>

struct Student {
    std::string name;
    std::vector<double> scores;
};

int main() {
    std::map<std::string, Student> students;
    students["RP-2024-0137"] = Student{"Nguyễn Văn An", {}};

    // "score RP-2024-0173 9.0" - a typo: 0173 instead of 0137
    students["RP-2024-0173"].scores.push_back(9.0);

    std::println("{} students", students.size());
    for (const auto& [id, s] : students)
        std::println("{} | '{}' | {} scores", id, s.name, s.scores.size());
}
// 2 students
// RP-2024-0137 | 'Nguyễn Văn An' | 0 scores
// RP-2024-0173 | '' | 1 scores`, "phantom.cpp"),
        p("No error, and the transcript now has a student with no name and a 9.0. That is a **phantom student**: one that exists only because someone asked about it."),
        h3("const catches the read-side mistake"),
        p("In a `const` member function the map is `const`, and `operator[]` is not available on a `const` map, precisely because it might insert. Try it:"),
        code("cpp", String.raw`
std::size_t score_count(const std::string& id) const {
    return students_[id].scores.size();      // operator[] may insert: not allowed in a const function
}`, "const_err.cpp"),
        code("text", String.raw`
const_err.cpp:13:28: error: passing ‘const std::map<std::__cxx11::basic_string<char>, Student>’ as ‘this’ argument discards qualifiers [-fpermissive]
   13 |         return students_[id].scores.size();      // operator[] may insert: not allowed in a const function
      |                            ^
...
/usr/include/c++/15/bits/stl_map.h:527:7: note:   in call to ‘std::map<...>::mapped_type& std::map<...>::operator[](const key_type&) [with ...]’`),
        p("Read the error as \"you are calling a non-const function on a const map\". Mark every member function that only reads as `const`, and the compiler will stop phantom students in all of them. Functions that change the book cannot be `const`, so there you need the right tools:"),
        bullets([
            "**`find(key)`** returns an iterator to the entry, or `end()` if there is none. It never inserts. Use it when you need the entry: `it->first` is the id, `it->second` the `Student`.",
            "**`contains(key)`** (C++20) answers yes or no. Use it when you only need to know.",
            "**`try_emplace(key, value)` / `emplace`** insert only if the key is missing and return a pair: an iterator and a `bool` that says whether anything was inserted.",
            "**`erase(key)`** removes the entry and returns how many it removed: 1 or 0 for a map.",
            "**`at(key)`** throws `std::out_of_range` for a missing key: right when a missing key is a programming error, not when it is a typo in the input.",
        ]),
        code("cpp", String.raw`
std::map<std::string, Student> students;

auto [pos, inserted] = students.try_emplace("RP-2024-0137", Student{"Nguyễn Văn An", {}});
std::println("first insert: {}", inserted);
auto [pos2, again] = students.try_emplace("RP-2024-0137", Student{"Someone Else", {}});
std::println("second insert: {}, name kept: {}", again, pos2->second.name);

// Look up without inserting: find gives an iterator, end() means "not there".
if (auto it = students.find("RP-2024-0173"); it != students.end())
    it->second.scores.push_back(9.0);
else
    std::println("error: unknown id RP-2024-0173");

std::println("contains 0137: {}, size: {}", students.contains("RP-2024-0137"), students.size());

// erase(key) returns how many elements it removed: 1 or 0 for a map.
std::println("erase 0137: {}", students.erase("RP-2024-0137"));
std::println("erase 0137 again: {}", students.erase("RP-2024-0137"));
// first insert: true
// second insert: false, name kept: Nguyễn Văn An
// error: unknown id RP-2024-0173
// contains 0137: true, size: 1
// erase 0137: 1
// erase 0137 again: 0`, "lookup.cpp"),
        p("Here is a read-only member function written with `find`. It returns `std::optional` so that \"unknown id\" is a value the caller must handle, not a fake 0:"),
        code("cpp", String.raw`
class GradeBook {
public:
    GradeBook() = default;
    explicit GradeBook(std::map<std::string, Student> students) : students_(std::move(students)) {}

    std::size_t size() const { return students_.size(); }

    // const: asking a question never changes the book. find never inserts.
    std::optional<std::size_t> score_count(const std::string& id) const {
        auto it = students_.find(id);
        if (it == students_.end()) return std::nullopt;
        return it->second.scores.size();
    }

private:
    std::map<std::string, Student> students_;
};

int main() {
    const GradeBook book({{"RP-2024-0137", {"Nguyễn Văn An", {8.0, 9.0}}}});
    for (std::string id : {"RP-2024-0137", "RP-2024-0173"}) {
        if (auto n = book.score_count(id)) std::println("{}: {} scores", id, *n);
        else                               std::println("error: unknown id {}", id);
    }
    std::println("students: {}", book.size());
}
// RP-2024-0137: 2 scores
// error: unknown id RP-2024-0173
// students: 1`, "count.cpp"),
        h3("Removing many students: std::erase_if"),
        p("At the end of week 4 the registrar sends a withdrawal list. Removing every listed student while looping over the map with a range-for and calling `erase` inside it invalidates the loop's iterator (the lesson \"Iterators & invalidation bugs\"). C++20 `std::erase_if` does the loop correctly and returns how many entries it removed. For a map, the predicate gets each entry as a pair:"),
        code("cpp", String.raw`
std::map<std::string, Student> students{
    {"RP-2024-0137", {"Nguyễn Văn An", {8.0, 9.0}}},
    {"RP-2024-0152", {"Trần Thị Bích Ngọc", {3.0}}},
    {"RP-2024-0161", {"Lê Hoàng Phúc", {}}},
    {"RP-2024-0178", {"Phạm Thị Phương Thảo", {7.1, 9.2, 9.2}}},
};
// The registrar's withdrawal list for CS101 (week 4).
const std::set<std::string> withdrawn{"RP-2024-0152", "RP-2024-0199"};

auto removed = std::erase_if(students, [&](const auto& entry) {
    return withdrawn.contains(entry.first);
});
std::println("removed {}, left:", removed);
for (const auto& [id, s] : students) std::println("  {} {}", id, s.name);
// removed 1, left:
//   RP-2024-0137 Nguyễn Văn An
//   RP-2024-0161 Lê Hoàng Phúc
//   RP-2024-0178 Phạm Thị Phương Thảo`, "erase_if.cpp"),

        h2("5. Averages, no scores, and grade boundaries"),
        h3("Start the sum at 0.0"),
        p("`std::accumulate` adds in the type of its **third argument**. With `0`, every partial sum is converted back to `int` (the lesson \"STL algorithms: sort, find, accumulate\"):"),
        code("cpp", String.raw`
const std::vector<double> an{8.5, 9.0, 7.5};
std::println("int init:    {}", std::accumulate(an.begin(), an.end(), 0) / 3.0);
std::println("double init: {}", std::accumulate(an.begin(), an.end(), 0.0) / 3.0);
// int init:    8
// double init: 8.333333333333334`, "average.cpp"),
        h3("No scores is not a number"),
        p("A student with no scores has no average. Not 0 (that would be an F), and not `0.0 / 0`. Make the absence part of the return type with `std::optional<double>` and decide, once, how the report shows it. Riverside Polytechnic prints a dash:"),
        code("cpp", String.raw`
std::optional<double> mean(const std::vector<double>& scores) {
    if (scores.empty()) return std::nullopt;                  // no scores: there is no average
    double sum = std::accumulate(scores.begin(), scores.end(), 0.0);
    return sum / static_cast<double>(scores.size());
}

int main() {
    const std::vector<double> an{8.5, 9.0, 7.5};
    const std::vector<double> phuc;                           // enrolled late, no scores yet
    for (const auto& s : {an, phuc}) {
        if (auto avg = mean(s)) std::println("average {:.2f}", *avg);
        else                    std::println("average -");
    }
}
// average 8.33
// average -`, "average.cpp"),
        h3("Write the boundary table down"),
        p("A grading scale is data, so put it in one table instead of scattering numbers through `if`s. Every row says \"this letter from this average up\", which is `>=` by construction:"),
        code("cpp", String.raw`
struct Band {
    double min;               // lowest average that still gets this letter
    std::string_view letter;
};

// Riverside Polytechnic, 10-point scale. Checked from the top: the first band that fits wins.
constexpr std::array<Band, 7> bands{{
    {8.5, "A"}, {8.0, "B+"}, {7.0, "B"}, {6.5, "C+"}, {5.5, "C"}, {5.0, "D+"}, {4.0, "D"},
}};

std::string_view letter_for(double rounded_avg) {
    for (const auto& band : bands)
        if (rounded_avg >= band.min) return band.letter;
    return "F";
}

int main() {
    for (double avg : {8.5, 8.49, 8.0, 7.99, 5.5, 4.0, 3.99})
        std::println("{:.2f} {}", avg, letter_for(avg));
}
// 8.50 A
// 8.49 B+
// 8.00 B+
// 7.99 B
// 5.50 C
// 4.00 D
// 3.99 F`, "grade.cpp"),
        p("Test the table **on** each boundary and just below it. A `>` instead of `>=` only shows up on the boundary itself, and the boundary is exactly where real averages land: 8.0 and 9.0 make 8.5."),
        h3("Which 8.5? Specify the rounding"),
        p("Now the last line of the incident. Scores have one decimal, but 7.1 and 9.2 have no exact binary representation, so the sum of 7.1, 9.2 and 9.2 is not exactly 25.5:"),
        code("cpp", String.raw`
const std::vector<double> thao{7.1, 9.2, 9.2};            // 25.5 / 3 = 8.5 on paper
double avg = std::accumulate(thao.begin(), thao.end(), 0.0) / 3;
std::println("{:.2f}", avg);                              // what the transcript shows
std::println("{:.17g}", avg);                             // what the computer holds
std::println("avg >= 8.5: {}", avg >= 8.5);

double shown = std::round(avg * 100) / 100;               // round ONCE, to what we print
std::println("{:.17g} >= 8.5: {}", shown, shown >= 8.5);
// 8.50
// 8.4999999999999982
// avg >= 8.5: false
// 8.5 >= 8.5: true`, "boundary.cpp"),
        p("The same output came out with `-O0` and `-O2`; this is ordinary IEEE 754 arithmetic, not undefined behaviour. The bug is not the floating point, it is the **missing rule**. \"8.5 and above is an A\" does not say whether 8.45 counts, or whether 8.4999999999999982 counts. A grading spec must say which number is compared:"),
        bullets([
            "**Rule chosen here: grade the number you print.** Round the mean once to 2 decimals, `std::round(mean * 100) / 100`, print that value with `{:.2f}` and look up the letter for that same value. A student can then check the letter against the transcript by hand. With this rule 8.45 is a B+ (it is below 8.50) and 8.4999999999999982 is an A (it is printed as 8.50).",
            "**Why rounding to 2 decimals is safe here:** `std::round` returns a whole number of hundredths (850), and 850 / 100 gives the double closest to 8.5, which is exactly 8.5. Every boundary in the table (8.5, 8.0 ... 4.0) is exactly representable, so the comparison on the rounded value is exact.",
            "**Another valid rule: never use floating point for scores.** Store tenths as integers (8.5 becomes 85) and compare integer sums: 71 + 92 + 92 = 255, and 255 >= 85 * 3 is exactly true. This is what accounting software does with money.",
            "**What is not a rule:** comparing the raw mean, or adding a small \"epsilon\" (`avg >= 8.5 - 1e-9`) without writing down why. Both give answers that nobody can check against the printed transcript.",
        ]),
        callout("warning", "Round once, in one place",
            "Do not round for printing in one function and compare the raw value in another. The report line and the letter must come from the same variable. If you need the rounded value in two places, compute it once and pass it on."),

        h2("6. Reading commands line by line"),
        p("The new grade book reads a plain text file of commands, one per line, so the exam office can keep the file and replay it. Read it with `std::getline`, then split each line with an `std::istringstream` (the lesson \"Reading input: std::cin, getline & std::print\"). Two details matter:"),
        bullets([
            "**The name is the rest of the line.** `in >> name` would stop at the first space and store \"Phạm\". After reading the command and the id, `std::getline(in >> std::ws, rest)` skips the spaces and takes everything else, UTF-8 included.",
            "**A score must be checked twice**: did the text parse as a number at all, and is it in 0-10? `std::from_chars` (C++17, `<charconv>`) parses without locales or exceptions and tells you where it stopped, so \"8,5\" is rejected instead of read as 8.",
        ]),
        code("cpp", String.raw`
struct Command {
    std::string name, id, rest;   // rest: everything after the id (a full name, or a score)
};

std::optional<Command> parse(const std::string& line) {
    std::istringstream in(line);
    Command c;
    if (!(in >> c.name)) return std::nullopt;        // empty or blank line
    in >> c.id;
    std::getline(in >> std::ws, c.rest);             // skip the spaces, keep the rest as it is
    return c;
}

std::optional<double> parse_score(std::string_view text) {
    double value = 0;
    auto [end, err] = std::from_chars(text.data(), text.data() + text.size(), value);
    if (err != std::errc{} || end != text.data() + text.size()) return std::nullopt;
    if (value < 0 || value > 10) return std::nullopt;
    return value;
}

int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        auto cmd = parse(line);
        if (!cmd) continue;
        std::println("[{}] [{}] [{}]", cmd->name, cmd->id, cmd->rest);
        if (cmd->name == "score") {
            if (auto s = parse_score(cmd->rest)) std::println("  score {:.1f}", *s);
            else                                 std::println("  error: bad score '{}'", cmd->rest);
        }
    }
}`, "parse.cpp"),
        p("With this input (note the blank line and the extra spaces):"),
        code("text", String.raw`
add RP-2024-0178 Phạm Thị Phương Thảo

score RP-2024-0178   9.2
score RP-2024-0178 8,5
score RP-2024-0178 11
report`, "commands.txt"),
        code("text", String.raw`
[add] [RP-2024-0178] [Phạm Thị Phương Thảo]
[score] [RP-2024-0178] [9.2]
  score 9.2
[score] [RP-2024-0178] [8,5]
  error: bad score '8,5'
[score] [RP-2024-0178] [11]
  error: bad score '11'
[report] [] []`),
        p("The parser only splits text. It does not know what a student is; the `GradeBook` does not know what a line is. Each side can be tested alone."),
        h3("Building report lines with std::format"),
        p("`std::format` builds a `std::string` with the same format specs as `std::println`, which is what a function that **returns** lines needs. `{:.2f}` prints exactly 2 decimals; a plain `{}` prints the shortest text that reads back as the same double (8.333333333333334 above), which is never what a transcript wants."),
        code("cpp", String.raw`
std::string line = std::format("{} | {} | {:.2f}", "RP-2024-0137", "Nguyễn Văn An", 8.5);
// RP-2024-0137 | Nguyễn Văn An | 8.50`),
        p("The iostream way gives the same text: write into an `std::ostringstream` (`<sstream>`) with `std::fixed << std::setprecision(2)` (`<iomanip>`) before the number, then take `.str()`. The challenge's test runner prints with `std::cout`, because `<print>` and `<format>` take several seconds to compile and the grader has a compile time limit; use `std::ostringstream` there too."),
        callout("info", "Avoid column widths with Vietnamese names",
            "printf(\"%-24s\") counts bytes, and \"Nguyễn\" is 6 letters but 8 bytes in UTF-8, so padded columns drift. The report in this lesson uses separators instead of padding, which is also easier to compare in tests."),

        h2("7. Your turn: build the grade book"),
        p("Implement the four `GradeBook` member functions. The starter has the full rules, the exact text of every report line and a test runner that parses the commands and prints the error lines for you. The tests replay whole sessions, with reports before and after drops, typos in ids and averages that land exactly on a boundary."),
        challenge("chal_coding_cppf_421", "Write the three changing functions with find, emplace and erase (never operator[] for a lookup). In report(), handle the no-scores case first, start the sum at 0.0, round once and use that one value for both the printed average and the letter."),

        h2("8. The fix"),
        p("Replayed through the rebuilt grade book, the CS101 session looks like this. The command file is the semester's history, including the week-4 drop and one typo:"),
        code("text", String.raw`
add RP-2024-0137 Nguyễn Văn An
add RP-2024-0152 Trần Thị Bích Ngọc
add RP-2024-0161 Lê Hoàng Phúc
add RP-2024-0178 Phạm Thị Phương Thảo
score RP-2024-0137 8.0
score RP-2024-0137 9.0
score RP-2024-0152 3.0
drop RP-2024-0152
score RP-2024-0178 7.1
score RP-2024-0178 9.2
score RP-2024-0178 9.2
score RP-2024-0173 9.0
report`, "cs101-semester.txt"),
        code("text", String.raw`
error: unknown id RP-2024-0173
students: 3
RP-2024-0137 | Nguyễn Văn An | scores 2 | avg 8.50 | A
RP-2024-0161 | Lê Hoàng Phúc | scores 0 | avg - | -
RP-2024-0178 | Phạm Thị Phương Thảo | scores 3 | avg 8.50 | A`),
        numbered([
            "**The dropped student is gone**: `drop` erases her entry, and the report can only print what is in the map. There is no flag to forget.",
            "**No scores prints \"-\"**: the empty case is handled before any division, so `-nan` cannot appear.",
            "**8.0 and 9.0 give an A**: the table is `>=` on every row.",
            "**7.1, 9.2 and 9.2 give an A**: the letter is looked up for the rounded value that is printed, 8.50.",
            "**The typo creates nobody**: `0173` is not in the book, so the command prints an error and the report still says 3 students.",
            "**The report is sorted by id** because a `std::map` iterates in key order, and it cannot change the book because it is `const`.",
        ]),

        h2("9. Pitfalls"),
        bullets([
            "**`operator[]` for a lookup**: it inserts a default `Student` for a missing id. Use `find` or `contains`; mark read-only functions `const` so the compiler refuses `operator[]` there.",
            "**`Student s = it->second;`** or `auto s = students_.at(id);`: a copy. Adding a score to the copy changes nothing in the book. Use `auto&` or work through the iterator.",
            "**A `dropped` flag instead of erasing**: every loop must remember to check it. Remove the entry, or keep withdrawn students in a separate container.",
            "**`std::accumulate(..., 0)`**: an `int` sum that drops every decimal. Start at `0.0`.",
            "**Dividing by `scores.size()` without checking for empty**: `0.0 / 0` is undefined behaviour by the C++ standard and a NaN on IEEE 754 hardware; it prints `nan` or `-nan`, and every comparison with it is false.",
            "**`>` at a boundary**: test each band exactly on its lower edge and one step below it.",
            "**Comparing the raw floating-point mean**: 7.1 + 9.2 + 9.2 is not exactly 25.5. Write down the rounding rule, round once and grade the printed value, or keep scores as integer tenths.",
            "**`std::cin >> name`**: stops at the first space. The name is the rest of the line.",
            "**Accepting any score text**: \"8,5\" or \"11\" must be rejected with an error line, not stored as 8 or 11.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Data is a private member: `std::map<std::string, Student>` keyed by id, so lookups are by id and the report is sorted.",
            "Functions that change the book return `bool` (or another result) and never print; `main` prints the errors.",
            "Every read-only member function is `const`.",
            "Lookups use `find` or `contains`; inserts use `emplace` / `try_emplace` and check the returned `bool`; drops use `erase` and check the count.",
            "Sums start at `0.0`; the no-scores case is handled before any division and shown as \"-\".",
            "The grading scale is one table of `>=` bands, tested on and just below every boundary.",
            "The rounding rule is written down, applied once, and the printed value is the graded value.",
            "Input is read line by line; names are the rest of the line; scores are parsed with a check and a range test; a bad line prints an error and changes nothing.",
        ]),

        h2("11. Course wrap-up"),
        p("You started this course with a C tool from 2010 and finished with a grade book that cannot invent a student, cannot forget a drop and cannot print `-nan`. One rule from each lesson:"),
        numbered([
            "**Types, references & const**: a reference is another name for an existing object; `const` on everything you do not intend to change.",
            "**std::string & std::vector instead of raw arrays**: no `char[64]`, no `MAX_STUDENTS`; the container knows its size and grows.",
            "**Reading input: std::cin, getline & std::print**: read whole lines, split them yourself, check every conversion.",
            "**Functions, overloading & pass-by-reference bugs**: pass `const T&` to read, `T&` to change, by value to own a copy, and know which one you wrote.",
            "**Classes & constructors**: keep data private and let member functions guard the rules; a constructor leaves the object valid from the start.",
            "**Object lifetime & RAII**: let objects own their resources so cleanup happens at the closing brace, with no `free` to forget.",
            "**STL algorithms: sort, find, accumulate**: name the loop you mean with an algorithm, and mind the type of `accumulate`'s start value.",
            "**std::map vs std::unordered_map**: `map` for sorted output, `unordered_map` for fast lookup, and `operator[]` only when inserting is what you want.",
            "**Iterators & invalidation bugs**: after `erase` or `push_back`, old iterators and references may be dead; use the returned iterator or `std::erase_if`.",
            "**Mini project: a grade book**: put the rules in one class, write down every boundary and rounding rule, and test on the edges.",
        ]),
        p("Where to go next:"),
        bullets([
            "**High-Performance C++: Data-Oriented Design & Concurrency**: what your containers cost in memory and time, how data layout changes speed, and how to measure before optimising.",
            "**Modern C++23: RAII, Move Semantics, Ranges & std::expected**: the tools you saw only briefly here, in depth: moves instead of copies, ranges pipelines and `std::expected` for errors.",
            "**C Foundations: Memory, Pointers & Strings**: the language the old tools were written in. Knowing `malloc`, `free`, pointer plus length and `char` buffers makes it clear why every rule in this course exists.",
        ]),
    ],
});
