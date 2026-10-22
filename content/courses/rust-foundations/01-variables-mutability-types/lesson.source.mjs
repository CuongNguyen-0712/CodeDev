// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-rsf-1-1",
    title: "Variables, mutability & types",
    slug: { _type: "slug", current: "rust-variables-mutability-types" },
    description:
        "On the night of the 11.11 sale, the Da Nang depot's new Rust tool printed a manifest saying roll cage DN-07 held 44 parcels. It held 300. The same code had panicked with \"attempt to add with overflow\" in testing, which nobody saw because the test data was small. Learn how Rust variables work (let, mut, shadowing, const), the integer and float types and their ranges, why the + operator panics in debug builds and wraps in release builds, the checked, saturating and wrapping methods that say what you mean, and how From, try_from and as convert between types.",
    estimatedTime: 22,

    scenario: {
        role: "Junior developer at Song Han Logistics, rewriting the Da Nang depot's Python scripts in Rust",
        problem:
            "The depot merges the morning and evening bags for each delivery route into one roll cage before the trucks leave. The new Rust tool that prints the cage manifest said cage DN-07 held 44 parcels. The driver counted 300. Nothing crashed and nothing was logged, and the same function had passed every test on the developer's laptop.",
    },

    content: [
        h2("1. The incident"),
        p("Song Han Logistics delivers parcels across central Vietnam. At the Da Nang depot, every scanned parcel goes into a bag for its delivery route, and before the trucks leave, the bags of one route are tipped into a **roll cage**. The handheld scanners store a bag's parcel count in one byte, so the team that ported the old Python script to Rust used the matching type, `u8`:"),
        code("rust", `
fn merge_bags(first: u8, second: u8) -> u8 {
    first + second
}

fn main() {
    let morning: u8 = 200;
    let evening: u8 = 100;
    let cage = merge_bags(morning, evening);
    println!("cage DN-07: {cage} parcels");
}`, "src/main.rs"),
        p("On 11 November, the biggest sale day of the year, route DN-07 had 200 parcels in the morning bag and 100 in the evening bag. The manifest said:"),
        code("text", `
cage DN-07: 44 parcels`),
        p("The truck left with 300 parcels and a manifest for 44. The delivery hub in Hoi An flagged 256 parcels as \"not expected\", and it took two people most of the morning to match them back to their orders."),
        bullets([
            "**Nothing crashed and nothing was logged.** The binary did exactly what it was compiled to do.",
            "**It had passed the tests.** On the developer's laptop the same function had even **panicked** once, on a test bag of 250 parcels, and the developer had shrunk the test data instead of reading the message.",
        ]),
        p("To understand both behaviours you need three things: how Rust stores numbers, what happens when a result does not fit, and why a debug build and a release build disagree."),

        h2("2. Reproduce it: debug and release"),
        p("A Rust project is built with **Cargo**. `cargo run` and `cargo test` build in the **debug** profile: fast to compile, slow to run, full of safety checks. `cargo build --release` builds the **release** profile that goes to production: optimised, and with integer overflow checks **turned off**. Run the program above both ways:"),
        code("text", `
$ cargo run
thread 'main' (8591) panicked at src/main.rs:2:5:
attempt to add with overflow
note: run with \`RUST_BACKTRACE=1\` environment variable to display a backtrace

$ cargo run --release
cage DN-07: 44 parcels`),
        bullets([
            "**Debug build:** the addition is checked. 200 + 100 does not fit in a `u8`, so the program **panics**: it stops at once, prints the file, line and column (`src/main.rs:2:5` is `first + second`) and exits with code 101. The number in brackets after `'main'` is the thread id and differs on every run.",
            "**Release build:** the check is gone, and the addition **wraps around**: 300 becomes 44. Unlike C, this is not undefined behaviour; Rust defines exactly what happens. It is still the wrong number on the manifest.",
        ]),
        p("A panic is Rust's way of saying \"this program has reached a state it cannot continue from\". It is loud on purpose. The release build trades that loudness for speed, which is why the rest of this lesson is about writing arithmetic that is correct in **both** builds."),

        h2("3. Variables: let, mut, shadowing and const"),
        p("A variable is created with `let`. In Rust, variables are **immutable by default**: once a value is bound to a name, the name keeps that value. Try to change one:"),
        code("rust", `
fn main() {
    let total = 0;
    total += 5;
    println!("{total}");
}`, "src/main.rs"),
        code("text", `
error[E0384]: cannot assign twice to immutable variable \`total\`
 --> src/main.rs:3:5
  |
2 |     let total = 0;
  |         ----- first assignment to \`total\`
3 |     total += 5;
  |     ^^^^^^^^^^ cannot assign twice to immutable variable
  |
help: consider making this binding mutable
  |
2 |     let mut total = 0;
  |         +++`),
        p("Rust compiler errors are worth reading to the end: they point at the exact line, explain the rule, and often suggest the fix. Here the fix is to say that `total` will change, with `mut`. Everything that does not need `mut` stays immutable, so a reader knows at a glance which values move during the program:"),
        code("rust", `
const CAGE_LIMIT: u16 = 400; // a constant: type required, value fixed at compile time

fn main() {
    let depot = "Da Nang";          // immutable: depot can never change
    let mut scanned = 0;            // mut: this one will change
    scanned += 120;
    scanned += 95;
    println!("{depot}: {scanned} parcels scanned, limit {CAGE_LIMIT}");

    // Shadowing: a new variable with the same name, here with a new type
    let weight = " 1250 ";                      // &str read from the scale
    let weight: u32 = weight.trim().parse().unwrap();
    let weight = weight * 2;                    // still immutable, new value
    println!("double-checked weight: {weight} g");
}`, "src/main.rs"),
        code("text", `
Da Nang: 215 parcels scanned, limit 400
double-checked weight: 2500 g`),
        bullets([
            "**`println!`** is a macro (the `!` says so). `{scanned}` inside the string prints the variable `scanned`; `{}` takes the next argument after the string.",
            "**`const`** names a value that is fixed when the program is compiled. The type must be written, and the name is in `SCREAMING_SNAKE_CASE`. Use it for limits and settings such as `CAGE_LIMIT`.",
            "**Shadowing** is a second `let` with the same name. It creates a **new** variable that hides the old one, and it may even have a different type: the text `\" 1250 \"` becomes the number `1250`. That is different from `mut`, which changes the value but never the type.",
            "**`.trim().parse().unwrap()`** removes the spaces, converts the text to a number, and stops the program if the text is not a number. `unwrap` is fine in a first example; lesson 3-1 replaces it with real error handling.",
        ]),
        callout("tip", "Let the compiler tell you what is unused",
            "If you write let mut and never change the variable, rustc warns: variable does not need to be mutable. Unused variables get a warning too. Prefix a name with an underscore, like _unused, only when you really mean to ignore it."),

        h2("4. Scalar types"),
        p("Every value in Rust has a type that is known when the program is compiled. Most of the time the compiler **infers** it, and you write the type only where it matters, such as function parameters. The scalar types are:"),
        bullets([
            "**Signed integers** `i8`, `i16`, `i32`, `i64`, `i128`: whole numbers that can be negative. The number is the size in bits. An `i8` holds -128 to 127.",
            "**Unsigned integers** `u8`, `u16`, `u32`, `u64`, `u128`: whole numbers from 0 up. A `u8` holds 0 to 255, a `u16` 0 to 65 535, a `u32` 0 to about 4.29 billion.",
            "**`usize` and `isize`**: as wide as a memory address (64 bits on a 64-bit machine). Lengths and indexes of collections are `usize`.",
            "**Floating point** `f64` (the default) and `f32`: numbers with a fraction. Never use them for money; store whole đồng or cents in an integer.",
            "**`bool`**: `true` or `false`. **`char`**: one Unicode character such as `'Đ'`, always 4 bytes.",
        ]),
        code("rust", `
fn main() {
    let count = 42;            // i32: the default for integers
    let ratio = 0.75;          // f64: the default for floats
    let bags: u8 = 200;        // annotation on the variable
    let parcels = 1_250_000u64; // suffix on the literal, _ as a digit separator
    let fragile = true;        // bool
    let grade = 'Đ';           // char: one Unicode scalar value, 4 bytes
    println!("{count} {ratio} {bags} {parcels} {fragile} {grade}");
    println!("u8: {}..={}", u8::MIN, u8::MAX);
    println!("i32: {}..={}", i32::MIN, i32::MAX);
    println!("u64 max: {}", u64::MAX);
    println!("size of char: {} bytes", std::mem::size_of::<char>());
}`, "src/main.rs"),
        code("text", `
42 0.75 200 1250000 true Đ
u8: 0..=255
i32: -2147483648..=2147483647
u64 max: 18446744073709551615
size of char: 4 bytes`),
        p("Pick a type by asking what range the value can really reach, now and on the busiest day of the year. A scanner's per-bag count may fit in a `u8`; a cage, a truck or a day's total does not. When in doubt, take the wider type: a `u32` costs three more bytes and removes a whole class of bugs."),
        p("Values the compiler can see are checked at compile time. A literal that does not fit is an error, not a wrap:"),
        code("text", `
error: literal out of range for \`u8\`
 --> src/main.rs:2:17
  |
2 |     let x: u8 = 256;
  |                 ^^^
  |
  = note: the literal \`256\` does not fit into the type \`u8\` whose range is \`0..=255\`
  = note: \`#[deny(overflowing_literals)]\` on by default`),
        p("The problem in the incident is different: `morning` and `evening` come from the scanners at run time, so only the running program can notice that their sum is too big."),

        h2("5. Overflow on purpose: checked, saturating, wrapping"),
        p("Integer types have methods that say exactly what should happen when a result does not fit. They behave the same in debug and release builds, so they are the right tool whenever the inputs come from outside the program:"),
        code("rust", `
fn main() {
    let morning: u8 = 200;
    let evening: u8 = 100;
    println!("{:?}", morning.checked_add(evening));     // None
    println!("{:?}", morning.checked_add(55));          // Some(255)
    println!("{}", morning.saturating_add(evening));    // 255
    println!("{}", morning.wrapping_add(evening));      // 44
    println!("{:?}", morning.overflowing_add(evening)); // (44, true)
    println!("{:?}", 5_u8.checked_sub(9));              // None: u8 has no negative numbers
    println!("{}", u16::from(morning) + u16::from(evening)); // 300

    match morning.checked_add(evening) {
        Some(total) => println!("cage holds {total}"),
        None => println!("cage DN-07 is full: open a new cage"),
    }
}`, "src/main.rs"),
        code("text", `
None
Some(255)
255
44
(44, true)
None
300
cage DN-07 is full: open a new cage`),
        bullets([
            "**`checked_add`** returns an `Option<u8>`: `Some(sum)` when it fits, `None` when it does not. You must look inside to get the number, which forces you to decide what an overflow means. `match` does that, one arm per case. Lesson 3-1 covers `Option` properly; for now read it as \"maybe a value\".",
            "**`saturating_add`** stops at the limit: 255. Right for a progress bar or a volume knob, wrong for a parcel count, where it silently loses 45 parcels.",
            "**`wrapping_add`** wraps on purpose: right for hashes and checksums, never for quantities.",
            "**`{:?}`** prints a value in its debug form, which works for `Option` and tuples; `{}` is for values with a user-facing format, such as numbers and text.",
            "There are `checked_`, `saturating_` and `wrapping_` versions of `sub`, `mul`, `div` and more. `checked_sub` is the one that catches \"5 minus 9\" on unsigned types.",
        ]),
        image("u8-overflow", {
            alt: "Diagram: 200 + 100 in a u8, where the result needs 9 bits and a u8 has 8. In binary, 200 is 1100 1000, 100 is 0110 0100 and 300 is 1 0010 1100; the 9th bit, worth 256, has no place in a u8, and dropping it leaves 0010 1100, which is 44, or 300 minus 256. A u8 holds 0 to 255, a u16 0 to 65 535, so u16 from 200 plus u16 from 100 is simply 300. Left, red, the plain addition morning + evening: a debug build (cargo run, cargo test) panics with attempt to add with overflow; a release build (cargo build --release) silently gives 44. Right, green, the explicit methods with the same result in every build: checked_add gives None, saturating_add gives 255, wrapping_add gives 44, overflowing_add gives the pair 44 and true. Bottom, converting 300 into a u8: 300_u32 as u8 is 44, because as keeps the low 8 bits and never fails or warns; u8::try_from(300_u32) is Err(TryFromIntError(())), a checked conversion; u16::from(200_u8) is 200, because From only exists where nothing can be lost.",
            caption: "The plain + depends on the build profile. The explicit methods, and wider types, do not.",
        }),

        h2("6. Converting between number types"),
        p("Rust never converts numbers for you, not even from a narrower type to a wider one. Assigning a `u32` to a `u64` variable is an error:"),
        code("text", `
error[E0308]: mismatched types
 --> src/main.rs:3:18
  |
3 |     let w: u64 = total;
  |            ---   ^^^^^ expected \`u64\`, found \`u32\`
  |            |
  |            expected due to this
  |
help: you can convert a \`u32\` to a \`u64\`
  |
3 |     let w: u64 = total.into();
  |                       +++++++`),
        p("This feels strict for a week, then it starts saving you: every place where a number changes type is visible in the code, so it is also a place to ask \"can this lose data?\". There are three tools:"),
        code("rust", `
fn main() {
    let small: u8 = 200;
    let wide: u32 = u32::from(small);      // From: lossless, cannot fail
    let wider: u64 = wide.into();          // into(): the same, the target type comes from the annotation
    println!("{wide} {wider}");

    let raw: u32 = 300;
    println!("{:?}", u8::try_from(raw));   // Err(TryFromIntError(()))
    println!("{:?}", u8::try_from(200_u32)); // Ok(200)

    println!("{}", raw as u8);             // 44: keeps the low 8 bits
    println!("{}", -1_i32 as u32);         // 4294967295
    println!("{}", 3.99_f64 as u8);        // 3: float to int drops the fraction
    println!("{}", 300.7_f64 as u8);       // 255: float to int saturates
    println!("{}", -5.0_f64 as u8);        // 0
}`, "src/main.rs"),
        bullets([
            "**`From` / `into`** exist only for conversions that can never lose information: `u8` to `u32`, `u32` to `u64`, `i32` to `f64`. If `u64::from(x)` compiles, it is safe.",
            "**`try_from`** is for conversions that may not fit. It returns `Ok(value)` or `Err(...)`, and `.ok()` turns that into the `Some` / `None` you saw above. Use it at the boundary where outside data enters your program.",
            "**`as`** always succeeds, and that is the problem: between integers it silently keeps the low bits (`300 as u8` is 44, `-1 as u32` is 4 294 967 295). From float to integer it drops the fraction and saturates. Use `as` only where you have already checked the range, or where truncation is what you want.",
        ]),
        h3("Division"),
        p("Arithmetic operators need the **same type on both sides**. `7 / 2.0` is `error[E0277]: cannot divide {integer} by {float}`. And integer division throws the fraction away:"),
        code("rust", `
fn main() {
    println!("{} {}", 7 / 2, 7 % 2);       // 3 1: integer division and remainder
    println!("{}", -7 / 2);                // -3: rounds toward zero
    println!("{}", 7.0 / 2.0);             // 3.5
    let parcels: u32 = 301;
    let cages: u32 = 2;
    println!("{}", parcels / cages);                          // 150
    println!("{}", f64::from(parcels) / f64::from(cages));    // 150.5
    println!("{:.2}", f64::from(parcels) / f64::from(cages)); // 150.50
}`, "src/main.rs"),
        p("`f64::from(parcels / cages)` would still print 150: the division happens first, in `u32`, and only the already-truncated result is converted. Convert **both operands**, then divide. `{:.2}` prints a float with exactly two decimals."),

        h2("7. Practice"),
        p("First, check that you can predict what the compiler accepts and what each kind of addition returns."),
        challenge("chal_quiz_rsf_111"),
        p("Now the cage loader from the incident. The test runner is built in release mode, exactly like production, so a plain `+` will wrap silently instead of panicking."),
        challenge("chal_coding_rsf_112", "bag_count is one call to u8::try_from plus .ok(). load is one call to the checked version of add. For average, convert both numbers to f64 before dividing."),

        h2("8. The fix"),
        p("The team fixed the manifest tool in three places. First, the scanner's `u8` stays at the boundary, and the cage count gets a type that can hold any sum of two bags, plus an explicit limit for what a real cage can carry:"),
        code("rust", `
const CAGE_LIMIT: u16 = 400; // parcels one roll cage can physically hold

fn merge_bags(first: u8, second: u8) -> Option<u16> {
    let total = u16::from(first) + u16::from(second); // at most 255 + 255 = 510: always fits
    if total <= CAGE_LIMIT { Some(total) } else { None }
}

fn main() {
    let morning: u8 = 200;
    let evening: u8 = 100;
    match merge_bags(morning, evening) {
        Some(count) => println!("cage DN-07: {count} parcels"),
        None => println!("cage DN-07 over the limit: split the bags"),
    }
    println!("{:?}", merge_bags(255, 255));
}`, "src/main.rs"),
        code("text", `
cage DN-07: 300 parcels
None`),
        p("Second, release builds now keep the overflow check, so if a future change brings the bug back, production panics with a message instead of shipping a wrong manifest:"),
        code("toml", `
[profile.release]
overflow-checks = true`, "Cargo.toml"),
        p("Third, the test data now includes the busiest day on record, plus the edges: 255 + 0, 255 + 1, 0 + 0. A test that never reaches the limit of a type does not test the type."),
        numbered([
            "**Widen before adding.** `u16::from(first) + u16::from(second)` cannot overflow, whatever the scanners send.",
            "**Make the real limit explicit.** The physical limit of a cage (400) is business logic. It belongs in a named `const`, not in the accident of a type's maximum.",
            "**Return `Option`, let the caller decide.** `None` forces the caller to handle \"too many\", here by splitting the bags into two cages.",
            "**Keep overflow checks on in release** for code where a wrong number costs more than a few nanoseconds.",
        ]),

        h2("9. Pitfalls"),
        bullets([
            "**Testing only in debug.** `cargo test` checks overflow; `cargo build --release` does not. A panic in a test is a bug report, not flaky data.",
            "**Choosing a type for today's data.** `u8` for a count that fits \"usually\" is the incident in one line. Size types for the worst day.",
            "**`as` for conversions from outside data.** `raw as u8` turns 300 into 44 without a word. Use `u8::try_from(raw)`.",
            "**`saturating_add` for quantities.** Stopping at 255 loses parcels just as silently as wrapping does.",
            "**Converting after dividing.** `f64::from(a / b)` keeps integer division; write `f64::from(a) / f64::from(b)`.",
            "**`let` without `mut` for a running total.** The compiler catches it (E0384), so read the `help:` line.",
            "**Confusing shadowing with mutation.** A shadowed variable inside a block `{ }` disappears at the end of the block, and the outer one is back.",
            "**`f64` for money.** `0.1 + 0.2` is `0.30000000000000004`. Count đồng or cents in an integer type.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Variables are immutable unless they need to change; `mut` marks the ones that do.",
            "Every integer type is chosen for its worst-case range, not for typical data.",
            "Values from outside the program are converted with `try_from`, not `as`.",
            "Arithmetic on outside data uses `checked_*` (or a wider type) and handles `None`.",
            "Business limits are named `const`s, not type maximums.",
            "Averages convert both operands to `f64` before dividing.",
            "Tests include the edges of every numeric type they touch, and run in release mode at least once.",
        ]),
    ],
});
