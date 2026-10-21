// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cppf-1-3",
    title: "Reading input: std::cin, getline & std::print",
    slug: { _type: "slug", current: "cpp-reading-input-cin-getline-print" },
    description:
        "The ported score-entry tool at Riverside Polytechnic saved every student with an empty name, saved the last student twice, and hung on a score typed as \"8,5\". Learn what std::cin >> really reads and what it leaves behind, how std::getline works and how to mix the two with std::ws, why every read must be checked and what the fail state is, how to parse one line with std::istringstream, std::stod and std::from_chars, and how to print aligned reports with std::print and std::format.",
    estimatedTime: 22,

    scenario: {
        role: "Junior developer at Riverside Polytechnic, porting the exam office's C tools to C++23",
        problem:
            "The score-entry console tool, ported from C last week, was used for the CS101 midterm. Every student was saved with an empty name, the last student of each batch was saved twice, and when a lecturer typed 8,5 instead of 8.5 the batch import never finished and kept writing the same record with a score of 0 until someone killed it.",
    },

    content: [
        h2("1. The incident"),
        p("The exam office's score-entry tool asks for a student id, the full name and the score, and saves one record per student. The C version from 2010 used `scanf` and `fgets`. The port replaced them with what looked like the C++ equivalents:"),
        code("cpp", String.raw`
// score_entry.cpp - ported from score_entry.c (2010)
#include <iostream>
#include <print>
#include <string>

int main() {
    std::string id, name;
    double score = 0;
    int saved = 0;
    while (!std::cin.eof()) {
        std::print("Student id: ");
        std::cin >> id;
        std::print("Full name: ");
        std::getline(std::cin, name);
        std::print("Score: ");
        std::cin >> score;
        std::println("\nsaved {} | {} | {}", id, name, score);
        ++saved;
    }
    std::println("{} records saved", saved);
}`, "score_entry.cpp"),
        p("It compiled without a single warning under `-Wall -Wextra`. After the CS101 midterm, three things went wrong at once:"),
        bullets([
            "**Every name was empty.** The staff typed the id and pressed Enter, and the tool printed `Full name: Score: ` on one line, as if the name question had been skipped. They typed the score, and 184 students were saved with no name.",
            "**The last student of every batch was saved twice.** The batch for room B2 had 46 students; the tool reported 47 records, and the last student counted twice in the room average.",
            "**A score typed as `8,5` broke everything after it.** In Vietnam the decimal separator is a comma, and one lecturer typed `8,5`. The batch import never finished: it kept saving the same broken record with a score of 0 until someone killed the job.",
        ]),
        p("None of this is a compiler bug. Each line does exactly what the standard says. To see why, you need to know what a read takes from the input and what it leaves behind."),

        h2("2. Reproduce it"),
        p("Save the program above as `score_entry.cpp`, build it with `g++ -std=c++23 -Wall -Wextra score_entry.cpp -o score_entry` (g++ 15.2) and feed it what the staff typed - an id, then the score, because the name question was skipped:"),
        code("text", String.raw`
RP-2024-0137
8.5
RP-2024-0138
7`, "batch.txt"),
        code("bash", String.raw`
$ ./score_entry < batch.txt
Student id: Full name: Score:
saved RP-2024-0137 |  | 8.5
Student id: Full name: Score:
saved RP-2024-0138 |  | 7
Student id: Full name: Score:
saved RP-2024-0138 |  | 7
3 records saved`),
        p("Two students, three records, no names. Now the comma. To keep the run from going on forever, this copy of the program stops after 5 records and prints the stream's state:"),
        code("text", String.raw`
RP-2024-0137
8,5
RP-2024-0138
7
RP-2024-0139
9`, "batch_comma.txt"),
        code("bash", String.raw`
$ ./score_entry_guard < batch_comma.txt
Student id: Full name: Score:
saved RP-2024-0137 |  | 8
Student id: Full name: Score:
saved ,5 |  | 0
Student id: Full name: Score:
saved ,5 |  | 0
Student id: Full name: Score:
saved ,5 |  | 0
Student id: Full name: Score:
saved ,5 |  | 0
(stopped by the 5-record guard; fail=true eof=false)
5 records saved`),
        p("The score became 8, the next \"student id\" is `,5`, and from then on nothing is read at all: `fail=true eof=false` means the stream has given up, but has not reached the end, so `while (!std::cin.eof())` never stops. The next sections explain every line of this output."),

        h2("3. What >> reads, and what it leaves behind"),
        p("`std::cin` is an **input stream**: a buffer of characters with a **read position**. Every read starts at the read position and moves it forward. The keyboard, a file redirected with `<` and a pipe all look the same to your program: a sequence of characters, where every Enter is one `'\\n'` character."),
        p("The extraction operator `>>` is a **formatted** read. For `std::string`, `int` and `double` it does three things:"),
        numbered([
            "**Skips leading whitespace**: spaces, tabs and newlines before the value.",
            "**Reads as many characters as fit the type**: for a `std::string` everything up to the next whitespace; for a `double` everything that can be part of a number.",
            "**Stops and leaves the rest in the buffer**, including the newline at the end of the line.",
        ]),
        code("cpp", String.raw`
#include <iostream>
#include <print>
#include <string>

int main() {
    std::string id;
    std::cin >> id;
    std::println("id=[{}] next char code={}", id, std::cin.peek());   // 10 is '\n'
    std::string rest;
    std::getline(std::cin, rest);
    std::println("getline=[{}] size={}", rest, rest.size());
    double score = 0;
    std::cin >> score;
    std::println("score={}", score);
}

// input: "  RP-2024-0137\n8.5\n"
// id=[RP-2024-0137] next char code=10
// getline=[] size=0
// score=8.5`, "peek.cpp"),
        p("`>>` skipped the two spaces, read the id and stopped **in front of** the newline (`peek()` shows the next character without taking it: 10 is `'\\n'`). That newline is the one the staff produced by pressing Enter after the id."),
        p("For a `double`, \"everything that can be part of a number\" does not include a comma. On `8,5` the read takes `8`, succeeds, and leaves `,5` in the buffer for the next read. Nothing fails yet - the damage shows up one read later."),
        image("read-position", {
            alt: "Top panel: the input buffer the staff typed, ten cells R, P, -, 0, 1, newline, 8, ., 5, newline, with the two newline cells in amber. Marker 1 sits before the first newline: std::cin >> id reads RP-01 and stops before the newline. Marker 2 sits after the first newline: std::getline(std::cin, name) reads up to that newline and eats it, so name is empty. Marker 3 sits before the last newline: std::cin >> score reads 8.5 and the last newline stays in the buffer. Bottom panel: while (!std::cin.eof()) asks before reading, so it runs one round too many. Round 1 reads RP-01 and 8.5, eof() is false. Round 2 reads RP-02 and 7 and stops after the 7; eof() is still false because no read has tried to go past the end yet. Round 3, in red, is the extra one: >> hits the end and sets eofbit and failbit, id and score keep RP-02 and 7, and RP-02 is saved a second time. A green strip says that with while (std::getline(std::cin, line)) or while (std::cin >> id >> score) the read is the loop condition, so the body runs only after a read that worked and round 3 never starts.",
            caption: "The newline left by >> is what getline reads; eof() becomes true only after a read has already failed.",
        }),

        h2("4. std::getline, and mixing it with >>"),
        p("`std::getline(std::cin, line)` is an **unformatted** read: it takes every character up to the next `'\\n'`, removes that newline from the buffer, and stores the rest in `line` - spaces included, nothing skipped. That is what you need for a full name like \"Nguyễn Thị Phương Thảo\", which `>>` would cut after \"Nguyễn\"."),
        p("Now the first bug is plain. After `std::cin >> id` the read position is in front of the newline. `std::getline` reads up to the next newline - which comes immediately - and returns an **empty** line. It did not skip the question; it answered it with the empty rest of the id line. Then `std::cin >> score` read whatever the staff typed next."),
        p("The fix when you must mix the two is `std::ws`, a manipulator that skips whitespace (including newlines) and nothing else:"),
        code("cpp", String.raw`
#include <iostream>
#include <print>
#include <string>

int main() {
    std::string id, name;
    double score = 0;
    std::cin >> id;
    std::getline(std::cin >> std::ws, name);   // skip the newline (and any spaces) first
    std::cin >> score;
    std::println("[{}] [{}] {}", id, name, score);
}

// input: "RP-2024-0137\nNguyễn Thị Phương Thảo\n8.5\n"
// [RP-2024-0137] [Nguyễn Thị Phương Thảo] 8.5`, "ws.cpp"),
        p("`std::cin >> std::ws` returns `std::cin`, so it can be written inside the `getline` call. One limit: `std::ws` also skips **empty lines**, so if an empty name is a legal answer you cannot tell it apart from \"nothing typed\". The cleaner rule, used in the fix below, is not to mix at all: read **every** answer as a whole line with `getline`, then convert it."),
        callout("info", "Coming from C",
            "scanf(\"%s\") leaves the newline in the buffer exactly like >>, and the classic C bug is the same: a following fgets returns an empty line. The C++ version is not safer by itself - it only gives you better tools (std::getline into a std::string that grows as needed, no buffer size to get wrong)."),

        h2("5. Check every read: loops and the fail state"),
        p("Every stream carries state flags. Three matter here:"),
        bullets([
            "**`eofbit`**: a read tried to go past the end of the input. Note the order: it is set **by a read that ran into the end**, not when the last character has been taken.",
            "**`failbit`**: a read could not produce a value - letters where a number was expected, or nothing left to read.",
            "**`badbit`**: the stream itself is broken (rare; a disk error, for example).",
        ]),
        p("While `failbit` (or `badbit`) is set, **every following read does nothing at all**: it does not wait for input, does not change your variable, and does not complain. A stream converts to `bool`: it is `true` if no read has failed. And a read expression like `std::cin >> x` returns the stream, so you can test the read itself:"),
        code("cpp", String.raw`
#include <iostream>
#include <print>

int main() {
    double first = -1, second = -1, third = -1;
    std::cin >> first;
    std::cin >> second;
    std::cin >> third;
    std::println("{} {} {} fail={}", first, second, third, std::cin.fail());
}

// input: "8,5\n7\n"
// 8 0 -1 fail=true`, "fail.cpp"),
        p("`first` got 8 from `8,5`. `second` hit the `,`: the read failed, and a number read that fails stores 0 (that is where the incident's score of 0 came from). `third` was never even attempted because the stream was already in the fail state, so it kept -1. The `7` is still sitting in the buffer, unread."),
        h3("The loop forms"),
        p("This is why `while (!std::cin.eof())` is wrong in two ways. It checks **before** the read, so after the last record it is still `false` and the body runs once more with a failed read and the old values - the duplicate record. And if a read fails **without** reaching the end, `eof()` never becomes true - the endless loop. Make the read itself the loop condition:"),
        code("cpp", String.raw`
std::string line;
while (std::getline(std::cin, line)) {     // stops when a read fails, never one round late
    // ... use line
}

std::string id;
double score = 0;
while (std::cin >> id >> score) {          // both reads must work
    // ... use id and score
}

if (!(std::cin >> score)) {                // a single read
    std::println("not a number");
}`),
        h3("Recovering from the fail state"),
        p("To continue after a bad value you must do two things: `std::cin.clear()` resets the flags so reads work again, and `std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\\n')` (from `<limits>`) throws away the rest of the line, otherwise the next read fails on the same characters. Here it is on four scores - and notice what it does **not** catch:"),
        code("cpp", String.raw`
#include <iostream>
#include <limits>
#include <print>

int main() {
    double score = 0;
    int skipped = 0;
    while (true) {
        if (std::cin >> score) {
            std::println("read {}", score);
        } else if (std::cin.eof()) {
            break;
        } else {
            std::cin.clear();   // leave the fail state
            std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');   // drop the rest of the line
            ++skipped;
        }
    }
    std::println("skipped {}", skipped);
}

// input: "8.5\n8,5\nabc\n7\n"
// read 8.5
// read 8
// read 7
// skipped 2`, "recover.cpp"),
        p("`abc` was rejected, but `8,5` was accepted as **8** and only the leftover `,5` was skipped. `>>` checks that a value **starts** like a number, not that the whole answer is one. For user input that is not good enough - which leads to the next section."),
        challenge("chal_quiz_cppf_131", "Track the read position after every read, and remember when eofbit is actually set: by a read that runs into the end, not by the last successful one."),

        h2("6. One line at a time: istringstream, stod and from_chars"),
        p("The robust pattern for line-based input is: **read a whole line with `getline`, then parse that line on its own.** A bad line can then never push the rest of the input out of step, and you still have the original text for an error message."),
        h3("std::istringstream"),
        p("`std::istringstream` (from `<sstream>`) is an input stream that reads from a `std::string` instead of the keyboard. Everything you know about `std::cin` works on it - `>>`, `getline`, `std::ws`, the fail state - but its end is the end of **that line**. Reading one more character after the value tells you whether something was left over:"),
        code("cpp", String.raw`
#include <print>
#include <sstream>
#include <string>

int main() {
    for (std::string line : {"RP-2024-0137 8.5", "RP-2024-0138 8,5", "RP-2024-0139"}) {
        std::istringstream row(line);
        std::string id;
        double score = 0;
        char extra = 0;
        if (!(row >> id >> score)) {
            std::println("[{}] id or score missing", line);
        } else if (row >> extra) {
            std::println("[{}] read {} but '{}' is left over", line, score, extra);
        } else {
            std::println("[{}] ok: {} {}", line, id, score);
        }
    }
}

// [RP-2024-0137 8.5] ok: RP-2024-0137 8.5
// [RP-2024-0138 8,5] read 8 but ',' is left over
// [RP-2024-0139] id or score missing`, "parse_line.cpp"),
        p("A new `row` is made for every line, so a failed read leaves no state behind: there is nothing to `clear()`. To get \"the rest of the line\" from a row, for example a name after the score, use `std::getline(row >> std::ws, name)`."),
        h3("std::stoi and std::stod"),
        p("`std::stoi` and `std::stod` (from `<string>`) convert a whole `std::string` to `int` / `double`. When there is no number at all they **throw** an exception instead of setting a flag, and the message is short:"),
        code("cpp", String.raw`
try {
    std::stod("abc");
} catch (const std::invalid_argument& e) {
    std::println("invalid_argument: {}", e.what());   // invalid_argument: stod
}
try {
    std::stoi("99999999999");
} catch (const std::out_of_range& e) {
    std::println("out_of_range: {}", e.what());       // out_of_range: stoi
}

std::size_t used = 0;
double d = std::stod("8,5", &used);
std::println("stod(\"8,5\") = {} used {} chars", d, used);   // stod("8,5") = 8 used 1 chars`),
        p("The last line is the trap again: `std::stod(\"8,5\")` does **not** throw. It converts the longest number at the start and tells you, through the optional second argument, how many characters it used. To reject `8,5` you must check that `used` equals the length of the text. An exception you forget to catch ends the program, so `stoi`/`stod` fit best where a bad value really is exceptional."),
        h3("std::from_chars: no exceptions, no locale"),
        p("`std::from_chars` (from `<charconv>`) is the low-level, non-throwing alternative. It takes a range of characters, writes the value into a variable, and returns two things: where it stopped (`ptr`) and an error code (`ec`). It never depends on the locale and never allocates."),
        code("cpp", String.raw`
#include <charconv>

std::string s = "8,5";
double v = 0;
auto [ptr, ec] = std::from_chars(s.data(), s.data() + s.size(), v);
std::println("from_chars: v={} ok={} stopped at '{}'", v, ec == std::errc{}, *ptr);
// from_chars: v=8 ok=true stopped at ','

std::string bad = "abc";
auto r2 = std::from_chars(bad.data(), bad.data() + bad.size(), v);
std::println("from_chars(abc): invalid={}", r2.ec == std::errc::invalid_argument);
// from_chars(abc): invalid=true`, "from_chars.cpp"),
        p("Like `stod`, it happily parses the `8` of `8,5` - a value is valid only if `ec` is `std::errc{}` (no error) **and** `ptr` reached the end of the text. Whichever tool you use, the rule is the same: **the number must use the whole field**, and the range check (0 to 10 for a score) comes after."),
        callout("warning", "Do not \"fix\" the comma by guessing",
            "It is tempting to replace ',' with '.' and carry on. For a score sheet that is a decision for the exam office, not for the parser: \"8,5\" might be 8.5, or a typo for two scores 8 and 5. Reject the line with a clear message and its line number, and let a person decide."),
        p("The exam office also has a reader for score **files** (one record per line, after a header with the course code). It has the same three bugs as the score-entry tool. Fix it with the line-by-line pattern:"),
        challenge("chal_fix_cppf_132", "First make the loop read one line per round with the read as the condition, and make the header read consume its newline. Then decide good or bad for each line on its own: the score field must be a number from start to end, and the name is the rest of the line."),

        h2("7. Output: std::print, std::println and std::format"),
        p("C++23 `std::print` and `std::println` (from `<print>`) write to standard output using **format strings**: `{}` is replaced by the next argument, with the right conversion for its type. `println` adds the newline. There is no `%d`/`%s` to get wrong as in `printf`: a wrong type is a compile error, not garbage output. `std::format` (from `<format>`) builds the same text as a `std::string` instead of printing it."),
        p("After a colon inside the braces comes a **format spec**: fill and alignment, width, precision, type:"),
        code("cpp", String.raw`
std::println("[{:.2f}] [{:>10}] [{:<20}] [{:>6.1f}]", 8.5, "RP-01", "Tran Van An", 7.25);
// [8.50] [     RP-01] [Tran Van An         ] [   7.2]`),
        bullets([
            "**`{:.2f}`**: fixed notation with 2 decimals.",
            "**`{:>10}`**: right-aligned in 10 columns; **`{:<20}`**: left-aligned in 20. Numbers are right-aligned by default, strings left-aligned.",
            "**`{:>6.1f}`**: both at once. Note `7.25` printed as `7.2`: 7.25 is stored exactly, and a tie is rounded to the even digit. If the office rule is \"7.25 rounds up to 7.3\", that is a rule to code yourself, not a formatting option.",
        ]),
        h3("Vietnamese names and column width"),
        p("A name like \"Nguyễn Thị Phương Thảo\" has 22 letters but is 30 **bytes** in UTF-8, because letters such as ễ and ư take 2 or 3 bytes. `.size()` on the `std::string` returns 30. That matters when you align columns:"),
        code("cpp", String.raw`
std::println("[{:<24}]|", "Nguyễn Thị Phương Thảo");
std::println("[{:<24}]|", "Tran Van An");
std::cout << "[" << std::left << std::setw(24) << "Nguyễn Thị Phương Thảo" << "]|\n";
std::println("{}", std::string("Nguyễn Thị Phương Thảo").size());

// [Nguyễn Thị Phương Thảo  ]|
// [Tran Van An             ]|
// [Nguyễn Thị Phương Thảo]|
// 30`, "columns.cpp"),
        p("With g++ 15.2, `std::format` counts **display columns** for UTF-8 text (the standard requires a width estimate based on Unicode, not on bytes), so both names fill 24 columns. The old `std::setw` from `<iomanip>` counts bytes: it sees 30 bytes, decides the name is already wider than 24, and adds no padding - the column is broken. C's `printf(\"%-24s\")` counts bytes in the same way. This only works if the source file and the terminal both use UTF-8; g++ reads source files as UTF-8 by default."),

        h2("8. The fix"),
        p("The score-entry tool, rewritten with one rule: **every answer is one whole line, and every read is checked.**"),
        code("cpp", String.raw`
// score_entry.cpp - every answer is one whole line, every read is checked
#include <iostream>
#include <print>
#include <sstream>
#include <string>

// Prints the prompt and reads one whole line. False at the end of input.
bool ask(const char* prompt, std::string& answer) {
    std::print("{}", prompt);
    return static_cast<bool>(std::getline(std::cin, answer));
}

// True only if text is one number from 0 to 10 with nothing else after it.
bool parse_score(const std::string& text, double& score) {
    std::istringstream in(text);
    char extra = 0;
    return in >> score && !(in >> extra) && score >= 0 && score <= 10;
}

int main() {
    int saved = 0;
    int rejected = 0;
    std::string id, name, score_text;
    while (ask("Student id: ", id) && ask("Full name: ", name) && ask("Score: ", score_text)) {
        double score = 0;
        if (!parse_score(score_text, score)) {
            std::println("\nREJECTED {}: \"{}\" is not a score from 0 to 10 (type 8.5, not 8,5)", id, score_text);
            ++rejected;
            continue;
        }
        std::println("\nsaved {} | {} | {:.1f}", id, name, score);
        ++saved;
    }
    std::println("\n{} saved, {} rejected", saved, rejected);
}`, "score_entry.cpp"),
        code("bash", String.raw`
$ ./score_entry < batch_fixed.txt      # 3 students, the second one typed 8,5
Student id: Full name: Score:
saved RP-2024-0137 | Nguyễn Thị Phương Thảo | 8.5
Student id: Full name: Score:
REJECTED RP-2024-0138: "8,5" is not a score from 0 to 10 (type 8.5, not 8,5)
Student id: Full name: Score:
saved RP-2024-0139 | Lê Minh | 9.0
Student id:
2 saved, 1 rejected`),
        numbered([
            "**Only `getline` reads from `std::cin`.** No `>>` on the console means no newline left behind, so the name question is answered by the name line.",
            "**The reads are the loop condition.** When the input ends, `ask` returns `false` and the loop stops; there is no extra round and no duplicate record. (The last `Student id: ` prompt is printed before the read finds the end.)",
            "**Each answer is parsed on its own `istringstream`.** A bad score fails one record and leaves `std::cin` untouched, so the next student is read normally.",
            "**The whole answer must be the number.** `!(in >> extra)` rejects `8,5` and `8.5x`; the range check rejects `85`.",
            "**Rejected input is reported with the text that was typed**, so the office can correct it instead of finding a silent 0 in the transcript.",
        ]),

        h2("9. Pitfalls"),
        bullets([
            "**`std::getline` right after `>>`**: returns the empty rest of the previous line. Use `std::cin >> std::ws` first, or read everything with `getline`.",
            "**`while (!std::cin.eof())`** (or `while (std::cin)`) before the read: one extra round with the old values at the end, and an endless loop when a read fails before the end.",
            "**Unchecked `>>`**: after one failure every later read silently does nothing. Test every read, or the variables keep stale values or 0.",
            "**Trusting `>>`, `std::stod` or `std::from_chars` to validate**: all three accept `8` from `8,5`. Check that the whole field was used.",
            "**`clear()` without `ignore()`**: the next read fails again on the same bad characters.",
            "**`>>` into a `std::string` for a name**: stops at the first space, \"Nguyễn Thị Phương Thảo\" becomes \"Nguyễn\".",
            "**Uncaught `std::invalid_argument` from `std::stoi`/`std::stod`**: ends the program with the message `stoi` or `stod` and nothing else.",
            "**Aligning UTF-8 text with `std::setw` or `printf` widths**: they count bytes, not columns. `std::format` widths count columns.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Line-based input is read with `while (std::getline(in, line))`, then each line is parsed with its own `std::istringstream`.",
            "Every read is checked: in the loop condition or with `if (!(in >> x))`. No `eof()` in loop conditions.",
            "When `>>` and `getline` must be mixed, `getline(in >> std::ws, ...)` skips the leftover newline.",
            "A number is accepted only if it uses the whole field and is in range; `8,5` is rejected, not guessed.",
            "Bad lines are reported with their line number and original text, counted, and skipped - one bad line never stops or shifts the rest.",
            "A stream that must keep going after a failure gets `clear()` and `ignore(...)`.",
            "Output uses `std::println` with format specs (`{:.2f}`, `{:>10}`, `{:<20}`), not hand-built spacing; names are aligned with `std::format`, not `std::setw`.",
        ]),
    ],
});
