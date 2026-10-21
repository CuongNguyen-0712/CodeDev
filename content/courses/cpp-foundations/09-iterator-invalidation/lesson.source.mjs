// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cppf-4-1",
    title: "Iterators & invalidation bugs",
    slug: { _type: "slug", current: "cpp-iterators-invalidation-bugs" },
    description:
        "The ported roster tool removed withdrawn students with an index loop and erase, skipped the student right after each one it removed, and put a withdrawn student on the CS101 exam list. The iterator \"fix\" then crashed the nightly job. Learn what an iterator is, which std::vector and std::map operations invalidate iterators, pointers and references, how to remove elements correctly with it = v.erase(it), the erase-remove idiom and std::erase_if, and how _GLIBCXX_DEBUG and AddressSanitizer catch the bugs that a normal build hides.",
    estimatedTime: 22,

    scenario: {
        role: "Junior developer at Riverside Polytechnic, porting the exam office's C tools to C++23",
        problem:
            "The roster clean-up removes withdrawn students before the exam list is printed. On the day of the CS101 final, two withdrawn students were next to each other in the roster, and one of them, Lê Minh Châu, was still on the list: she got a seat, was marked absent, and her transcript showed 0.0 instead of W. The quick iterator rewrite passed its test, then crashed the nightly roster job with a segmentation fault.",
    },

    content: [
        h2("1. The incident"),
        p("Before every exam, the roster tool takes the class roster, removes the students who withdrew from the course, and prints the exam list with seat numbers. The C version walked an array with an index and shifted the rest of the array left with `memmove` whenever it removed a student. The port to C++ kept the loop and replaced `memmove` with `erase`:"),
        code("cpp", String.raw`
// Removes withdrawn students before the exam list is printed.
void remove_withdrawn(std::vector<Student>& roster) {
    for (std::size_t i = 0; i < roster.size(); ++i)
        if (roster[i].withdrawn)
            roster.erase(roster.begin() + i);
}`, "roster.cpp"),
        p("CS101 had 182 students and 6 withdrawals. The roster is sorted by id, and two of the withdrawn students were next to each other: `RP-2024-0137` Trần Thị Bích and `RP-2024-0142` Lê Minh Châu. Bích disappeared from the list as she should. Châu did not: she got seat 41, the invigilator marked her absent, and the grade import turned \"absent\" into 0.0 on her transcript instead of W. It took a complaint and two days to find out why."),
        p("The quick fix was \"use iterators, that is the C++ way\". It passed the test with CS101's roster. Three nights later the roster job for CS204 stopped with `Segmentation fault (core dumped)` and no exam list at all. The last student in CS204's roster, in id order, had withdrawn."),
        bullets([
            "**The first bug is deterministic.** It never crashes; it skips exactly the student after each one it removes. That is why it survived review and testing: no test had two withdrawals in a row.",
            "**The second bug is undefined behaviour.** The same loop with iterators uses an iterator that `erase` has made invalid. Whether it crashes, skips or seems fine depends on the data and the build.",
            "**Both come from one fact:** `erase` changes the positions of everything after the erased element, and the loop kept using the old position.",
        ]),

        h2("2. Reproduce it"),
        p("Save this as `skip.cpp` and build it with `g++ -std=c++23 -Wall -Wextra skip.cpp` (g++ 15.2). Bích and Châu are withdrawn and next to each other, and the last student, Hà, is withdrawn too:"),
        code("cpp", String.raw`
#include <print>
#include <string>
#include <vector>

struct Student {
    std::string id;
    std::string name;
    bool withdrawn;
};

int main() {
    std::vector<Student> cs101 = {
        {"RP-2024-0101", "Nguyễn Văn An", false},
        {"RP-2024-0137", "Trần Thị Bích", true},
        {"RP-2024-0142", "Lê Minh Châu", true},
        {"RP-2024-0158", "Phạm Quốc Dũng", false},
        {"RP-2024-0163", "Võ Thị Hà", true},
    };
    for (std::size_t i = 0; i < cs101.size(); ++i)
        if (cs101[i].withdrawn)
            cs101.erase(cs101.begin() + i);

    for (const Student& s : cs101)
        std::println("{} {}{}", s.id, s.name, s.withdrawn ? "  <- WITHDRAWN" : "");
}
// RP-2024-0101 Nguyễn Văn An
// RP-2024-0142 Lê Minh Châu  <- WITHDRAWN
// RP-2024-0158 Phạm Quốc Dũng`, "skip.cpp"),
        p("No warning, no crash, and Châu is on the list. When `i` is 1, Bích is erased and everyone after her moves one slot to the left, so Châu is now at index 1. Then `++i` makes `i` 2, and the loop looks at Dũng. Index 1 is never checked again."),
        h3("The iterator \"fix\""),
        code("cpp", String.raw`
#include <print>
#include <string>
#include <vector>

struct Student {
    std::string id;
    std::string name;
    bool withdrawn;
};

int main() {
    std::vector<Student> cs101 = {
        {"RP-2024-0101", "Nguyễn Văn An", false},
        {"RP-2024-0137", "Trần Thị Bích", true},
        {"RP-2024-0158", "Phạm Quốc Dũng", false},
        {"RP-2024-0163", "Võ Thị Hà", true},
    };
    for (auto it = cs101.begin(); it != cs101.end(); ++it)
        if (it->withdrawn)
            cs101.erase(it);

    std::println("{} students on the exam list", cs101.size());
}`, "iter.cpp"),
        p("Built with `-O2`, this run printed nothing and ended with `Segmentation fault (core dumped)` (exit code 139). Hà, the withdrawn student, is the last element: after `erase(it)`, `it` sits exactly where `end()` now is, `++it` moves it past the end, and `it != cs101.end()` is never false again - the loop walks off the end of the buffer. With a roster whose last student is not withdrawn, the same loop did not crash in our run: it printed a list with the skipped student still on it, like the index loop. That is undefined behaviour: the result depends on the data, the compiler and the build, and it may differ on your machine."),
        p("Two debugging builds turn the \"sometimes\" into a clear report every time. `-D_GLIBCXX_DEBUG` switches libstdc++ (GCC's standard library) to checked containers and iterators; it stops at the first misuse of an iterator, even when that misuse would not crash:"),
        code("text", String.raw`
$ g++ -std=c++23 -g -D_GLIBCXX_DEBUG iter.cpp && ./a.out
/usr/include/c++/15/debug/safe_iterator.h:392:
In function:
    constexpr gnu_debug::_Safe_iterator<_Iterator, _Sequence, _Category>&
    gnu_debug::_Safe_iterator<_Iterator, _Sequence, _Category>::operator++()
    ...
Error: attempt to increment a singular iterator.

Objects involved in the operation:
    iterator "this" @ 0x7ffe66f59100 {
      type = gnu_cxx::normal_iterator<Student*, std::vector<Student, std::allocator<Student> > > (mutable iterator);
      state = singular;
      ...
    }
Aborted (core dumped)`),
        p("A **singular** iterator is one that does not point into any container any more - here, the `it` that `erase` just invalidated. The error comes on the very first `++it` after an erase, with Bích, long before the end of the vector. AddressSanitizer (`-fsanitize=address`) checks memory instead of iterators; it only fires when the program actually touches memory outside the vector's buffer, which happens at the end:"),
        code("text", String.raw`
$ g++ -std=c++23 -g -fsanitize=address,undefined iter.cpp && ./a.out
==37==ERROR: AddressSanitizer: heap-buffer-overflow on address 0x7393862e0160 ...
READ of size 8 at 0x7393862e0160 thread T0
    #0 ... in std::__cxx11::basic_string<...>::_M_data() const ...
    ...
    #3 ... in Student::operator=(Student&&) /w/iter.cpp:5
    ...
    #11 ... in main /w/iter.cpp:20
0x7393862e0160 is located 0 bytes after 288-byte region [0x7393862e0040,0x7393862e0160)
allocated by thread T0 here:
    ...
    #7 ... in main /w/iter.cpp:17
SUMMARY: AddressSanitizer: heap-buffer-overflow /w/iter.cpp:5 in Student::operator=(Student&&)`),
        p("Line 20 is `cs101.erase(it)`: `it` was already past the last student, and `erase` tried to move \"the elements after it\" out of memory that is not part of the vector. The 288-byte region is the vector's buffer: 4 students of 72 bytes each."),

        h2("3. What an iterator is"),
        p("An **iterator** is a position inside a container. You can read the element at that position, and move to the next position. The interface is borrowed from C pointers on purpose:"),
        bullets([
            "**`v.begin()`** is the position of the first element. **`v.end()`** is the position **one past the last** element - a stop marker, not an element. For an empty container, `begin() == end()`.",
            "**`*it`** is the element at the position (a reference to it, so you can change it). **`it->name`** is `(*it).name`.",
            "**`++it`** moves to the next position. For a vector you can also jump: `it + 3`, and `end() - begin()` is the number of elements.",
            "**Never dereference `end()`** and never move past it. Both are undefined behaviour.",
        ]),
        code("cpp", String.raw`
#include <map>
#include <print>
#include <string>
#include <vector>

int main() {
    std::vector<std::string> ids = {"RP-2024-0101", "RP-2024-0137", "RP-2024-0142"};
    auto it = ids.begin();                          // the position of the first element
    std::println("{}", *it);                        // RP-2024-0101
    ++it;                                           // move to the next position
    std::println("{} has {} chars", *it, it->size());   // RP-2024-0137 has 12 chars
    std::println("end - begin = {}", ids.end() - ids.begin());   // end - begin = 3

    for (auto p = ids.begin(); p != ids.end(); ++p)
        std::print("{} ", p->substr(8));
    std::println();                                 // 0101 0137 0142

    std::map<std::string, double> cs101 = {{"RP-2024-0137", 9.6}, {"RP-2024-0101", 7.5}};
    for (auto m = cs101.begin(); m != cs101.end(); ++m)
        std::println("{} {}", m->first, m->second);
    // RP-2024-0101 7.5
    // RP-2024-0137 9.6
}`, "iterators.cpp"),
        p("The same `begin`/`end`/`++`/`*` works for every standard container, which is why the algorithms from the lesson on STL algorithms take a pair of iterators: `std::sort(v.begin(), v.end())` sorts the range from the first position up to, but not including, `end()`. A `std::map` iterator walks the entries in key order, and `*m` is a `std::pair` of key and value."),
        h3("Range-for is iterators underneath"),
        p("A range-based for loop is a short way to write the iterator loop. The compiler turns the first loop below into roughly the second one:"),
        code("cpp", String.raw`
for (const Student& s : roster) {
    print_seat(s);
}

// is roughly:
{
    auto first = roster.begin();
    auto last = roster.end();               // computed ONCE, before the first pass
    for (; first != last; ++first) {
        const Student& s = *first;
        print_seat(s);
    }
}`),
        p("So a range-for holds two iterators for the whole loop, and `s` is a reference into the container. Anything that invalidates iterators of that container while the loop runs - adding or erasing elements - breaks the loop, even though you never wrote an iterator yourself."),

        h2("4. Invalidation: when a position stops being valid"),
        p("An iterator, pointer or reference is **invalidated** when the element it refers to has moved or is gone. Using it afterwards is undefined behaviour - the compiler does not check, and the program may crash, print old data, or seem fine. Each container documents which operations invalidate what. These are the rules you need every day:"),
        h3("std::vector: push_back may move everything"),
        p("A vector keeps its elements in one block of memory with room for `capacity()` elements. When `push_back`, `emplace_back` or `insert` needs more room than that, the vector allocates a bigger block, moves every element there and frees the old block. Watch it happen:"),
        code("cpp", String.raw`
#include <print>
#include <vector>

int main() {
    std::vector<int> v;
    const int* old = v.data();
    for (int i = 0; i < 10; ++i) {
        v.push_back(i);
        if (v.data() != old) {
            std::println("size {:2}  capacity {:2}  <- moved to a new buffer", v.size(), v.capacity());
            old = v.data();
        }
    }
}
// size  1  capacity  1  <- moved to a new buffer
// size  2  capacity  2  <- moved to a new buffer
// size  3  capacity  4  <- moved to a new buffer
// size  5  capacity  8  <- moved to a new buffer
// size  9  capacity 16  <- moved to a new buffer`, "capacity.cpp"),
        p("libstdc++ doubles the capacity each time (other libraries grow by other factors). After a reallocation, **every** iterator, pointer and reference into the vector points at freed memory. Without a reallocation, `push_back` still invalidates `end()`, and `insert` invalidates everything from the insert position on. This is the scholarship bug the team found while fixing the roster:"),
        code("cpp", String.raw`
#include <print>
#include <string>
#include <vector>

struct Student {
    std::string id;
    std::string name;
    double score;
};

int main() {
    std::vector<Student> ranking = {
        {"RP-2024-0137", "Trần Thị Bích", 9.6},
        {"RP-2024-0101", "Nguyễn Văn An", 9.1},
    };
    const Student& top = ranking[0];          // the scholarship winner
    ranking.push_back({"RP-2024-0158", "Phạm Quốc Dũng", 8.7});   // a late result
    std::println("Scholarship: {} ({})", top.name, top.score);
}`, "scholarship.cpp"),
        p("Built with `-O2`, our run printed `Scholarship: Trần Thị Bích (9.6)` - correct by luck, because the freed memory had not been reused yet. AddressSanitizer shows what really happened:"),
        code("text", String.raw`
$ g++ -std=c++23 -g -fsanitize=address,undefined scholarship.cpp && ./a.out
==50==ERROR: AddressSanitizer: heap-use-after-free on address 0x6e01ed7e0060 ...
READ of size 8 at 0x6e01ed7e0060 thread T0
    ...
    #9 ... in main /w/scholarship.cpp:18
0x6e01ed7e0060 is located 32 bytes inside of 144-byte region [0x6e01ed7e0040,0x6e01ed7e00d0)
freed by thread T0 here:
    #0 ... in operator delete(void*, unsigned long) ...
    ...
    #6 ... in void std::vector<Student, std::allocator<Student> >::_M_realloc_append<Student>(Student&&) ...
    #8 ... in std::vector<Student, std::allocator<Student> >::push_back(Student&&) ...
    #9 ... in main /w/scholarship.cpp:17
previously allocated by thread T0 here:
    ...
SUMMARY: AddressSanitizer: heap-use-after-free /w/scholarship.cpp:18 in main`),
        p("Line 17 is the `push_back` that freed the old 144-byte buffer (2 students), line 18 reads `top.name` from it. The report names both lines, which is what makes ASan so useful: the crash, if there is one, happens far from the cause."),
        h3("std::vector: erase moves everything after it"),
        p("`erase(pos)` destroys one element and moves every element after it one slot to the left. It invalidates iterators and references **at `pos` and after it**; those before `pos` stay valid. It returns an iterator to the element that now sits where the erased one was - the next element, or `end()`. `pop_back()` invalidates only the last element and `end()`."),
        image("held-positions-go-stale", {
            alt: "Two red panels and a rules table. Left panel, titled v.erase(v.begin() + i); ++i;: before, a vector of four slots 0101, 0137 W, 0142 W, 0158 with an arrow i = 1 under 0137 W. After the erase, the slots are 0101, 0142 W, 0158 and an empty slot marked size is 3, with the arrow i = 2 under 0158; the note says 0142 slid into slot 1, already checked, so it is never looked at. Right panel, titled const Student& top = v[0];: an old buffer with size 2 and capacity 2 holding 0137 and 0101, drawn dashed and labelled freed by push_back, with a red arrow top still points here under 0137. Below it the new buffer after v.push_back(...) with size 3 and capacity 4 holds 0137, 0101, 0158 and a spare slot; the notes say the elements were moved, v[0] is now a different address, and reading top.name gives AddressSanitizer: heap-use-after-free. The bottom table lists what each operation invalidates: vector push_back or insert invalidates all iterators, pointers and references if size would exceed capacity, otherwise insert invalidates from the insert point on; vector erase(pos) invalidates pos and everything after it and returns an iterator to the next element; map insert or emplace invalidates nothing; map erase(it) invalidates only the erased element and returns the next iterator.",
            caption: "An index or an iterator is a position, and a reference is an address. erase changes what is at a position; reallocation changes the address.",
        }),
        h3("std::map: elements never move"),
        p("A `std::map` stores every entry in its own tree node, and nodes are never moved. So `insert` and `emplace` invalidate **nothing**, and `erase(it)` invalidates **only** the erased entry. A reference to one student's entry in `std::map<std::string, Student>` stays valid while you add other students. (A `std::unordered_map` is different: inserting can rehash, which invalidates its iterators, but not references to its elements.)"),
        h3("Never add or erase inside a range-for over the same container"),
        p("The range-for keeps `end()` and the current position for the whole loop, so any `push_back` or `erase` on that container inside the loop breaks the loop. Here the vector is full (size 2, capacity 2), so the `push_back` reallocates while the loop still holds positions in the old buffer:"),
        code("cpp", String.raw`
#include <print>
#include <string>
#include <vector>

int main() {
    std::vector<std::string> exam_list = {"RP-2024-0101", "RP-2024-0137"};
    for (const std::string& id : exam_list)
        if (id == "RP-2024-0137")
            exam_list.push_back("RP-2024-0137-RESIT");   // add a resit row while looping
    std::println("{} rows", exam_list.size());
}
// -O2:                       3 rows
// -fsanitize=address:         3 rows   (no report)
// -D_GLIBCXX_DEBUG:           Error: attempt to increment a singular iterator.  Aborted`, "resit.cpp"),
        p("The normal build and even AddressSanitizer printed `3 rows` in our run: the stale iterator was incremented and compared, but no freed memory happened to be read. Only the debug mode, which tracks every iterator, reported the bug. Collect what you want to add in a second vector and append it after the loop, or loop over an index with `i < v.size()` when the loop is meant to see the new elements too."),
        challenge("chal_quiz_cppf_411", "For the loop, write the vector down after every erase and move i by hand. For the iterators, ask two questions: does this operation reallocate (size versus capacity), and is the saved position at or after the changed one? A std::map never moves its nodes."),

        h2("5. Removing elements correctly"),
        p("There are three correct ways to remove elements from a vector while looking at all of them. Each one below removes the three withdrawn students from the five-student CS101 roster of section 2 (the output shows the last four digits of each id). All of them ran clean under `-D_GLIBCXX_DEBUG -fsanitize=address,undefined`."),
        h3("The iterator loop: it = v.erase(it)"),
        code("cpp", String.raw`
for (auto it = cs101.begin(); it != cs101.end(); ) {   // no ++it here
    if (it->withdrawn)
        it = cs101.erase(it);       // erase hands back the next position
    else
        ++it;                       // move on only when nothing was erased
}
// 0101 0158   (size 2)`),
        p("The rule: after an erase, the iterator `erase` returned already points at the next element, so you must **not** increment it as well. Increment only on the path that keeps the element. This is the form you need when each element needs real work (logging, a decision that depends on earlier elements). It works the same for `std::map`: `it = seats.erase(it);` in the erase branch, `++it` in the other."),
        p("Each `erase` moves all the elements after it, so removing k students from n costs up to k x n moves. For a roster of 200 that does not matter; for a million rows it does, and the next two forms move each element at most once."),
        h3("The erase-remove idiom"),
        code("cpp", String.raw`
#include <algorithm>

auto is_withdrawn = [](const Student& s) { return s.withdrawn; };
cs101.erase(std::remove_if(cs101.begin(), cs101.end(), is_withdrawn), cs101.end());
// 0101 0158   (size 2)`),
        p("Despite its name, `std::remove_if` cannot remove anything: an algorithm only sees iterators, not the container. It moves the elements to **keep** to the front, in order, and returns the new logical end. The `erase` then cuts off the tail. Forget the `erase` and the vector keeps its old size:"),
        code("cpp", String.raw`
auto new_end = std::remove_if(cs101.begin(), cs101.end(), is_withdrawn);
std::println("kept {}", new_end - cs101.begin());   // kept 2
// cs101 is now: 0101 0158 0142 "" 0163   (size 5)`),
        p("The tail holds left-overs: some original elements, and some **moved-from** strings (here empty - a moved-from `std::string` is valid but its value is unspecified, so never rely on it). g++ warns when you drop the result: `warning: ignoring return value of ‘constexpr _FIter std::remove_if(_FIter, _FIter, _Predicate) [with ...]’, declared with attribute ‘nodiscard’`. Do not ignore that warning."),
        h3("C++20 std::erase_if: say what you mean"),
        code("cpp", String.raw`
auto removed = std::erase_if(cs101, is_withdrawn);   // in <vector>, no <algorithm> needed
std::println("removed {}", removed);                 // removed 3
// 0101 0158   (size 2)`),
        p("`std::erase_if(container, predicate)` does the erase-remove idiom in one call and **returns how many elements it removed**. It exists for `std::vector`, `std::string`, `std::deque`, `std::list`, and also for `std::map`, `std::set` and the unordered containers, where it does the `it = erase(it)` loop for you. It cannot forget the `erase` and cannot skip an element. Use it whenever the decision for each element depends only on that element."),
        p("With ranges, `std::ranges::remove_if(cs101, is_withdrawn)` returns the tail as a subrange (in our run: starting at index 2, length 3), so the idiom fits on one line: `cs101.erase(std::ranges::remove_if(cs101, is_withdrawn).begin(), cs101.end());`. It is the same idiom with less typing; `std::erase_if` is still clearer."),
        callout("tip", "Make a checked build part of your tests",
            "Build your tests once with -D_GLIBCXX_DEBUG (libstdc++; MSVC has _ITERATOR_DEBUG_LEVEL, libc++ has hardening modes) and once with -fsanitize=address,undefined. The debug mode catches a misused iterator at the first wrong step, even when it would not crash; ASan catches reads and writes of freed or foreign memory, including references. Both make the program slower, so they are for tests and debugging, not for the release build. Note that _GLIBCXX_DEBUG changes the layout of the containers: every file and library in the program must be built with it."),

        h2("6. The fix"),
        p("The roster tool now says what it does, in one line that cannot skip, and the test has the cases that broke it: two withdrawals in a row, the last student withdrawn, and everyone withdrawn:"),
        code("cpp", String.raw`
#include <cassert>
#include <print>
#include <string>
#include <vector>

struct Student {
    std::string id;
    std::string name;
    bool withdrawn;
};

// Removes every withdrawn student from the roster and returns how many were removed.
std::size_t remove_withdrawn(std::vector<Student>& roster) {
    return std::erase_if(roster, [](const Student& s) { return s.withdrawn; });
}

int main() {
    std::vector<Student> cs101 = {
        {"RP-2024-0101", "Nguyễn Văn An", false},
        {"RP-2024-0137", "Trần Thị Bích", true},     // two withdrawn in a row
        {"RP-2024-0142", "Lê Minh Châu", true},
        {"RP-2024-0158", "Phạm Quốc Dũng", false},
        {"RP-2024-0163", "Võ Thị Hà", true},         // the last row is withdrawn
    };
    const std::size_t removed = remove_withdrawn(cs101);
    assert(removed == 3);
    assert(cs101.size() == 2);
    for (const Student& s : cs101)
        assert(!s.withdrawn);

    std::vector<Student> everyone_left = {
        {"RP-2024-0137", "Trần Thị Bích", true},
        {"RP-2024-0142", "Lê Minh Châu", true},
    };
    assert(remove_withdrawn(everyone_left) == 2);
    assert(everyone_left.empty());
    std::println("ok: removed {}, {} on the exam list", removed, cs101.size());
}
// ok: removed 3, 2 on the exam list`, "roster.cpp"),
        numbered([
            "**`std::erase_if`** replaces the hand-written loop: no index to get wrong, no iterator to invalidate, and every element is moved at most once.",
            "**It returns the count**, so the exam office's report (\"6 withdrawn students removed\") comes from the same call instead of a second loop.",
            "**The test runs the cases that broke production**, and CI runs it under `-D_GLIBCXX_DEBUG` and `-fsanitize=address,undefined` as well as the normal build.",
            "**For the scholarship bug, take the reference after the last change to the vector.** If you need to keep \"the top student\" across later `push_back` calls, keep a copy (`Student top = ranking[0];`), an index, or the id - not a reference or iterator into a vector that may grow.",
        ]),

        h2("7. Your turn"),
        p("The full clean-up also removes repeated rows: the export repeats a student when the enrolment was edited, and only the first row for each id may stay. The ported code has the same index-and-erase loop twice. The test runner reads a roster, calls `clean_roster()` once, and prints the count and the exam list."),
        challenge("chal_fix_cppf_412", "Both passes skip the row right after an erased one. std::erase_if handles a decision that depends only on the row itself. Whether a row is a repeat depends on the rows before it, so walk with an iterator, remember which ids you have already kept (a std::unordered_set<std::string> or a std::map works), and use the iterator that erase returns."),

        h2("8. Pitfalls"),
        bullets([
            "**`erase(begin() + i)` followed by `++i`**: the element after the erased one is skipped. Deterministic, so it passes every test without two matches in a row.",
            "**`v.erase(it)` without using its return value**: `it` is invalid after the call; `++it` on it is undefined behaviour. Write `it = v.erase(it)` and do not increment on that path.",
            "**`std::remove_if` without `erase`**: the size does not change and the tail holds left-overs and moved-from values. Use `std::erase_if`.",
            "**Holding a reference, pointer or iterator into a vector across `push_back`, `emplace_back`, `insert` or `reserve`**: when the vector reallocates, it points at freed memory. Re-take it after the change, or keep an index or a copy.",
            "**`push_back` or `erase` inside a range-for over the same container**: the hidden iterators go stale. Collect changes and apply them after the loop.",
            "**\"It works in my run\"**: undefined behaviour can print the right answer. Only a checked build (`-D_GLIBCXX_DEBUG`, `-fsanitize=address`) tells you the code is wrong.",
            "**Assuming every container behaves like `std::vector`**: `std::map` and `std::list` never move elements on insert; `std::unordered_map` iterators are invalidated by a rehash. Check the rules for the container you use.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Removing by a condition on each element: `std::erase_if(v, pred)`, and use the count it returns.",
            "Removing with a loop: `it = v.erase(it)` in the erase branch, `++it` only in the keep branch, and no `++it` in the `for` header.",
            "No `push_back`, `insert` or `erase` on a container inside a range-for over that container.",
            "No reference, pointer or iterator into a vector is kept across an operation that can add elements.",
            "`std::remove_if` is always wrapped in `v.erase(..., v.end())` - and the nodiscard warning is never ignored.",
            "Tests include two matches in a row, a match in the last position, all elements matching and an empty container.",
            "The test suite also runs under `-D_GLIBCXX_DEBUG` and `-fsanitize=address,undefined`.",
        ]),
        p("Next lesson: the mini project, a grade book, uses all of this - containers, algorithms and safe removal - in one program."),
    ],
});
