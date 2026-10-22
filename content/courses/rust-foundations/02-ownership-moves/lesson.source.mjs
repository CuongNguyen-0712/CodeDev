// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-rsf-1-2",
    title: "Ownership & moves",
    slug: { _type: "slug", current: "rust-ownership-moves" },
    description:
        "The Da Nang depot's manifest tool would not compile with error E0382, use of moved value. The compiler suggested .clone(), a teammate accepted the suggestion, the program compiled, and from then on the late scans never reached the manifest. Learn where a String's data lives, the three ownership rules, what a move is, which types are Copy, when clone is the right answer and when it hides a bug, and how functions take ownership and give it back.",
    estimatedTime: 22,

    scenario: {
        role: "Junior developer at Song Han Logistics, porting the depot's cage manifest script to Rust",
        problem:
            "Parcels scanned after a cage's first bag (the late scans) are added by a helper function before the manifest is printed. The first Rust version did not compile. After a teammate added .clone() where the compiler suggested it, it compiled and ran without a warning, and every manifest since then has been missing its late scans.",
    },

    content: [
        h2("1. The incident"),
        p("Before a truck leaves the Da Nang depot, the manifest tool prints every parcel in its roll cage. Parcels that arrive after the cage was first filled, the **late scans**, are added by a small helper. This was the first Rust version:"),
        code("rust", `
fn add_late_scans(mut cage: Vec<String>, late: Vec<String>) -> Vec<String> {
    for parcel in late {
        cage.push(parcel);
    }
    cage
}

fn print_manifest(route: String, cage: Vec<String>) {
    println!("{route}: {} parcels", cage.len());
    for parcel in cage {
        println!("  {parcel}");
    }
}

fn main() {
    let route = String::from("DN-07");
    let cage = vec![String::from("SH-1001"), String::from("SH-1002")];
    let late = vec![String::from("SH-1003")];

    add_late_scans(cage, late);
    print_manifest(route, cage);
}`, "src/main.rs"),
        p("`Vec<String>` is a growable list of `String`s, and `vec![...]` creates one; lesson 3-2 covers vectors in depth. The program did not compile:"),
        code("text", `
error[E0382]: use of moved value: \`cage\`
  --> src/main.rs:21:27
   |
17 |     let cage = vec![String::from("SH-1001"), String::from("SH-1002")];
   |         ---- move occurs because \`cage\` has type \`Vec<String>\`, which does not implement the \`Copy\` trait
...
20 |     add_late_scans(cage, late);
   |                    ---- value moved here
21 |     print_manifest(route, cage);
   |                           ^^^^ value used here after move
   |
note: consider changing this parameter type in function \`add_late_scans\` to borrow instead if owning the value isn't necessary
  --> src/main.rs:1:29
   |
 1 | fn add_late_scans(mut cage: Vec<String>, late: Vec<String>) -> Vec<String> {
   |    --------------           ^^^^^^^^^^^ this parameter takes ownership of the value
   |    |
   |    in this function
help: consider cloning the value if the performance cost is acceptable
   |
20 |     add_late_scans(cage.clone(), late);
   |                        ++++++++`),
        p("A teammate under time pressure took the `help:` line literally, added `.clone()` to both calls in `main`, and the build went green:"),
        code("rust", `
    add_late_scans(cage.clone(), late);
    print_manifest(route.clone(), cage.clone());`, "src/main.rs"),
        code("text", `
DN-07: 2 parcels
  SH-1001
  SH-1002`),
        p("Parcel `SH-1003` is not on the manifest. For three weeks, every late scan travelled to the Hoi An hub without being listed, and the hub logged each one as an unexpected parcel."),
        bullets([
            "**The compiler was right to stop the first version.** It noticed that `cage` was handed over to `add_late_scans` and then used again.",
            "**The suggested fix compiled, but changed the meaning.** `add_late_scans` now adds the late scan to a **copy** of the cage and returns the updated copy. `main` ignores the returned value and prints the original, untouched cage.",
        ]),
        p("To see why, you need Rust's central idea: **ownership**."),

        h2("2. Where a String lives"),
        p("Numbers like `u32` have a fixed size, so they live directly in the variable, on the **stack**: a fast area of memory that grows and shrinks as functions are called and return. Text is different: its length is not known in advance and it can grow. A `String` is therefore two things:"),
        bullets([
            "a small, fixed-size value in the variable: a **pointer** to the text, the **length** in bytes, and the **capacity** (how many bytes are reserved);",
            "a **buffer** on the **heap**, a larger area of memory where blocks are reserved and freed while the program runs. That is where the bytes of the text are.",
        ]),
        code("rust", `
fn main() {
    let mut route = String::from("DN-07");
    println!("len {} capacity {}", route.len(), route.capacity());
    route.push_str("-HOI-AN");
    println!("{route}: len {} capacity {}", route.len(), route.capacity());

    {
        let driver = String::from("Tran Van Minh");
        println!("driver: {driver}");
    } // driver goes out of scope here: its heap buffer is freed
}`, "src/main.rs"),
        code("text", `
len 5 capacity 5
DN-07-HOI-AN: len 12 capacity 12
driver: Tran Van Minh`),
        p("Someone has to free the heap buffer when the text is no longer needed. In C you call `free` yourself (and forgetting it, or doing it twice, is a classic bug). In Java or Python a garbage collector finds unused buffers later. Rust does neither: it frees the buffer at a point it can see in the code, decided by **ownership**. A `Vec<String>` is the same idea one level up: a pointer, length and capacity on the stack, and a heap buffer that holds the `String`s."),

        h2("3. The three ownership rules"),
        numbered([
            "**Each value has exactly one owner**, a variable (or a field, or an element of a collection).",
            "**There is only one owner at a time.** Ownership can be passed on, which is called a **move**.",
            "**When the owner goes out of scope, the value is dropped**: its heap memory is freed. A scope is the block between `{` and `}`; above, `driver` is dropped at the inner `}`.",
        ]),
        p("These rules are checked by the compiler, so they cost nothing at run time. They are also why the first version did not compile: after `add_late_scans(cage, late)`, the function's parameter owned the cage, and `main` no longer did."),

        h2("4. Moves"),
        p("Assigning a `String` to another variable, passing it to a function, or returning it from one **moves** it. The pointer, length and capacity are copied into the new owner; the heap buffer is not copied at all. The old variable is then treated as empty, and using it is an error:"),
        code("rust", `
fn main() {
    let route = String::from("DN-07");
    let moved = route;
    println!("{route} {moved}");
}`, "src/main.rs"),
        code("text", `
error[E0382]: borrow of moved value: \`route\`
 --> src/main.rs:4:16
  |
2 |     let route = String::from("DN-07");
  |         ----- move occurs because \`route\` has type \`String\`, which does not implement the \`Copy\` trait
3 |     let moved = route;
  |                 ----- value moved here
4 |     println!("{route} {moved}");
  |                ^^^^^ value borrowed here after move`),
        p("Why not just let both variables point at the same buffer? Because both would be owners, and at the end of `main` both would free it: a **double free**, one of the memory bugs that crash C programs or open security holes. Moving means there is always exactly one owner, so the buffer is freed exactly once."),
        image("string-move", {
            alt: "Diagram: a move copies three numbers, a clone copies the text. A String is a small value on the stack, made of a pointer, a length and a capacity, that owns a buffer on the heap. Top: let route = String::from(\"DN-07\") gives route with ptr, len 5, cap 5 on the stack, pointing to a heap buffer holding D N - 0 7. Middle, red: let moved = route is a move; the 3 numbers are copied into moved, route is shown dashed as moved out and is no longer usable; there is still one buffer and one owner, moved, and using route now is error E0382. Bottom, green: let copy = moved.clone() creates a second heap buffer with the same text; moved and copy each point to their own buffer, two independent owners, and changing one never changes the other.",
            caption: "A move hands over the one buffer. A clone allocates a second one.",
        }),
        h3("Moves into functions, and loops"),
        p("A function parameter of type `String` or `Vec<String>` takes ownership of the argument, as `add_late_scans` did. When the function returns, its parameters go out of scope and are dropped, unless the function returns them to the caller. A `for` loop over a vector moves the vector too:"),
        code("rust", `
fn main() {
    let cage = vec![String::from("SH-1001"), String::from("SH-1002")];
    for parcel in cage {
        println!("{parcel}");
    }
    println!("{} parcels", cage.len());
}`, "src/main.rs"),
        code("text", `
error[E0382]: borrow of moved value: \`cage\`
 --> src/main.rs:6:28
  |
2 |     let cage = vec![String::from("SH-1001"), String::from("SH-1002")];
  |         ---- move occurs because \`cage\` has type \`Vec<String>\`, which does not implement the \`Copy\` trait
3 |     for parcel in cage {
  |                   ---- \`cage\` moved due to this implicit call to \`.into_iter()\`
...
6 |     println!("{} parcels", cage.len());
  |                            ^^^^ value borrowed here after move
...
help: consider iterating over a slice of the \`Vec<String>\`'s content to avoid moving into the \`for\` loop
  |
3 |     for parcel in &cage {
  |                   +`),
        p("This time the `help:` line suggests `&cage`, which **borrows** the vector instead of taking it. Borrowing is the topic of the next lesson; this one is about owning. Notice that the compiler offered two different fixes for the same error code. Neither is automatically right: you have to decide who should own the data."),

        h2("5. Copy types"),
        p("Some values are so small and simple that copying them is as cheap as moving them, and there is no heap buffer to free. Those types are **`Copy`**: assigning or passing them copies the value, and the old variable stays usable."),
        code("rust", `
fn main() {
    let parcels: u32 = 300;
    let copy = parcels;            // u32 is Copy: both are usable
    println!("{parcels} {copy}");

    let label = "fragile";         // &str literal: Copy as well
    let again = label;
    println!("{label} {again}");

    let cage = (12_u8, 'B');       // a tuple of Copy values is Copy
    let spare = cage;
    println!("{cage:?} {spare:?}");
}`, "src/main.rs"),
        code("text", `
300 300
fragile fragile
(12, 'B') (12, 'B')`),
        bullets([
            "**Copy:** all integer and float types, `bool`, `char`, `&str` (a reference to text, not the text itself), and tuples or arrays whose parts are all `Copy`.",
            "**Not Copy:** `String`, `Vec<T>`, and anything that contains one, such as a tuple `(u8, String)`. These own a heap buffer, so copying them would mean either a double owner or a hidden, expensive copy.",
        ]),
        p("That is why `let total = parcels;` in the quiz is fine and `let moved = route;` is not. The error message even says it: `String`, which does not implement the `Copy` trait."),

        h2("6. Clone: an explicit, real copy"),
        p("`.clone()` creates a second, independent value with its own heap buffer. Afterwards there are two owners of two buffers, and changing one never changes the other:"),
        code("rust", `
fn main() {
    let first = String::from("SH-1001");
    let mut second = first.clone();    // a second buffer with the same text
    second.push_str("-B");
    println!("{first} {second}");      // SH-1001 SH-1001-B
}`, "src/main.rs"),
        p("Clone is the right tool when you **really need two independent values**: a snapshot of a cage before it changes, a default you are about to modify. It is the wrong tool when you add it **to make an ownership error go away**:"),
        bullets([
            "**It can change the meaning.** In the incident, the late scan was added to the clone, and the clone was thrown away. The compiler cannot know which copy you meant to keep.",
            "**It costs memory and time.** Cloning a `Vec<String>` of 2 000 parcels allocates 2 001 new buffers and copies every byte.",
        ]),
        callout("warning", "Read help: consider cloning as a question, not an answer",
            "When rustc suggests clone, ask: do I want two independent values here? If the answer is no, the fix is usually to use the value returned by the function, to move the value instead of using it twice, or to borrow it (lesson 2-1)."),

        h2("7. Taking ownership and giving it back"),
        p("A function that takes a `Vec` by value owns it: it may change it, and it decides what happens to it at the end. If the caller still needs it, the function returns it, and the caller binds the result again:"),
        code("rust", `
fn add_bag(mut cage: Vec<String>, bag: Vec<String>) -> Vec<String> {
    for parcel in bag {           // the bag is consumed: its Strings move into the cage
        cage.push(parcel);
    }
    cage                          // ownership goes back to the caller
}

fn main() {
    let cage = vec![String::from("SH-1001")];
    let cage = add_bag(cage, vec![String::from("SH-1002")]);
    let cage = add_bag(cage, vec![String::from("SH-1003")]);
    println!("{}: {:?}", cage.len(), cage);   // 3: ["SH-1001", "SH-1002", "SH-1003"]
}`, "src/main.rs"),
        bullets([
            "**`mut cage`** in the parameter list makes the function's own variable mutable. The caller's variable does not need `mut`, because the caller gives the vector away.",
            "**The last expression without a semicolon** is the return value: `cage` at the end of `add_bag` returns the vector. With a semicolon, `cage;` would return nothing and the compiler would report a type mismatch.",
            "**`let cage = add_bag(cage, ...)`** shadows the moved variable with the returned one. Ownership went into the function and came back out.",
            "**No `.clone()` anywhere**, and no copy of any parcel id: the `String`s were moved from the bag into the cage.",
        ]),
        p("Passing ownership in and out works, but it is clumsy when a function only needs to **look** at a value. Lesson 2-1 adds borrowing (`&` and `&mut`) for exactly that."),

        h2("8. Practice"),
        p("First, decide which values are moved, copied or cloned."),
        challenge("chal_quiz_rsf_121"),
        p("Then fix a cage manifest that was written by adding `.clone()` until it compiled. Each function owns the cages it is given: change them directly and return the right ones."),
        challenge("chal_fix_rsf_122", "Look at what each function returns. Inside add_bag you already own the cage, so you can push into it directly and check for duplicates in the cage you are building. After a merge the first cage should be empty: Vec::new()."),

        h2("9. The fix"),
        p("The fix for the incident is one line in `main`: use the vector that `add_late_scans` gives back. The team also marked the function with `#[must_use]`, so ignoring its result is now a compiler warning:"),
        code("rust", `
#[must_use = "the updated cage is returned; the old one was moved in"]
fn add_late_scans(mut cage: Vec<String>, late: Vec<String>) -> Vec<String> {
    for parcel in late {
        cage.push(parcel);
    }
    cage
}

fn print_manifest(route: String, cage: Vec<String>) {
    println!("{route}: {} parcels", cage.len());
    for parcel in cage {
        println!("  {parcel}");
    }
}

fn main() {
    let route = String::from("DN-07");
    let cage = vec![String::from("SH-1001"), String::from("SH-1002")];
    let late = vec![String::from("SH-1003")];

    let cage = add_late_scans(cage, late);
    print_manifest(route, cage);
}`, "src/main.rs"),
        code("text", `
DN-07: 3 parcels
  SH-1001
  SH-1002
  SH-1003`),
        p("With the attribute in place, the old line `add_late_scans(cage.clone(), late.clone());` now produces:"),
        code("text", `
warning: unused return value of \`add_late_scans\` that must be used
  --> src/main.rs:21:5
   |
21 |     add_late_scans(cage.clone(), late.clone());
   |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   |
   = note: the updated cage is returned; the old one was moved in
   = note: \`#[warn(unused_must_use)]\` (part of \`#[warn(unused)]\`) on by default`),
        numbered([
            "**Use the returned value.** A function that takes ownership and returns the result is telling you where the up-to-date data is.",
            "**No clones.** Every `String` is moved, never copied: the late scan moves from `late` into `cage`, and `cage` moves into `print_manifest`, which drops it at the end.",
            "**`#[must_use]`** turns \"forgot to use the result\" into a warning. The standard library uses it on many methods for the same reason.",
            "**Treat warnings as errors in CI** (`RUSTFLAGS=\"-D warnings\"`), so a warning like this one cannot be merged.",
        ]),

        h2("10. Pitfalls"),
        bullets([
            "**Accepting every `consider cloning` suggestion.** It compiles, and it may change which copy your program updates.",
            "**Ignoring a function's return value** when the function took ownership of its input: the input is gone, the result is the only up-to-date version.",
            "**Expecting a tuple or collection of `String`s to be `Copy`.** A type is `Copy` only if every part is.",
            "**Iterating with `for x in v` and using `v` afterwards.** The loop consumed it; borrow with `for x in &v` (lesson 2-1).",
            "**Cloning large collections inside loops** to get past an error: the program gets slower with every parcel, and the bug is still there.",
            "**Forgetting `mut` on a parameter** that the function changes: write `fn add_bag(mut cage: Vec<String>, ...)`.",
            "**A semicolon after the last expression** of a function that should return it: `cage;` returns `()`, not the vector.",
        ]),

        h2("11. Checklist"),
        bullets([
            "For each `String` or `Vec`, you can say which variable owns it at each line.",
            "Values are moved, not cloned, unless two independent copies are really needed.",
            "Every `.clone()` in the code has a reason you could write in a comment.",
            "Functions that take ownership and return an updated value have their result used, and are marked `#[must_use]`.",
            "Small values (`u32`, `f64`, `bool`, `char`, `&str`) are passed by value without a second thought: they are `Copy`.",
            "Warnings fail the CI build.",
        ]),
    ],
});
