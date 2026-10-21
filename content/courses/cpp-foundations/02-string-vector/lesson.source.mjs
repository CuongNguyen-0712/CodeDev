// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases and the solution live in challenges.json and challenges/ (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cppf-1-2",
    title: "std::string & std::vector instead of raw arrays",
    slug: { _type: "slug", current: "cpp-string-vector-instead-of-raw-arrays" },
    description:
        "At Riverside Polytechnic a secretary added the diacritics to a student's name, \"Tran Thi Bich Ngoc\" became \"Trần Thị Bích Ngọc\", and her CS101 score changed from 85 to 99: the 18-letter name is 25 bytes in UTF-8 and the old C tool kept it in char name[24]. The same tool turned away the 41st student of a class and computed the class average from two scores. Learn how std::string and std::vector own and grow their memory, why size() counts bytes, how to search and cut strings with find, substr and starts_with, why at() throws where [] does not, reserve vs resize, and where std::array and std::span fit.",
    estimatedTime: 22,

    scenario: {
        role: "Junior developer at Riverside Polytechnic, porting the exam office's 2010 C tools to C++23",
        problem:
            "A student's CS101 score changed from 85 to 99 on the day her name was corrected in the enrolment tool. Nobody had touched the score. The same week the tool refused to enrol the 41st student of a class, and the class report showed an average that matched only the first two students. All three bugs come from the same C habit: fixed-size char and int arrays.",
    },

    content: [
        h2("1. The incident"),
        p("In September the exam office corrected student names in the CS101 roster. The names had been typed in 2023 without diacritics; now they were entered properly in UTF-8. One of them was RP-2024-0137: \"Tran Thi Bich Ngoc\" became \"Trần Thị Bích Ngọc\". Two days later the student asked why her score in the online grade view was 99. She had scored 85, the paper record said 85, and the edit log showed that nobody had changed her score - only her name."),
        p("The enrolment tool is C code from 2010, compiled today with a C++ compiler. The record and the edit function looked like this:"),
        code("cpp", String.raw`
#define MAX_STUDENTS 40

struct Student {
    char id[16];
    char name[24];      // "long enough for any name"
    int  score;         // 0-100 points
};

struct Student students[MAX_STUDENTS];
int count = 0;

int add_student(const char* id, const char* name, int score) {
    if (count >= MAX_STUDENTS) { printf("class full\n"); return -1; }
    strcpy(students[count].id, id);
    strcpy(students[count].name, name);
    students[count].score = score;
    return count++;
}

void set_name(struct Student* s, const char* new_name) {
    strcpy(s->name, new_name);
}

double class_average(int scores[MAX_STUDENTS]) {
    int n = sizeof(scores) / sizeof(scores[0]);
    int sum = 0;
    for (int i = 0; i < n; ++i) sum += scores[i];
    return (double)sum / n;
}`, "enrol.c"),
        bullets([
            "**The name did not fit.** \"Trần Thị Bích Ngọc\" has 18 letters, which looks safe for a 24-character field. But `ầ`, `ị` and `ọ` take 3 bytes each and `í` takes 2, so the name is **25 bytes**, plus the `'\\0'` that ends every C string. `strcpy` does not know how big `name` is; it wrote 26 bytes, and the last two landed in `score`.",
            "**The 41st student was turned away.** The CS101 group 2 roster had 41 students that term. `add_student` printed `class full` and returned -1; student 41 was simply not in the list.",
            "**The average was wrong.** `class_average` took the size of the array with `sizeof`. Inside a function, the parameter is not an array any more - it is a pointer - so `n` was 2 and the report showed the average of the first two scores.",
        ]),

        h2("2. Reproduce it"),
        p("This program keeps the C code, reads the corrected name from stdin and prints the record. All programs in this lesson were compiled with g++ 15.2, `-std=c++23 -Wall -Wextra -g`; the comments show the real output."),
        code("cpp", String.raw`
// enrol.cpp - the 2010 C code, compiled as C++
#include <cstdio>
#include <cstring>

struct Student {
    char id[16];
    char name[24];
    int  score;                         // 0-100 points
};

int main() {
    Student s;
    char line[128];
    std::strcpy(s.id, "RP-2024-0137");
    s.score = 85;                       // score entered first

    std::fgets(line, sizeof line, stdin);
    line[std::strcspn(line, "\n")] = '\0';
    std::strcpy(s.name, line);          // then the name is corrected

    std::printf("%s | %s | %d\n", s.id, s.name, s.score);
}`, "enrol.cpp"),
        code("text", String.raw`
$ echo "Nguyễn Văn An" | ./enrol
RP-2024-0137 | Nguyễn Văn An | 85
$ echo "Trần Thị Bích Ngọc" | ./enrol
RP-2024-0137 | Trần Thị Bích Ngọc | 99
$ echo "Nguyễn Thị Phương Thảo" | ./enrol
RP-2024-0137 | Nguyễn Thị Phương Thảo | -1159632812`),
        p("Writing past the end of `name` is **undefined behaviour**: the C++ standard says nothing about what happens next. In our run the bytes simply went to the next field. The 25th byte of the name is `c` (byte value 99) and the 26th is the `'\\0'`, so the first two bytes of `score` became 99 and 0 - and on this little-endian x86 machine that reads as the number 99. A 30-byte name overwrote all four bytes of `score` and ran 3 bytes past the struct. Another compiler or another struct layout can do something different."),
        h3("What the tools see"),
        p("AddressSanitizer (`-fsanitize=address`) puts guard zones around every variable and checks every write. For the 30-byte name it stops the program:"),
        code("text", String.raw`
$ g++ -std=c++23 -g -fsanitize=address enrol.cpp -o enrol && echo "Nguyễn Thị Phương Thảo" | ./enrol
==12==ERROR: AddressSanitizer: stack-buffer-overflow on address 0x70a5162d005c ...
WRITE of size 31 at 0x70a5162d005c thread T0
    #0 0x74a5184862a8 in strcpy ../../../../src/libsanitizer/asan/asan_interceptors.cpp:575
    #1 0x6311badd74d6 in main /w/enrol.cpp:19
  This frame has 2 object(s):
    [48, 92) 's' (line 12) <== Memory access at offset 92 overflows this variable
    [128, 256) 'line' (line 13)
SUMMARY: AddressSanitizer: stack-buffer-overflow /w/enrol.cpp:19 in main`),
        p("For \"Trần Thị Bích Ngọc\" the same build prints `RP-2024-0137 | Trần Thị Bích Ngọc | 99` and exits normally: **no report**. ASan guards the edges of the whole `s` variable (44 bytes), and a write from `name` into `score` stays inside it. The bug that actually hit the student is invisible to the sanitizer. With `-O2` this g++ build also turns on `_FORTIFY_SOURCE`, which checks `strcpy` against the size of `name` itself: both long names then end with `*** buffer overflow detected ***: terminated`. Add `-U_FORTIFY_SOURCE` and the 30-byte name silently prints `-1159632812` again. The 2010 build had no such check, and checks like these depend on the compiler, the C library and the flags - the code is still wrong."),
        p("The `sizeof` bug is easier to catch, because g++ warns about it at compile time:"),
        code("cpp", String.raw`
// average.cpp - from the C grade tool
#include <cstdio>

double average(int scores[4]) {
    int n = sizeof(scores) / sizeof(scores[0]);
    int sum = 0;
    for (int i = 0; i < n; ++i) sum += scores[i];
    return (double)sum / n;
}

int main() {
    int scores[4] = {85, 70, 90, 61};
    std::printf("in main: %zu elements\n", sizeof(scores) / sizeof(scores[0]));
    std::printf("average: %.1f\n", average(scores));
}

// average.cpp:5:20: warning: 'sizeof' on array function parameter 'scores' will return size of 'int*' [-Wsizeof-array-argument]
// in main: 4 elements
// average: 77.5`, "average.cpp"),
        p("`int scores[4]` in a parameter list is a lie - and so is `int scores[MAX_STUDENTS]`: the compiler reads both as `int* scores`. An array passed to a function **decays** to a pointer to its first element, and the size is lost. `sizeof(int*)` is 8 and `sizeof(int)` is 4 on this machine, so `n` is 2, and the \"average\" is (85 + 70) / 2 = 77.5 instead of 76.5. In C, the only fix is to pass the length as a second parameter and hope every caller gets it right."),
        p("All three bugs have one root cause: a C array is a fixed block of bytes that does not know its own size and cannot grow. C++ has types that do both."),

        h2("3. std::string owns its text"),
        p("`std::string` (header `<string>`) is a sequence of bytes that **owns** its memory. It knows its length, it allocates more room when the text grows, and it frees the memory when the string is destroyed. You never write a size, never call `strcpy`, and never think about the `'\\0'`."),
        code("cpp", String.raw`
#include <print>
#include <string>

int main() {
    std::string full = "Nguyễn";
    full += ' ';                            // append one char
    full += "Thị Phương Thảo";              // append text
    std::println("{} ({} bytes)", full, full.size());

    std::string id = "RP-2024-0137";
    std::string label = id + " " + full;    // + builds a new string
    std::println("{}", label);
    std::println("{}", id == "RP-2024-0137");          // compares the text
}

// Nguyễn Thị Phương Thảo (30 bytes)
// RP-2024-0137 Nguyễn Thị Phương Thảo
// true`, "strings.cpp"),
        bullets([
            "**`+=` appends** a char, a string literal or another `std::string`. The string grows as needed; there is no buffer to overflow.",
            "**`+` builds a new string**, so `id + \" \" + full` works as long as one side of the first `+` is a `std::string`.",
            "**`==` compares the text.** In C, `==` on two `char*` compares addresses and you need `strcmp`. On `std::string`, `==`, `!=` and `<` compare the characters.",
            "**`std::println`** (header `<print>`, C++23) prints with `{}` placeholders and a newline. The lesson on reading input covers it and `std::cin` properly.",
        ]),
        h3("size() counts bytes, not letters"),
        p("A `std::string` does not know about letters. It stores bytes, and Vietnamese text in UTF-8 uses 1 byte for ASCII letters, 2 bytes for letters like `ă`, `ê`, `ơ`, `í`, and 3 bytes for letters with two marks like `ầ`, `ễ`, `ọ`:"),
        code("cpp", String.raw`
std::string name = "Trần Thị Bích Ngọc";
std::println("{} bytes", name.size());      // 25 bytes
std::string ascii = "Tran Thi Bich Ngoc";
std::println("{} bytes", ascii.size());     // 18 bytes`),
        p("This is exactly the number the old `char name[24]` needed, and exactly what the person who chose 24 did not count. `size()` (and `length()`, which is the same) is the right number for storage, file formats and network messages. It is the wrong number for \"how many letters will the user see\": counting those needs a Unicode library. For the enrolment tool it no longer matters - a `std::string` holds a name of any length."),
        callout("warning", "Do not index into UTF-8 text",
            "name[3] is the 4th BYTE, not the 4th letter. For \"Trần\" it is the first of the three bytes of ầ. Cutting a string at an arbitrary byte position can split a letter in half and leave invalid UTF-8. Cut only at positions you found by searching for ASCII characters such as ';', ' ' or '-', which are always 1 byte and never part of another letter."),

        h2("4. Searching and cutting strings"),
        p("Most text processing is \"find a separator, take the part before it, take the part after it\". `std::string` has members for each step:"),
        code("cpp", String.raw`
std::string id = "RP-2024-0137";

std::size_t dash = id.find('-');             // index of the first '-'
std::println("{}", dash);                    // 2
std::string year = id.substr(dash + 1, 4);   // 4 bytes starting after the dash
std::println("{}", year);                    // 2024
std::println("[{}]", id.substr(8));          // [0137]  - from index 8 to the end

std::println("{}", id.find("CS101") == std::string::npos);   // true
std::println("{}", std::string::npos);                       // 18446744073709551615`, "split.cpp"),
        bullets([
            "**`find(x)`** returns the index of the first match, counting from 0. `find(x, from)` starts searching at index `from`, which is how you find the second separator: search again starting one past the first.",
            "**`std::string::npos`** is what `find` returns when there is no match. It is the largest value a `std::size_t` can hold, not -1 and not 0. Always compare with `npos` before you use the result.",
            "**`substr(pos, count)`** returns a new string with up to `count` bytes starting at `pos`. Leave out `count` to take everything to the end. To take the text **between** two separators at `a` and `b`, start at `a + 1` and take `b - a - 1` bytes - draw the indexes on paper once, because off-by-one here is the most common string bug.",
            "**`find_first_not_of(' ')` and `find_last_not_of(' ')`** find the first and last byte that is not a space - the two positions you need to trim spaces from both ends.",
        ]),
        h3("starts_with, ends_with, contains"),
        p("For the common yes/no questions you do not need `find` at all. `starts_with` and `ends_with` arrived in C++20, `contains` in C++23:"),
        code("cpp", String.raw`
std::string id = "RP-2024-0137";
std::string full = "Nguyễn Thị Phương Thảo";
std::println("{} {} {}", id.starts_with("RP-2024"), id.ends_with("0137"), full.contains("Phương"));
// true true true`),
        p("Each of them takes a single `char` too: `line.starts_with('#')` asks whether the first byte is `#`, and it is simply `false` for an empty string - no index check needed."),

        h2("5. std::vector: an array that knows its size and grows"),
        p("`std::vector<T>` (header `<vector>`) is the C++ replacement for `T array[N]` plus a `count` variable. It stores its elements next to each other in memory, like an array, but it owns that memory, knows how many elements it holds, and grows when you add more."),
        code("cpp", String.raw`
#include <print>
#include <string>
#include <vector>

struct Student {
    std::string id;
    std::string name;
    int score;
};

int main() {
    std::vector<int> scores;
    for (int i = 0; i < 41; ++i) scores.push_back(60 + i % 40);
    std::println("{} scores, front {}, back {}", scores.size(), scores.front(), scores.back());

    std::vector<Student> cls;
    cls.push_back(Student{"RP-2024-0137", "Nguyễn Văn An", 85});
    cls.emplace_back("RP-2024-0138", "Trần Thị Bích Ngọc", 85);
    for (const Student& s : cls)
        std::println("{} | {} | {}", s.id, s.name, s.score);
    std::println("empty: {}", cls.empty());
}

// 41 scores, front 60, back 60
// RP-2024-0137 | Nguyễn Văn An | 85
// RP-2024-0138 | Trần Thị Bích Ngọc | 85
// empty: false`, "vectors.cpp"),
        bullets([
            "**`push_back(x)`** adds a copy of `x` (or moves it) at the end. **`emplace_back(args...)`** builds the element in place from the arguments. For a simple struct both are fine; reach for `emplace_back` when you would otherwise build a temporary just to pass it.",
            "**`size()`** is the number of elements, and it travels with the vector. A function that takes `const std::vector<int>&` always knows the length - nothing decays.",
            "**Range-for** - `for (const Student& s : cls)` - visits every element once, in order, without an index that can be off by one. Use `const&` so a `Student` with two strings is not copied on every step (references are from the lesson on types, references and const).",
            "**`front()`, `back()`, `empty()`**: first element, last element, \"are there none?\". `front()` and `back()` on an empty vector are undefined behaviour, so check `empty()` first.",
        ]),
        h3("[] is unchecked, at() throws"),
        p("`v[i]` does no bounds check in an optimised build. `v.at(i)` checks and throws `std::out_of_range` with a message you can log:"),
        code("cpp", String.raw`
std::vector<int> scores(41, 70);      // 41 elements, valid indexes 0..40
try {
    std::println("{}", scores.at(41));
} catch (const std::out_of_range& e) {
    std::println("out_of_range: {}", e.what());
}
// out_of_range: vector::_M_range_check: __n (which is 41) >= this->size() (which is 41)`),
        p("`scores[41]` is undefined behaviour. With `-O2` our run printed `0` and carried on - another run may print anything or crash. g++ 15 turns on library assertions for unoptimised builds, so the same line built without `-O` stopped with `Assertion '__n < this->size()' failed.` and `-D_GLIBCXX_DEBUG` gives the clearest message: `Error: attempt to subscript container with out-of-bounds index 41, but container only holds 41 elements.` Use `[]` in loops whose bounds come from `size()`; use `at()` where the index comes from outside (a file, user input), and build tests with `-D_GLIBCXX_DEBUG` or `-fsanitize=address,undefined`."),
        h3("size vs capacity: reserve and resize"),
        p("A vector has two numbers. **size** is how many elements it holds. **capacity** is how many fit in the memory it has already allocated. When `push_back` finds size equal to capacity, the vector allocates a bigger block (libstdc++ doubles it), moves the elements over and frees the old block:"),
        code("cpp", String.raw`
std::vector<int> v;
for (int i = 1; i <= 9; ++i) {
    v.push_back(i);
    std::print("{}/{} ", v.size(), v.capacity());
}
// 1/1 2/2 3/4 4/4 5/8 6/8 7/8 8/8 9/16

std::vector<int> a;
a.reserve(41);         // room for 41, still empty
std::println("reserve: size {} capacity {}", a.size(), a.capacity());
std::vector<int> b;
b.resize(41);          // 41 elements, each set to 0
std::println("resize:  size {} capacity {} b[40]={}", b.size(), b.capacity(), b[40]);
// reserve: size 0 capacity 41
// resize:  size 41 capacity 41 b[40]=0`, "capacity.cpp"),
        bullets([
            "**`reserve(n)`** only allocates. The vector stays empty, and you add elements with `push_back`. Use it when you know roughly how many elements are coming, to skip the reallocations.",
            "**`resize(n)`** changes the size: it adds value-initialised elements (0 for `int`, empty strings) or removes elements from the end. Use it when you want `n` elements to assign by index.",
            "**The classic mix-up:** `reserve(41)` followed by `v[0] = 85` writes to an element that does not exist - the size is still 0. After `reserve`, use `push_back`.",
            "**Reallocation moves the elements**, so references and pointers to elements are no longer valid after a `push_back` that grows the vector. The lesson on iterators and invalidation is about exactly that.",
        ]),
        image("fixed-array-vs-owned-buffer", {
            alt: "Two panels. Left, in red, titled C: fixed bytes inside the struct: the memory of struct Student shows name[24] as one block of bytes 0 to 23 followed by the four bytes of int score. Before the edit, name holds \"Tran Thi Bich Ngoc\" plus the terminating zero (19 of 24 bytes) and score holds the bytes 55 00 00 00, which is 85. After strcpy of \"Trần Thị Bích Ngọc\", name is full with 24 bytes and the 25th byte c (0x63) and the terminating zero land in the first two bytes of score, which now reads 63 00 00 00 = 99. Notes: strcpy wrote 26 bytes into 24; ASan was silent because the write stays inside the struct; Student students[40] has no slot for student 41; sizeof on an array parameter gives 8 / 4 = 2. Right, in green, titled C++: the object owns a heap buffer: a std::string object holding a data pointer, size 25 and capacity 36 points to a heap buffer with the 25 bytes of the name and a terminating zero; a std::vector<Student> object holding a data pointer, size 41 and capacity 64 points to a heap block with elements 0 to 40 and 23 free slots. A note says push_back at full capacity allocates a block twice as big, moves the elements and frees the old block, and that the score is a separate member that a longer name can never reach.",
            caption: "A C array is a fixed number of bytes in place. std::string and std::vector keep size and capacity and replace their heap buffer when it is full.",
        }),

        h2("6. Fixed size done right: std::array and std::span"),
        p("Sometimes the size really is fixed: a grade always has 4 components (attendance, two tests, final exam). For that, use **`std::array<int, 4>`** (header `<array>`). It is a plain C array inside a struct - no heap, same speed - but it has `size()`, `at()`, range-for, can be copied and compared with `==`, and it does not decay to a pointer when you pass it to a function."),
        p("And when a function only needs to **read** a sequence of `int`s and should not care whether the caller has a vector, an `std::array` or an old C array, give it a **`std::span<const int>`** (header `<span>`, C++20). A span is exactly the C pair \"pointer + length\", done right: it is built from the container automatically, so the length cannot be wrong, and it does not own or copy the elements."),
        code("cpp", String.raw`
#include <array>
#include <print>
#include <span>
#include <vector>

double average(std::span<const int> scores) {
    if (scores.empty()) return 0.0;
    int sum = 0;
    for (int x : scores) sum += x;
    return static_cast<double>(sum) / scores.size();
}

int main() {
    std::array<int, 4> weights = {10, 20, 30, 40};      // fixed: 4 components of a grade
    std::vector<int> scores = {85, 70, 90, 61};
    int legacy[3] = {50, 60, 70};
    std::println("{} {}", weights.size(), average(weights));
    std::println("{} {}", scores.size(), average(scores));
    std::println("{}", average(legacy));
}

// 4 25
// 4 76.5
// 60`, "span.cpp"),
        p("Compare the middle line with the C version: the same four scores now give 76.5, because the span knows it has 4 elements. The C array `legacy` converts to a span too, with its length taken from its type at the call site, where it is still known."),

        h2("7. Your turn"),
        p("The roster import is the next tool to port. The exam office edits the roster files by hand, so they have spaces around fields, empty lines, lines with only spaces and `#` comments. Parse them into a `std::vector` of records with `std::string` fields, and list the students whose names would not have fitted the old `char name[24]` - counted in bytes."),
        challenge("chal_coding_cppf_121", "Trim the whole line first, then decide whether to skip it. For each separator, write the index of the ';' and the first and last byte of the field you want on paper before you write the substr call. A field of 24 bytes needs 25 bytes in a C char array."),

        h2("8. The fix"),
        p("The ported record uses `std::string` for text and the class is a `std::vector<Student>`. There is no maximum class size, no maximum name length, and the average takes the vector itself, so the length cannot get lost:"),
        code("cpp", String.raw`
// enrol.cpp - the C++23 port
#include <print>
#include <string>
#include <vector>

struct Student {
    std::string id;
    std::string name;
    int score;          // 0-100 points
};

double average(const std::vector<Student>& students) {
    if (students.empty()) return 0.0;
    int sum = 0;
    for (const Student& s : students) sum += s.score;
    return static_cast<double>(sum) / students.size();
}

int main() {
    std::vector<Student> cs101;
    for (int i = 1; i <= 40; ++i)
        cs101.push_back(Student{std::format("RP-2024-{:04}", i), "Sinh viên", 70});
    cs101.push_back(Student{"RP-2024-0137", "Tran Thi Bich Ngoc", 85});   // student 41

    Student& s = cs101.back();
    s.name = "Trần Thị Bích Ngọc";         // the correction that broke the C tool
    std::println("{} | {} | {}", s.id, s.name, s.score);
    std::println("{} students, capacity {}, average {:.2f}",
                 cs101.size(), cs101.capacity(), average(cs101));
    std::println("name: size {} capacity {}", s.name.size(), s.name.capacity());
}

// RP-2024-0137 | Trần Thị Bích Ngọc | 85
// 41 students, capacity 64, average 70.37
// name: size 25 capacity 36`, "enrol.cpp"),
        numbered([
            "**`std::string name`** instead of `char name[24]`: assigning a longer name makes the string allocate a bigger buffer of its own (here capacity 36 for 25 bytes). `score` is a separate member; no name can reach it.",
            "**`std::vector<Student>`** instead of `students[40]` plus `count`: student 41 is one more `push_back`. The vector went from capacity 32 to 64 when it grew.",
            "**`average(const std::vector<Student>&)`** instead of `int scores[40]`: the function gets the real container by reference, `size()` is always right, and the empty-class case is handled explicitly instead of dividing by zero.",
            "**No `strcpy`, no `sizeof` tricks, no `'\\0'`.** The types keep track of the sizes, so there is nothing to get wrong.",
        ]),
        callout("info", "Where the old limits still matter",
            "The exam office still sends files to a national system with fixed-width fields. When a byte limit is real, check it explicitly with name.size() at that boundary and report the record - do not let it decide how your program stores the name."),

        h2("9. Pitfalls"),
        bullets([
            "**Counting letters with `size()`**: it counts bytes. \"Trần Thị Bích Ngọc\" is 18 letters and 25 bytes. Use `size()` for storage limits and never cut UTF-8 text at an arbitrary byte index.",
            "**Using `find` without checking `npos`**: `line.substr(line.find(';') + 1)` on a line without `;` computes `npos + 1`, which wraps around to 0 - you silently get the whole line back.",
            "**Off-by-one in `substr`**: the second argument is a **count**, not an end index, and the field starts one byte **after** the separator that `find` returned.",
            "**`substr` with a start past the end** throws `std::out_of_range`; a start exactly at `size()` returns an empty string.",
            "**`\"RP-\" + \"2024\"`** does not compile (`error: invalid operands of types 'const char [4]' and 'const char [5]' to binary 'operator+'`): two string literals are two C arrays, not strings. Make one of them a `std::string` first.",
            "**`v[i]` out of range**: undefined behaviour, silent in an optimised build. Use `at()` for indexes from outside the program, and test with `-D_GLIBCXX_DEBUG` or ASan.",
            "**`reserve` then `v[i] = ...`**: `reserve` does not create elements. Use `push_back`, or `resize` if you want elements to assign.",
            "**`sizeof` on an array parameter**: it measures a pointer. Take `std::span`, `const std::vector<T>&` or `const std::array<T, N>&` instead, and keep `-Wall` on: g++ warns about this one.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Text is `std::string`, never `char name[N]` with `strcpy`, `strcat` or `sprintf`.",
            "A list whose length is not known at compile time is a `std::vector`; a list with a truly fixed length is a `std::array`.",
            "Functions take `const std::vector<T>&`, `const std::string&` or `std::span<const T>` - never a raw pointer plus a separate length.",
            "Every `find` result is compared with `std::string::npos` before it is used in `substr`.",
            "Byte limits of files, databases and old systems are checked with `size()` at the boundary, and the code says they are bytes.",
            "Indexes that come from input use `at()` or an explicit check against `size()`.",
            "`reserve` is used with `push_back`; `resize` is used when you need elements to assign.",
            "Debug and test builds use `-Wall -Wextra` and `-fsanitize=address,undefined` or `-D_GLIBCXX_DEBUG`.",
        ]),
    ],
});
