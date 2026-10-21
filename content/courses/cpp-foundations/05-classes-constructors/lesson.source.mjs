// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-cppf-2-2",
    title: "Classes & constructors",
    slug: { _type: "slug", current: "cpp-classes-constructors-invariants" },
    description:
        "On the first day of the semester, the CS101-02 lab at Riverside Polytechnic had 47 students registered for 40 seats, because the ported enrolment tool kept sections in a struct with public fields and one code path did s.enrolled++ without looking at the capacity. Learn how a C++ class keeps its data private and guarantees a rule (an invariant) through its member functions: constructors and member initializer lists, default member initializers, validating input and throwing std::invalid_argument, const member functions, explicit one-argument constructors, = default and the rule of zero.",
    estimatedTime: 22,

    scenario: {
        role: "Junior developer on the Riverside Polytechnic exam office team, porting the 2010 C tools to C++23",
        problem:
            "The enrolment list for CS101-02 says 47 students; the lab has 40 computers. The ported code keeps each section as a struct with public fields, and every part of the program changes them directly. You need a Section type that cannot be overfilled, cannot start with garbage, and cannot be created by accident from an int.",
    },

    content: [
        h2("1. The incident"),
        p("The C version of the enrolment tool kept each course section in a plain `struct`. The port to C++ kept the same shape, swapping the `char` array for a `std::string`:"),
        code("cpp", String.raw`
struct Section {
    std::string code;      // "CS101-02"
    int capacity;          // seats in the room
    int enrolled;          // students registered
};

// registration.cpp - the normal path
if (s.enrolled < s.capacity) s.enrolled++;

// late_enrolment.cpp - added in week 1 "for the head of department"
s.enrolled++;

// timetable_import.cpp - a new evening section
Section evening;
evening.code = "CS101-05";
evening.capacity = 35;`, "enrolment.cpp"),
        p("On the first day of the semester, the CS101-02 lab had **47 students for 40 seats**. The late-enrolment screen had been used seven times on a full section. Nothing crashed, and every file compiled without a warning. The same week, the timetable import created the evening section CS101-05 without ever setting `enrolled`, and nobody could say how many seats it really had left."),
        bullets([
            "**The rule lives in the callers.** `enrolled <= capacity` is checked in one file and forgotten in another. With public fields, every line of the program can break it.",
            "**An object can start life broken.** `Section evening;` leaves the two `int` members uninitialized: their value is whatever was in that memory.",
            "**Nobody owns the rule.** To check that the bug is gone, you would have to read every line that touches a `Section`.",
        ]),

        h2("2. Reproduce it"),
        p("Save this as `repro.cpp` and build it with `g++ -std=c++23 -Wall -Wextra repro.cpp` (GCC 15.2):"),
        code("cpp", String.raw`
#include <print>
#include <string>

struct Section {
    std::string code;
    int capacity;
    int enrolled;
};

void add_student(Section& s) {
    s.enrolled++;              // the "late enrolment" path: no capacity check
}

int main() {
    Section lab{"CS101-02", 40, 40};
    for (int i = 0; i < 7; ++i) add_student(lab);
    std::println("{}: {}/{}", lab.code, lab.enrolled, lab.capacity);   // CS101-02: 47/40
}`, "repro.cpp"),
        p("The compiler has nothing to complain about: adding one to a public `int` is legal. Now the evening section. Reading `enrolled` before anything was stored in it is **undefined behaviour**, and this time GCC can see it - but only when optimizing:"),
        code("cpp", String.raw`
#include <print>
#include <string>
struct Section { std::string code; int capacity; int enrolled; };
int main() {
    Section evening;
    evening.code = "CS101-05";
    evening.capacity = 35;
    int free_seats = evening.capacity - evening.enrolled;
    std::println("{}: {} free seats", evening.code, free_seats);
}`, "uninit.cpp"),
        code("text", String.raw`
$ g++ -std=c++23 -Wall -Wextra uninit.cpp && ./a.out
CS101-05: 35 free seats

$ g++ -std=c++23 -Wall -Wextra -O2 uninit.cpp && ./a.out
uninit.cpp:8:49: warning: ‘evening.Section::enrolled’ is used uninitialized [-Wuninitialized]
    8 |     int free_seats = evening.capacity - evening.enrolled;
      |                                         ~~~~~~~~^~~~~~~~
CS101-05: 35 free seats

$ g++ -std=c++23 -Wall -Wextra -ftrivial-auto-var-init=pattern uninit.cpp && ./a.out
CS101-05: 16843045 free seats`),
        p("Without `-O2` there is no warning at all. In our runs the first two builds happened to print 35, and the third - which fills uninitialized memory with a pattern instead of leaving whatever was there - printed 16843045. Same source, different answer: the program has no defined result, and yours may print something else again. The fix is not \"remember to set `enrolled`\". It is a type that cannot be created without a value and cannot be changed without its rule being checked."),

        h2("3. struct and class: members and access"),
        p("In C++, `struct` and `class` make the same kind of type. The **only** difference is the default access: members of a `struct` are `public` unless you say otherwise, members of a `class` are `private`. Write the same three fields in a `class` and the late-enrolment line no longer compiles:"),
        code("cpp", String.raw`
#include <string>
class Section {
    std::string code;
    int capacity;
    int enrolled;
};
int main() {
    Section s;
    s.enrolled++;
}`, "access.cpp"),
        code("text", String.raw`
access.cpp: In function ‘int main()’:
access.cpp:9:7: error: ‘int Section::enrolled’ is private within this context
    9 |     s.enrolled++;
      |       ^~~~~~~~
access.cpp:5:9: note: declared private here`),
        p("A type that can never be used from outside is useless, so you add **member functions**: functions declared inside the class that can read and change its private data. The data is private, a small set of functions is public, and those functions are the only doors into the object. Naming private members with a trailing underscore (`enrolled_`) is a common convention that makes them easy to spot inside member functions."),
        bullets([
            "**`private:`** - only the class's own member functions can touch it.",
            "**`public:`** - anyone can call it. This is the class's interface.",
            "**Use `struct`** for plain data where any combination of values is fine, such as `struct Room { std::string building; int number; };`. **Use `class`** when there is a rule the values must keep.",
        ]),
        p("That rule has a name: an **invariant** - a condition that is true for every object of the class, after every call to a public function. For a section it is `0 <= enrolled_ <= capacity_` with `capacity_ > 0`. If the data is private and every public function keeps the rule, the rule holds everywhere in the program, and checking it means reading a handful of functions instead of the whole code base."),
        image("class-guards-invariant", {
            alt: "Diagram titled A class is a box with private state and a few doors. In the centre, a box labelled class Section holds a grey private section with std::string code_, int capacity_ and int enrolled_ = 0, and a green invariant box: 0 <= enrolled_, enrolled_ <= capacity_, capacity_ > 0, true after every call. On the left, four doors with arrows into the class: the constructor Section(code, capacity) throws if capacity <= 0 and starts enrolled_ at 0; try_add() returns false when enrolled_ == capacity_; try_remove() returns false when enrolled_ == 0; free_seats() const is read only and the compiler rejects any change (dashed line). On the right, outside code that is stopped: lab.enrolled_++ is a compile error because enrolled_ is private; print_section(204) is a compile error when the constructor is explicit, so an int is not silently a Section; Section bad(\"X\", 0) throws std::invalid_argument at run time. A note at the bottom: with public fields every line of the program is a door; with private fields checking the rule means reading a handful of member functions.",
            caption: "Private data plus a few public functions that each keep the rule: the invariant holds for every Section in the program.",
        }),

        h2("4. Constructors: no object starts broken"),
        p("A **constructor** is a member function with the same name as the class and no return type. It runs exactly once, when the object is created, and its job is to establish the invariant. Members are initialized in the **member initializer list** - the part after the colon - before the body runs:"),
        code("cpp", String.raw`
#include <format>
#include <print>
#include <stdexcept>
#include <string>
#include <utility>

class Section {
public:
    Section(std::string code, int capacity)
        : code_(std::move(code)), capacity_(capacity) {
        if (capacity_ <= 0) {
            throw std::invalid_argument(
                std::format("Section {}: capacity must be > 0, got {}", code_, capacity_));
        }
    }

    bool try_add() {                  // the only way enrolled_ goes up
        if (enrolled_ == capacity_) return false;
        ++enrolled_;
        return true;
    }
    bool try_remove() {               // the only way it goes down
        if (enrolled_ == 0) return false;
        --enrolled_;
        return true;
    }

    const std::string& code() const { return code_; }
    int enrolled() const { return enrolled_; }
    int free_seats() const { return capacity_ - enrolled_; }

private:
    std::string code_;
    int capacity_;
    int enrolled_ = 0;                // default member initializer
};

int main() {
    Section lab("CS101-02", 40);
    int accepted = 0;
    for (int i = 0; i < 47; ++i) accepted += lab.try_add();
    std::println("{}: accepted {}, enrolled {}, free {}",
                 lab.code(), accepted, lab.enrolled(), lab.free_seats());
    // CS101-02: accepted 40, enrolled 40, free 0

    try {
        Section broken("CS101-09", 0);
    } catch (const std::invalid_argument& e) {
        std::println("rejected: {}", e.what());
        // rejected: Section CS101-09: capacity must be > 0, got 0
    }
}`, "section.cpp"),
        bullets([
            "**Initializer list, not assignment in the body.** `: code_(std::move(code))` constructs the string once. Assigning in the body would first create an empty string, then overwrite it. For `const` members and references, the initializer list is the only way.",
            "**Members are initialized in the order they are declared** in the class, not the order you write them in the list. Keep the two orders the same; `-Wall` warns (`-Wreorder`) when they differ.",
            "**`int enrolled_ = 0;`** is a **default member initializer**: every constructor that does not set `enrolled_` itself starts it at 0. Give every `int`, `double` and `bool` member one - it is the cure for the CS101-05 garbage.",
            "**`std::move(code)`**: the parameter is a copy the constructor owns, so it can hand its buffer to `code_` instead of copying the characters again.",
        ]),
        h3("Validate, then throw"),
        p("A constructor cannot return an error code: there is no return value, and the caller already has a name for the object. If the arguments cannot make a valid object, **throw an exception**. `std::invalid_argument` from `<stdexcept>` is the standard one for bad arguments; the string you pass becomes `what()`. When a constructor throws, the object never exists - there is no half-built `Section` to forget about. If nobody catches it, the program stops with the message:"),
        code("text", String.raw`
terminate called after throwing an instance of 'std::invalid_argument'
  what():  capacity must be > 0
Aborted (core dumped)`),
        p("Put the check in the constructor and only there. Every function that receives a `Section` can then trust it: there is no `if (s.capacity > 0)` to sprinkle over the code base."),
        h3("Declaring a constructor removes the free one"),
        p("A class with no constructors gets a default constructor from the compiler. As soon as you declare any constructor, that one is gone, so `Section s;` stops compiling - which is exactly what you want for `Section`: there is no sensible section without a code and a capacity. When a default state **does** make sense, ask for the compiler's version back with `= default`:"),
        code("cpp", String.raw`
struct Room {
    std::string building = "A";
    int number = 0;

    Room() = default;                       // uses the default member initializers
    Room(std::string b, int n) : building(std::move(b)), number(n) {}
};

Room unknown;                               // A 0
Room lab("B", 204);                         // B 204`),

        h2("5. const member functions and explicit"),
        p("A member function marked `const` after its parameter list promises not to change the object. That matters because the usual way to pass a big object you only read is `const Section&` (from the lesson on pass-by-reference), and through a `const` reference you can only call `const` member functions. Forget the keyword on a function that only reads, and the report code stops compiling:"),
        code("cpp", String.raw`
#include <print>
class Section {
public:
    explicit Section(int capacity) : capacity_(capacity) {}
    int free_seats() { return capacity_ - enrolled_; }      // forgot const
private:
    int capacity_;
    int enrolled_ = 0;
};
void print_report(const Section& s) {
    std::println("free: {}", s.free_seats());
}`, "report.cpp"),
        code("text", String.raw`
report.cpp: In function ‘void print_report(const Section&)’:
report.cpp:11:42: error: passing ‘const Section’ as ‘this’ argument discards qualifiers [-fpermissive]
   11 |     std::println("free: {}", s.free_seats());
      |                              ~~~~~~~~~~~~^~
report.cpp:5:9: note:   in call to ‘int Section::free_seats()’`),
        p("\"Discards qualifiers\" means: calling this function would throw away the `const`. The fix is `int free_seats() const`. The promise is checked, too - a `const` member function that tries to change a member does not compile (`error: increment of member ‘Section::reads_’ in read-only object`). Mark every member function that only reads as `const`; it documents which doors can change the invariant and which cannot."),
        h3("explicit: an int is not a Section"),
        p("The third bug in the port was quieter. Someone gave the old struct a one-argument constructor \"for convenience\", and C++ treats such a constructor as a **converting constructor**: the compiler may use it on its own to turn an `int` into a `Section`."),
        code("cpp", String.raw`
#include <print>
#include <string>

struct Section {
    std::string code = "TBA";
    int capacity = 0;
    int enrolled = 0;
    Section() = default;
    Section(int cap) : capacity(cap) {}      // one argument, not explicit
};

void print_section(Section s) {
    std::println("{}: {}/{}", s.code, s.enrolled, s.capacity);
}

int main() {
    int room = 204;                          // meant: print_room(room)
    print_section(room);                     // TBA: 0/204
}`, "implicit.cpp"),
        p("A room number became a section with 204 seats, and the timetable printed it. Mark the constructor `explicit` and the call is an error, while `Section(204)` written on purpose still works:"),
        code("text", String.raw`
implicit.cpp:18:19: error: could not convert ‘room’ from ‘int’ to ‘Section’
   18 |     print_section(room);
      |                   ^~~~
      |                   |
      |                   int`),
        callout("tip", "Make one-argument constructors explicit by default",
            "Write explicit on every constructor that can be called with one argument, including ones where the other parameters have defaults. Leave it off only when the conversion is truly the same value in another form, like std::string from a string literal."),

        h2("6. Copies and the rule of zero"),
        p("You did not write any code to copy a `Section`, yet `Section b = a;` works: the compiler generates a copy constructor and copy assignment that copy each member in turn. Because the members are `std::string`, `int` and `std::vector`, each of which already copies itself correctly, the generated copy is correct too:"),
        code("cpp", String.raw`
Section a("CS101-02", 40);
a.add("RP-2024-0137");          // a member function that push_backs into a std::vector<std::string>
Section b = a;                  // copies code_, capacity_ and the whole vector
b.add("RP-2024-0215");
std::println("a has {}, b has {}", a.size(), b.size());   // a has 1, b has 2`),
        p("This is the **rule of zero**: build your class from members that manage themselves (`std::string`, `std::vector`, other well-behaved classes), and write **no** destructor, copy constructor or copy assignment at all. The compiler-generated ones are right, and they stay right when you add a member. The next lesson, Object lifetime & RAII, shows what a destructor is for and what happens when a member does not manage itself."),

        h2("7. Your turn: a section with a waitlist"),
        p("The real tool does not just count: it keeps student ids, and a full section puts new students on a waitlist. When an enrolled student drops, the first student on the waitlist gets the seat. That gives the class a richer invariant: never more enrolled than seats, and no id twice anywhere in the section. The test runner reads a section and a list of commands, prints the result of each one, and prints the final summary through a `const Section&`."),
        challenge("chal_coding_cppf_221", "Write the invariant down first, then check every public function against it: what must be true before you add an id, and what must happen to the waitlist when a seat becomes free? Start with the constructor - one line decides whether a Section can exist at all."),

        h2("8. The fix"),
        p("The enrolment tool now uses the `Section` class from section 4. The three incident lines become:"),
        code("cpp", String.raw`
// late_enrolment.cpp
if (!s.try_add()) {
    std::println("{} is full ({} seats): use the waitlist", s.code(), s.enrolled());
}

// timetable_import.cpp
Section evening("CS101-05", 35);        // enrolled_ starts at 0, capacity is checked

// timetable.cpp
print_section(room);                    // no longer compiles: the constructor is explicit`, "enrolment.cpp"),
        numbered([
            "**The data is private.** `s.enrolled++` anywhere outside the class is a compile error, not a code review comment.",
            "**The constructor establishes the invariant**: it takes the code and capacity, throws `std::invalid_argument` for a capacity that is not positive, and `enrolled_` has a default member initializer of 0.",
            "**Every function that changes the count checks the rule**, and reports a refusal through its return value so the caller has to decide what to do.",
            "**Readers are `const`**, so reports can take `const Section&` and cannot change a section by accident.",
            "**The one-argument path is `explicit`**, so an `int` is never quietly turned into a section.",
            "**No destructor, no copy code**: the rule of zero.",
        ]),

        h2("9. Pitfalls"),
        bullets([
            "**Public data with a rule attached**: any line can break the rule. Make the data private and give the class the functions that keep it.",
            "**`int` members without an initializer**: `Section s;` (or a constructor that skips them) leaves garbage. Use default member initializers such as `int enrolled_ = 0;`.",
            "**Checking arguments in the callers instead of the constructor**: one caller will forget. Validate once, in the constructor, and throw.",
            "**Assigning members in the constructor body**: it works for `int`, but builds every `std::string` twice and cannot set `const` or reference members. Use the initializer list, in declaration order.",
            "**Forgetting `const` on read-only member functions**: `passing ‘const Section’ as ‘this’ argument discards qualifiers` as soon as someone uses a `const Section&`.",
            "**One-argument constructors without `explicit`**: an `int` silently becomes an object.",
            "**Getters and setters for every field**: `set_enrolled(int)` is a public field with extra typing. Offer operations that keep the invariant (`try_add`), not raw access.",
            "**Writing a destructor or copy constructor \"just in case\"**: with `std::string` and `std::vector` members the generated ones are correct. Rule of zero.",
        ]),

        h2("10. Checklist"),
        bullets([
            "I can state the invariant of each class in one line, and every public member function keeps it.",
            "Data members with a rule are `private`; `struct` is only for plain data where any values are fine.",
            "Every constructor initializes members in the member initializer list, in declaration order.",
            "Every built-in member (`int`, `double`, `bool`, pointers) has a default member initializer.",
            "Constructors validate their arguments and throw `std::invalid_argument` with a message that names the bad value.",
            "Member functions that only read are `const`.",
            "Constructors that can take one argument are `explicit`.",
            "No hand-written destructor or copy functions unless the class manages a resource itself (next lesson).",
        ]),
    ],
});
