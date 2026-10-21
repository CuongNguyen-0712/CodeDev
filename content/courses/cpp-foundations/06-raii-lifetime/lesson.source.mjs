// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cppf-2-3",
    title: "Object lifetime & RAII",
    slug: { _type: "slug", current: "cpp-object-lifetime-raii" },
    description:
        "The transcript exporter, ported line by line from C, opened one FILE* per student and returned early for students without scores - without calling fclose. At student 2,043 of 4,800 the job stopped with \"Too many open files\". Learn when C++ objects are created and destroyed, how destructors and RAII release a resource on every path out of a function (normal return, early return, exception), why std::ofstream and std::unique_ptr replace fopen/fclose and new/delete, and how references and std::string_view dangle when they outlive the object they point at.",
    estimatedTime: 22,

    scenario: {
        role: "Junior developer on the exam office tools team at Riverside Polytechnic, Hồ Chí Minh City",
        problem:
            "The end-of-semester transcript export writes one file per student. The C++ port kept the C code's fopen/fclose, and the new early return for students who have not sat an exam yet skips the fclose. The nightly job for 4,800 students died at RP-2024-2043 with \"Too many open files\", and 2,758 students got no transcript in the morning.",
    },

    content: [
        h2("1. The incident"),
        p("The transcript exporter was one of the first tools ported from C. The port was careful: `char` buffers became `std::string`, arrays became `std::vector`. The file handling stayed as it was, because it \"worked\". Then a colleague added one feature: first-year students who have not sat an exam yet should get an empty transcript file instead of a page of zeros."),
        code("cpp", String.raw`
// Ported from transcript.c: one file per student.
bool export_transcript(const Student& s) {
    std::string path = "out/" + s.id + ".txt";
    FILE* f = std::fopen(path.c_str(), "w");
    if (f == nullptr) {
        std::println("cannot open {}: {} (errno {})", path, std::strerror(errno), errno);
        return false;
    }
    if (s.scores.empty()) {
        return true;              // nothing to print - but f is still open
    }
    for (double x : s.scores) std::fprintf(f, "%.1f\n", x);
    std::fclose(f);
    return true;
}`, "transcript_export.cpp"),
        p("The nightly job exports the whole college in one process: 4,800 students, every second one in this run without scores. It stopped after 2,042 students with this line in the log, and the remaining 2,758 transcripts were never written:"),
        code("text", String.raw`
cannot open out/RP-2024-2043.txt: Too many open files (errno 24)
stopped after 2042 students`),
        bullets([
            "**Each `fopen` takes a file descriptor from the operating system.** Linux gives a process a limited number of them; `ulimit -n` shows the limit, and 1024 is a common default.",
            "**`return true;` leaves the function without `fclose`.** The `FILE*` variable `f` disappears, but the open file behind it does not: nothing in C closes a file for you.",
            "**Nothing failed where the bug is.** Each leaking call returned `true`. The error appeared 2,042 students later, in a call that was correct.",
        ]),

        h2("2. Reproduce it"),
        p("The program below is the exporter with a loop around it: 4,800 students, the even-numbered ones without scores. Inside the course's Linux container (g++ 15.2, `-std=c++23`) it was run with the limit set explicitly to the common default:"),
        code("cpp", String.raw`
#include <cerrno>
#include <cstdio>
#include <cstring>
#include <format>
#include <print>
#include <string>
#include <vector>

struct Student {
    std::string id;
    std::vector<double> scores;
};

// export_transcript() exactly as in section 1

int main() {
    int exported = 0;
    for (int i = 1; i <= 4800; ++i) {
        // every 2nd student has not sat an exam yet
        Student s{std::format("RP-2024-{:04}", i), {}};
        if (i % 2 == 1) s.scores = {7.5, 8.0};
        if (!export_transcript(s)) {
            std::println("stopped after {} students", exported);
            return 1;
        }
        ++exported;
    }
    std::println("exported {}", exported);
}`, "leak.cpp"),
        code("bash", String.raw`
$ g++ -std=c++23 -Wall -Wextra -g leak.cpp -o leak && mkdir -p out
$ ulimit -n 1024; ./leak
cannot open out/RP-2024-2043.txt: Too many open files (errno 24)
stopped after 2042 students`),
        p("The numbers add up exactly. Descriptors 0, 1 and 2 are stdin, stdout and stderr, which leaves 1,021. Students 2, 4, 6, ..., 2042 are the 1,021 students without scores, and each one leaked a descriptor. Student 2043 found none left. `errno` 24 is `EMFILE`, \"too many open files\" for this process. With `ulimit -n 64` the same program stops after 122 students; with the container's own limit of 1,048,576 it finishes - which is why it passed on the developer's machine."),
        callout("warning", "A leak is a bug even when the job finishes",
            "Raising the limit only moves the failure. A long-running service that leaks one descriptor per request dies after days instead of minutes, and the error then points at whatever code happened to open the next file."),

        h2("3. Scope and lifetime: when objects die"),
        p("In C++, a variable declared inside a function or a block `{ ... }` is an **automatic object**. Its **lifetime** - the time during which the object exists - begins when its declaration runs and ends when control leaves the enclosing block, whichever way it leaves: falling off the closing brace, `return`, `break`, or an exception passing through. At that moment C++ calls the object's **destructor**, a special member function named `~ClassName()` that runs exactly once, when the object dies."),
        p("A class that prints in its constructor and destructor makes this visible:"),
        code("cpp", String.raw`
#include <print>
#include <string>

struct Trace {
    std::string name;
    explicit Trace(std::string n) : name(std::move(n)) { std::println("  open  {}", name); }
    ~Trace() { std::println("  close {}", name); }
};

void export_one() {
    Trace file("transcript file");
    Trace lock("print lock");
    std::println("  ... writing ...");
}   // <- both die here, in reverse order

int main() {
    std::println("main starts");
    Trace log("log");
    {
        Trace a("block A");
        std::println("  inside the block");
    }
    std::println("after the block");
    export_one();
    std::println("main ends");
}`, "trace.cpp"),
        code("text", String.raw`
main starts
  open  log
  open  block A
  inside the block
  close block A
after the block
  open  transcript file
  open  print lock
  ... writing ...
  close print lock
  close transcript file
main ends
  close log`),
        bullets([
            "**A block ends a lifetime.** `block A` is closed at the inner `}`, before `after the block` is printed - not at the end of `main`.",
            "**Reverse order of construction.** `print lock` was built after `transcript file`, so it is destroyed first. Later objects may depend on earlier ones, so they must go first.",
            "**Only what was built is destroyed.** If a function returns before a declaration is reached, that object never existed and gets no destructor call.",
            "**Members die with their object.** When a `Trace` dies, its `std::string name` member is destroyed right after the destructor body runs - which is how `std::string` and `std::vector` free their memory without you writing anything.",
        ]),
        p("This is the difference from C. In C, a local `FILE*` is just an address: when it goes out of scope, the address is forgotten and nothing else happens. In C++, a local **object** going out of scope runs code - and that code can close the file."),

        h2("4. RAII: the destructor does the cleanup"),
        p("**RAII** stands for \"Resource Acquisition Is Initialization\". The name is clumsy; the idea is simple. A **resource** is anything you must give back: an open file, memory, a lock, a network connection, a database transaction. With RAII you tie the resource to an object:"),
        numbered([
            "**Acquire in the constructor.** The object either owns a working resource or the constructor throws - there is no half-open state.",
            "**Release in the destructor.** The compiler calls it on every way out of the scope, so you cannot forget it on one path.",
            "**Use the object, not the raw handle.** The rest of the code never calls the release function itself.",
        ]),
        h3("The standard library already does it"),
        p("You rarely write such a class yourself. `std::ofstream` (write) and `std::ifstream` (read) from `<fstream>` open a file in their constructor and close it in their destructor; `std::string` and `std::vector` do the same for memory. This program counts the process's open file descriptors (Linux keeps a list in `/proc/self/fd`) after each of three calls: one that returns normally, one that returns early, one where a score throws:"),
        code("cpp", String.raw`
#include <cstdio>
#include <format>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <print>
#include <stdexcept>
#include <string>
#include <vector>

// How many file descriptors this process has open right now (Linux).
long open_fds() {
    auto it = std::filesystem::directory_iterator("/proc/self/fd");
    return std::distance(it, std::filesystem::directory_iterator{}) - 1;  // minus the iterator's own
}

void check(double score) {
    if (score < 0 || score > 10) throw std::invalid_argument("score out of range");
}

// C style: three ways out, fclose on one of them
void export_c(const std::string& path, const std::vector<double>& scores) {
    FILE* f = std::fopen(path.c_str(), "w");
    if (!f) return;
    if (scores.empty()) return;                  // exit 2: early return
    for (double x : scores) {
        check(x);                                // exit 3: exception
        std::fprintf(f, "%.1f\n", x);
    }
    std::fclose(f);                              // exit 1: normal
}

// C++ style: the stream closes itself on every way out
void export_cpp(const std::string& path, const std::vector<double>& scores) {
    std::ofstream out(path);
    if (!out) return;
    if (scores.empty()) return;
    for (double x : scores) {
        check(x);
        out << x << '\n';
    }
}

template <class F>
void run(const char* label, F export_fn) {
    const std::vector<std::vector<double>> cases = {{7.5, 8.0}, {}, {7.5, 12.0}};
    const char* names[] = {"normal", "early return", "exception"};
    for (int i = 0; i < 3; ++i) {
        std::string note;
        try {
            export_fn("t.txt", cases[i]);
        } catch (const std::exception& e) {
            note = std::format("  (threw: {})", e.what());
        }
        std::println("{} {:<13} open fds: {}{}", label, names[i], open_fds(), note);
    }
}

int main() {
    std::println("start          open fds: {}", open_fds());
    run("C  ", export_c);
    run("C++", export_cpp);
}`, "paths.cpp"),
        code("text", String.raw`
start          open fds: 3
C   normal        open fds: 3
C   early return  open fds: 4
C   exception     open fds: 5  (threw: score out of range)
C++ normal        open fds: 5
C++ early return  open fds: 5
C++ exception     open fds: 5  (threw: score out of range)`),
        p("The C version leaks on two of its three paths: the count goes from 3 to 5 and stays there. The `std::ofstream` version never raises it. When `check` throws, the exception travels up through `export_cpp` to the `catch` in `run`; on the way, C++ destroys every automatic object in the scopes it leaves. This is called **stack unwinding**, and it is why RAII also covers exceptions - paths that do not even appear in the source code as a `return`."),
        image("three-exit-paths", {
            alt: "Two panels comparing the three ways out of export_transcript(). Left, in red, titled C style: close by hand, starting with FILE* f = std::fopen(path, \"w\"): path 1, normal return, reaches std::fclose(f) and the file is closed; path 2, early return because the student has no scores, and path 3, an exception because score 12.0 is out of range, both skip fclose and the descriptor stays open. A note says 2 of 3 paths leak one file descriptor per student and with a limit of 1024 fopen fails with Too many open files. Right, in green, titled RAII: the object closes itself, starting with std::ofstream out(path): all three paths end in ~ofstream() and the file is closed, the exception path while unwinding. A note says the compiler calls the destructor on every exit. A bottom band states the rule: acquire in the constructor, release in the destructor; the same rule drives std::unique_ptr and your own guard classes.",
            caption: "fclose() must be written on every path. A destructor is called on every path by the compiler.",
        }),
        h3("Writing your own RAII class"),
        p("When a C API hands you a handle with an open and a close function - `FILE*`, a database connection, a socket - wrap it once. Here is a minimal owner for a `FILE*`, for code that must keep using `fprintf`:"),
        code("cpp", String.raw`
#include <cstdio>
#include <print>
#include <stdexcept>
#include <string>

// Owns one FILE*: opens it in the constructor, closes it in the destructor.
class File {
public:
    File(const std::string& path, const char* mode) : f_(std::fopen(path.c_str(), mode)) {
        if (f_ == nullptr) throw std::runtime_error("cannot open " + path);
        std::println("fopen  {}", path);
    }
    ~File() {
        std::fclose(f_);
        std::println("fclose");
    }
    File(const File&) = delete;              // a copy would fclose the same FILE* twice
    File& operator=(const File&) = delete;

    FILE* get() const { return f_; }

private:
    FILE* f_;
};

bool export_transcript(const std::string& id, int score_count) {
    File out("out-" + id + ".txt", "w");
    if (score_count == 0) return false;      // early return: ~File() still runs
    std::fprintf(out.get(), "%s\n", id.c_str());
    return true;
}

int main() {
    export_transcript("RP-2024-0137", 3);
    export_transcript("RP-2024-0138", 0);
}`, "file.cpp"),
        code("text", String.raw`
fopen  out-RP-2024-0137.txt
fclose
fopen  out-RP-2024-0138.txt
fclose`),
        p("The second call returns early and still prints `fclose`. The two `= delete` lines matter as much as the destructor. Without them, C++ would generate a copy constructor that copies the pointer, and two `File` objects would each call `fclose` on the same `FILE*` - a double close, which is undefined behaviour. With them, adding `File a(\"copy-test.txt\", \"w\");` and `File b = a;` at the end of `main` does not compile:"),
        code("text", String.raw`
file.cpp: In function ‘int main()’:
file.cpp:37:14: error: use of deleted function ‘File::File(const File&)’
   37 |     File b = a;
      |              ^
file.cpp:17:5: note: declared here
   17 |     File(const File&) = delete;              // a copy would fclose the same FILE* twice
      |     ^~~~`),
        callout("tip", "One owner per resource",
            "A class that owns a resource needs a destructor, and then it must also decide what copying means. For a file, a lock or a handle the honest answer is usually \"it cannot be copied\": delete the copy constructor and the copy assignment. Moving ownership to another object is covered by std::unique_ptr below."),

        h2("5. std::unique_ptr instead of new and delete"),
        p("Memory is a resource too. C has `malloc`/`free`, and old C++ has `new`/`delete` - with exactly the same problem as `fclose`: every path must reach the `delete`, exactly once. Modern C++ does not write `delete` at all. `std::unique_ptr<T>` from `<memory>` is an RAII owner for one object on the heap, and `std::make_unique<T>(args...)` creates the object and the owner in one step:"),
        code("cpp", String.raw`
#include <memory>
#include <print>
#include <string>
#include <utility>

struct Transcript {
    std::string student_id;
    explicit Transcript(std::string id) : student_id(std::move(id)) { std::println("build {}", student_id); }
    ~Transcript() { std::println("free  {}", student_id); }
};

std::unique_ptr<Transcript> load(std::string id) {
    return std::make_unique<Transcript>(std::move(id));   // ownership moves out to the caller
}

int main() {
    auto t = load("RP-2024-0137");
    std::println("t owns {}", t->student_id);
    auto owner = std::move(t);              // the ONE owner is now 'owner'
    std::println("t is {}", t ? "set" : "empty");
    std::println("owner owns {}", owner->student_id);
    std::println("main ends");
}`, "uptr.cpp"),
        code("text", String.raw`
build RP-2024-0137
t owns RP-2024-0137
t is empty
owner owns RP-2024-0137
main ends
free  RP-2024-0137`),
        bullets([
            "**One owner.** Exactly one `unique_ptr` owns the object, and its destructor deletes it - here when `owner` dies at the end of `main`, after `main ends`.",
            "**Ownership moves.** `load` returns the pointer and ownership passes to the caller. `std::move(t)` hands it on explicitly; afterwards `t` is guaranteed to be empty (`nullptr`), so the object is not deleted twice.",
            "**It cannot be copied.** Two owners would delete the same object twice, so the copy constructor is deleted.",
        ]),
        p("Adding `auto copy = owner;` before the last line gives:"),
        code("text", String.raw`
uptr.cpp: In function ‘int main()’:
uptr.cpp:22:17: error: use of deleted function ‘std::unique_ptr<_Tp, _Dp>::unique_ptr(const std::unique_ptr<_Tp, _Dp>&) [with _Tp = Transcript; _Dp = std::default_delete<Transcript>]’
   22 |     auto copy = owner;
      |                 ^~~~~
...
/usr/include/c++/15/bits/unique_ptr.h:524:7: note: declared here
  524 |       unique_ptr(const unique_ptr&) = delete;`),
        p("Use a `unique_ptr` only when you really need an object on the heap - for example an object whose lifetime must outlast the function that creates it, or a large object you pass around by owner. Most of the time a plain local object, a `std::string` or a `std::vector` is the right choice, and they already clean up after themselves."),

        h2("6. Dangling: a reference that outlives its object"),
        p("RAII makes sure resources die on time. The opposite bug is to keep using something **after** it died. A **dangling** reference, pointer or view refers to an object whose lifetime has ended. Reading through it is **undefined behaviour**: the program may print garbage, crash, or seem to work today and fail after a compiler update."),
        h3("Returning a reference to a local"),
        code("cpp", String.raw`
#include <print>
#include <string>

const std::string& transcript_header(const std::string& id) {
    std::string header = "Riverside Polytechnic - transcript of student " + id;
    return header;                 // a reference to a local that dies right here
}

int main() {
    const std::string& h = transcript_header("RP-2024-0137");
    std::println("{}", h);
}`, "dangle.cpp"),
        p("g++ sees this one and warns - the warning is on even without `-Wall`. The run that follows crashed:"),
        code("text", String.raw`
dangle.cpp: In function ‘const std::string& transcript_header(const std::string&)’:
dangle.cpp:6:12: warning: reference to local variable ‘header’ returned [-Wreturn-local-addr]
    6 |     return header;                 // a reference to a local that dies right here
      |            ^~~~~~
dangle.cpp:5:17: note: declared here
...
Segmentation fault (core dumped)`),
        p("With AddressSanitizer (`-fsanitize=address,undefined`) the report says `SEGV on unknown address 0x000000000000`: g++ noticed the reference to a dead local and returned a null address instead. Another compiler or another flag may print garbage instead of crashing - that is what undefined behaviour means. The fix is to return by value: `std::string transcript_header(...)`. Returning a `std::string` does not copy it slowly; the result is moved or built directly in the caller."),
        p("The warning only catches the direct case. Pass the local through another function that returns a reference, and the compiler can no longer see it:"),
        code("cpp", String.raw`
#include <print>
#include <string>

const std::string& longer(const std::string& a, const std::string& b) {
    return a.size() >= b.size() ? a : b;
}

const std::string& display_name(const std::string& family, const std::string& given) {
    std::string full = family + " " + given;
    return longer(full, family);     // no warning: the compiler cannot see that this is 'full'
}

int main() {
    std::string family = "Nguyễn Thị";
    std::string given = "Phương Thảo";
    const std::string& name = display_name(family, given);
    std::println("{}", name);
}`, "dangle2.cpp"),
        code("text", String.raw`
$ g++ -std=c++23 -Wall -Wextra -g dangle2.cpp -o dangle2 && ./dangle2
terminate called after throwing an instance of 'std::bad_alloc'
  what():  std::bad_alloc
Aborted (core dumped)

$ g++ -std=c++23 -Wall -Wextra -g -fsanitize=address,undefined dangle2.cpp -o dangle2 && ./dangle2
==25==ERROR: AddressSanitizer: stack-use-after-return on address 0x6dfa129d0320 ...
READ of size 8 at 0x6dfa129d0320 thread T0
...
    #9 ... in main /w/dangle2.cpp:17
...
  This frame has 2 object(s):
    [32, 64) 'full' (line 9) <== Memory access at offset 32 is inside this variable`),
        p("No warning at all. Without the sanitizer this run read a nonsense length from the dead string and died with `std::bad_alloc`; on another day it may print garbage or seem to work. AddressSanitizer names the exact problem: line 17 reads `full`, a local of `display_name` (line 9) whose function has already returned. This g++ 15 build detected it with plain `-fsanitize=address`; with some other compilers and versions you need `ASAN_OPTIONS=detect_stack_use_after_return=1` in the environment when you run the program."),
        h3("std::string_view of a temporary string"),
        p("`std::string_view` (from `<string_view>`) is a cheap, read-only **view** of characters that someone else owns: just a pointer and a length. That makes it a great parameter type. It is a trap as a variable that stores the result of a function returning `std::string`:"),
        code("cpp", String.raw`
#include <print>
#include <string>
#include <string_view>

std::string full_name(std::string_view family, std::string_view given) {
    return std::string(family) + " " + std::string(given);
}

int main() {
    std::string_view name = full_name("Nguyễn Thị", "Phương Thảo");   // the string dies at the ;
    std::println("{}", name);
}`, "view.cpp"),
        code("text", String.raw`
==37==ERROR: AddressSanitizer: heap-use-after-free on address 0x7ae2dbfe0040 ...
READ of size 30 at 0x7ae2dbfe0040 thread T0
...
    #10 0x583e778c741d in main /w/view.cpp:11
...
freed by thread T0 here:
...
    #6 0x583e778d27b2 in std::__cxx11::basic_string<char, ...>::~basic_string() /usr/include/c++/15/bits/basic_string.h:896
    #7 0x583e778c7335 in main /w/view.cpp:10`),
        p("The `std::string` returned by `full_name` is a **temporary**: an unnamed object that lives until the end of the full expression - the semicolon. The view keeps pointing at its characters after they were freed. Without the sanitizer, this run printed a few garbage bytes followed by the end of the name, `hương Thảo` - no crash, just a wrong transcript. Store the result in a `std::string` instead; use `std::string_view` for parameters and for views of strings that clearly live longer, such as string literals."),
        callout("info", "The one place a temporary lives longer",
            "Binding a temporary directly to a const reference - const std::string& s = make_id(137); - extends the temporary's lifetime to that of the reference. The rule does not reach through a function that returns a reference, and it does not apply to std::string_view or pointers. When in doubt, store a value."),
        challenge("chal_quiz_cppf_231", "For every object, find the closing brace or the semicolon where it dies. Then ask whether anything still points at it after that moment."),

        h2("7. The fix"),
        p("The exporter needs no new class: `std::ofstream` already owns the file, and `std::println` can write to a stream:"),
        code("cpp", String.raw`
#include <format>
#include <fstream>
#include <print>
#include <string>
#include <vector>

struct Student {
    std::string id;
    std::vector<double> scores;
};

bool export_transcript(const Student& s) {
    std::ofstream out("out/" + s.id + ".txt");
    if (!out) {
        std::println("cannot open out/{}.txt", s.id);
        return false;
    }
    if (s.scores.empty()) {
        return true;              // out is closed by ~ofstream() here too
    }
    for (double x : s.scores) std::println(out, "{:.1f}", x);
    return true;
}

int main() {
    int exported = 0;
    for (int i = 1; i <= 4800; ++i) {
        Student s{std::format("RP-2024-{:04}", i), {}};
        if (i % 2 == 1) s.scores = {7.5, 8.0};
        if (!export_transcript(s)) {
            std::println("stopped after {} students", exported);
            return 1;
        }
        ++exported;
    }
    std::println("exported {}", exported);
}`, "transcript_export.cpp"),
        code("bash", String.raw`
$ g++ -std=c++23 -Wall -Wextra -g transcript_export.cpp -o transcript_export && mkdir -p out
$ ulimit -n 1024; ./transcript_export
exported 4800
$ ls out | wc -l
4800`),
        numbered([
            "**`std::ofstream out(...)`** - the file is opened by the constructor and closed by the destructor, on the normal path, on the early return and if anything below throws.",
            "**`if (!out)`** - a stream that could not open is tested like a bool. Opening can still fail (a missing folder, a full disk), so the check stays.",
            "**No `fclose`, no `FILE*`** - there is no line left to forget. A reviewer can check the function without following every path.",
            "**`std::println(out, ...)`** - C++23 `std::print`/`std::println` accept a stream as the first argument, so the format strings stay the same as for the console.",
        ]),
        p("In the lab version of the exporter below, the handles come from a C-style API with `open_handle` and `close_handle`, and there is no standard class for them. You will write the RAII owner yourself."),
        challenge("chal_fix_cppf_232", "Count the ways out of export_transcript(): the normal return, the early return, and the exception that check_score() can throw. A guard object declared at the top of the function is destroyed on all three - and it must not be possible to copy it."),

        h2("8. Pitfalls"),
        bullets([
            "**Manual `fclose`, `free` or `delete` on one path only**: every early return and every exception skips it. Wrap the resource in an object.",
            "**Fixing a leak by adding the close call to each `return`**: the exception path is still open, and the next `return` someone adds will forget it.",
            "**A copyable owner**: a class with a destructor that releases a handle, but no deleted copy constructor, releases the same handle twice as soon as it is passed by value.",
            "**Calling the release function on an RAII object's handle**: `std::fclose(file.get())` next to a `File` that also closes it is a double close.",
            "**`new` and `delete` in new code**: use a local object, a container, or `std::make_unique`.",
            "**Returning a reference or a `std::string_view` to a local or a temporary**: return `std::string` by value. Treat `-Wreturn-local-addr` as an error.",
            "**Trusting a run that \"works\"**: dangling reads are undefined behaviour. Test with `-fsanitize=address,undefined`; if a returned reference to a local is not reported, run with `ASAN_OPTIONS=detect_stack_use_after_return=1`.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Every resource (file, memory, lock, handle) is owned by an object whose destructor releases it.",
            "Files are `std::ofstream`/`std::ifstream`; a C handle with no standard owner gets a small RAII class.",
            "RAII classes delete their copy constructor and copy assignment unless copying has a clear meaning.",
            "No `new`/`delete`: local objects and containers first, `std::make_unique` when a heap object is really needed.",
            "Functions return `std::string` and other objects by value, never a reference or view to a local.",
            "`std::string_view` variables only view strings that clearly outlive them.",
            "Tests run with `-Wall -Wextra` and once with `-fsanitize=address,undefined`, including the early-return and exception paths.",
        ]),
    ],
});
