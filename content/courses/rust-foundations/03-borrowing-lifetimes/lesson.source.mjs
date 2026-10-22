// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-rsf-2-1",
    title: "Borrowing & the first lifetime errors",
    slug: { _type: "slug", current: "rust-borrowing-lifetimes" },
    description:
        "The Hoi An hub's unload tool removed delivered parcels from a cage while looping over it. The compiler refused (E0502), an index loop compiled but panicked, a bounds check stopped the panic, and from then on a parcel delivered right after another one stayed on the list and was sent out again the next morning. Learn shared and mutable borrows, the one-writer-or-many-readers rule, why a borrow ends at its last use, slices (&str and &[T]) as parameters, retain, and the first lifetime errors: returning a reference to a local value and the missing lifetime specifier.",
    estimatedTime: 25,

    scenario: {
        role: "Junior developer at Song Han Logistics, maintaining the unload tool used at the Hoi An hub",
        problem:
            "When a driver comes back, the hub removes the delivered parcels from the cage list, and whatever is left goes out again the next morning. Since the Rust port, customers who receive two parcels from the same truck sometimes get the second one delivered twice: once on the right day, and again the next morning to an address that already signed for it.",
    },

    content: [
        h2("1. The incident"),
        p("The unload tool keeps the parcels of a returning cage in a `Vec<String>`. The first Rust version removed the delivered ones while looping over the cage, like the Python script it replaced:"),
        code("rust", `
fn remove_delivered(cage: &mut Vec<String>, delivered: &[String]) {
    for (i, parcel) in cage.iter().enumerate() {
        if delivered.contains(parcel) {
            cage.remove(i);
        }
    }
}`, "src/unload.rs"),
        code("text", `
error[E0502]: cannot borrow \`*cage\` as mutable because it is also borrowed as immutable
 --> src/unload.rs:4:13
  |
2 |     for (i, parcel) in cage.iter().enumerate() {
  |                        -----------------------
  |                        |
  |                        immutable borrow occurs here
  |                        immutable borrow later used here
3 |         if delivered.contains(parcel) {
4 |             cage.remove(i);
  |             ^^^^^^^^^^^^^^ mutable borrow occurs here`),
        p("The developer replaced the iterator with a plain index loop. It compiled, and crashed on the first real cage. With the parcels `SH-1001` to `SH-1004` and `SH-1002`, `SH-1003` delivered:"),
        code("rust", `
fn remove_delivered(cage: &mut Vec<String>, delivered: &[String]) {
    for i in 0..cage.len() {
        if delivered.contains(&cage[i]) {
            cage.remove(i);
        }
    }
}`, "src/unload.rs"),
        code("text", `
thread 'main' (26362) panicked at src/unload.rs:3:36:
index out of bounds: the len is 3 but the index is 3
note: run with \`RUST_BACKTRACE=1\` environment variable to display a backtrace`),
        p("So a guard went in at the top of the loop: `if i >= cage.len() { break; }`. No more panics. The cage list printed after unloading:"),
        code("text", `
["SH-1001", "SH-1003", "SH-1004"]`),
        p("`SH-1003` had been delivered, and stayed on the list. Two parcels for the same address are scanned one after the other, so they sit next to each other in the cage, and the second of every such pair went out again the next morning."),
        bullets([
            "**The compiler's first error was a real bug report.** Changing a vector while something else is reading it is exactly what the borrow checker exists to stop.",
            "**The index loop silenced the checker without fixing the bug.** It compiled because each `cage[i]` borrow is short, but the logic still changes the vector under the loop's feet.",
        ]),
        p("This lesson explains what a borrow is, the rule behind E0502, and the standard way to remove items from a vector."),

        h2("2. References: borrowing instead of owning"),
        p("In lesson 1-2 every function took ownership of its arguments and had to give them back. A **reference** lets a function use a value without owning it. Creating a reference is called **borrowing**:"),
        bullets([
            "**`&T`, a shared reference.** The function may read the value, not change it. You create one with `&value`.",
            "**`&mut T`, a mutable reference.** The function may change the value in place. You create one with `&mut value`, and the value itself must be declared `mut`.",
            "When the borrow ends, the owner has its value back, unchanged (`&`) or changed (`&mut`). Nothing is moved, nothing is copied, and nothing is dropped.",
        ]),
        code("rust", `
fn total_weight(weights: &[u32]) -> u32 {      // borrows a slice: reads, does not own
    let mut total = 0;
    for w in weights {
        total += w;
    }
    total
}

fn add_late_scan(cage: &mut Vec<String>, parcel: &str) {   // borrows mutably: may change
    cage.push(parcel.to_string());
}

fn main() {
    let weights = vec![1250, 800, 3100];
    let mut cage = vec![String::from("SH-1001")];

    println!("{} g", total_weight(&weights));       // lend weights, keep ownership
    println!("{} g", total_weight(&weights[1..]));  // lend part of it: 800 + 3100
    add_late_scan(&mut cage, "SH-1002");            // lend cage for writing
    add_late_scan(&mut cage, "SH-1003");
    println!("{cage:?} and still {} weights", weights.len());

    for parcel in &cage {                           // borrow each element, cage survives
        println!("  {parcel}");
    }
    println!("{} parcels", cage.len());
}`, "src/main.rs"),
        code("text", `
5150 g
3900 g
["SH-1001", "SH-1002", "SH-1003"] and still 3 weights
  SH-1001
  SH-1002
  SH-1003
3 parcels`),
        bullets([
            "**`&[u32]` is a slice**: a borrowed view of a run of `u32`s in a row, made of a pointer and a length. `&weights` lends the whole vector as a slice, `&weights[1..]` lends everything from index 1. A function that takes `&[T]` works with vectors, arrays and parts of them.",
            "**`&str` is a string slice**, the same idea for text. A string literal is a `&str`, and `&my_string` turns a `String` into one. Prefer `&str` and `&[T]` parameters over `&String` and `&Vec<T>`: they accept more callers and promise less.",
            "**`for parcel in &cage`** borrows the vector for the loop, so `cage` is still usable afterwards (compare lesson 1-2, where `for parcel in cage` consumed it). `parcel` is a `&String`.",
            "**`parcel.to_string()`** makes an owned `String` from a `&str`, because the cage must own its parcels.",
        ]),

        h2("3. One writer or many readers"),
        p("References follow one rule, checked at every point in your code: **either any number of `&` borrows, or exactly one `&mut` borrow, never both at the same time.** Break it with a shared borrow that is still in use when the vector changes:"),
        code("rust", `
fn main() {
    let mut cage = vec![String::from("SH-1001")];
    let first = &cage[0];
    cage.push(String::from("SH-1002"));
    println!("{first}");
}`, "src/main.rs"),
        code("text", `
error[E0502]: cannot borrow \`cage\` as mutable because it is also borrowed as immutable
 --> src/main.rs:4:5
  |
3 |     let first = &cage[0];
  |                  ---- immutable borrow occurs here
4 |     cage.push(String::from("SH-1002"));
  |     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ mutable borrow occurs here
5 |     println!("{first}");
  |                ----- immutable borrow later used here`),
        p("This is not pedantry. A `Vec` stores its elements in one heap buffer. When `push` needs more room, it allocates a bigger buffer, moves the elements there and frees the old one. `first` would then point into freed memory, the **dangling pointer** behind many crashes and security holes in C and C++. Rust refuses to compile it. Two mutable borrows at once get their own error:"),
        code("text", `
error[E0499]: cannot borrow \`route\` as mutable more than once at a time
 --> src/main.rs:4:13
  |
3 |     let a = &mut route;
  |             ---------- first mutable borrow occurs here
4 |     let b = &mut route;
  |             ^^^^^^^^^^ second mutable borrow occurs here
5 |     a.push('-');
  |     - first borrow later used here`),
        h3("A borrow ends at its last use"),
        p("The checker does not look at blocks, it looks at uses. A reference is alive from where it is created to where it is **last used**. Move the `println!` up and the program compiles; or take an owned copy when you need the value for longer:"),
        code("rust", `
fn main() {
    let mut cage = vec![String::from("SH-1001")];
    let first = &cage[0];
    println!("first: {first}");         // last use of first: the borrow ends here
    cage.push(String::from("SH-1002")); // fine
    let first = cage[0].clone();         // an owned copy is not a borrow
    cage.push(String::from("SH-1003"));
    println!("{first} {}", cage.len());
}`, "src/main.rs"),
        code("text", `
first: SH-1001
SH-1001 3`),
        image("borrow-rules", {
            alt: "Diagram in two parts. Left, the rule at every point in the code: any number of shared borrows &T, for example let a = &cage and let b = &cage, read-only, so nobody can change the cage meanwhile; OR exactly one mutable borrow &mut T, for example let w = &mut cage then w.push, and nobody else may even read the cage meanwhile. Error E0502 means a & and a &mut overlap, E0499 means two &mut overlap, and a borrow lasts until its last use, not until the end of the block. Right, the loop for i in 0..len that calls remove(i) when a parcel is delivered, with SH-1002 and SH-1003 delivered and next to each other. At i = 1 the cage is 1001, 1002, 1003, 1004 and 1002 is removed. At i = 2 the cage is 1001, 1003, 1004: 1003 slid into index 1, which is already done, so the loop checks 1004 at index 2 and skips 1003. At i = 3 the length is now 3 but the range 0..4 was fixed at the start, so the program panics with index out of bounds: the len is 3 but the index is 3. Fixes: cage.retain with a closure that keeps parcels not in delivered, one pass that keeps the order with no index to get wrong; or a while loop that does i += 1 only when nothing was removed at i.",
            caption: "The checker stops a vector from changing while it is borrowed. An index loop gets past the checker, not past the bug.",
        }),

        h2("4. Removing items from a vector"),
        p("Back to the unload tool. `cage.iter()` borrows the cage for the whole loop, so `cage.remove(i)` inside it is E0502. The index version compiles, but `remove(i)` shifts every later element one place to the left. The element that slides into position `i` is never checked, because the loop moves on to `i + 1`. And `0..cage.len()` is computed **once**, before the loop, so after a removal the last index no longer exists: the panic. The `break` guard hid the panic and kept the skip."),
        p("The standard library has a method for exactly this job, `retain`. It keeps the elements for which a test returns `true`, in order, in one pass:"),
        code("rust", `
fn remove_delivered(cage: &mut Vec<String>, delivered: &[String]) -> usize {
    let before = cage.len();
    cage.retain(|parcel| !delivered.contains(parcel));
    before - cage.len()
}

fn remove_delivered_by_hand(cage: &mut Vec<String>, delivered: &[String]) -> usize {
    let mut removed = 0;
    let mut i = 0;
    while i < cage.len() {
        if delivered.contains(&cage[i]) {
            cage.remove(i);      // the next parcel slides into index i: check i again
            removed += 1;
        } else {
            i += 1;              // move on only when nothing was removed
        }
    }
    removed
}

fn main() {
    let ids = ["SH-1001", "SH-1002", "SH-1003", "SH-1004"];
    let delivered = vec![String::from("SH-1002"), String::from("SH-1003")];

    let mut cage: Vec<String> = ids.iter().map(|id| id.to_string()).collect();
    let n = remove_delivered(&mut cage, &delivered);
    println!("{n} removed, left: {cage:?}");

    let mut cage: Vec<String> = ids.iter().map(|id| id.to_string()).collect();
    let n = remove_delivered_by_hand(&mut cage, &delivered);
    println!("{n} removed, left: {cage:?}");
}`, "src/main.rs"),
        code("text", `
2 removed, left: ["SH-1001", "SH-1004"]
2 removed, left: ["SH-1001", "SH-1004"]`),
        bullets([
            "**`|parcel| !delivered.contains(parcel)`** is a **closure**: a small function written inline. `|parcel|` is its parameter (a `&String`), and the expression after it is the result. `retain` calls it once per element. Closures get a lesson of their own in the next course; here, read it as \"keep the parcels that are not delivered\".",
            "**`retain` is the default.** It cannot skip, cannot go out of bounds, and runs in one pass instead of shifting the rest of the vector on every removal.",
            "**The `while` version** is fine when you also need the removed elements (`cage.remove(i)` returns the `String` it took out). The rule: increase `i` only when nothing was removed.",
            "**Removing from the back** with `for i in (0..cage.len()).rev()` also works, because a removal only shifts elements you have already checked.",
        ]),
        callout("info", "Mutating through &mut, not through a copy",
            "A function with a &mut Vec parameter changes the caller's vector. If it clones the vector and changes the clone (let mut rest = cage.clone(); rest.retain(...)), the caller sees nothing, exactly like the lost late scans in lesson 1-2. Change the borrowed value itself, or assign the result back with *cage = rest."),

        h2("5. The first lifetime errors"),
        p("A reference must never outlive the value it points to. Most of the time the compiler checks this without any help. Two errors show up early for everyone."),
        h3("Returning a reference to a local value"),
        code("rust", `
fn route_label(code: &str) -> &str {
    let label = format!("Route {code}");
    &label
}`, "src/main.rs"),
        code("text", `
error[E0515]: cannot return reference to local variable \`label\`
 --> src/main.rs:3:5
  |
3 |     &label
  |     ^^^^^^ returns a reference to data owned by the current function`),
        p("`label` is owned by `route_label` and dropped when the function returns, so the reference would dangle. `format!` builds new text, so return it **owned**: `fn route_label(code: &str) -> String`. Return a reference only to something the caller gave you."),
        h3("Missing lifetime specifier"),
        code("rust", `
fn longer(a: &str, b: &str) -> &str {
    if a.len() >= b.len() { a } else { b }
}`, "src/main.rs"),
        code("text", `
error[E0106]: missing lifetime specifier
 --> src/main.rs:1:32
  |
1 | fn longer(a: &str, b: &str) -> &str {
  |              ----     ----     ^ expected named lifetime parameter
  |
  = help: this function's return type contains a borrowed value, but the signature does not say whether it is borrowed from \`a\` or \`b\`
help: consider introducing a named lifetime parameter
  |
1 | fn longer<'a>(a: &'a str, b: &'a str) -> &'a str {
  |          ++++     ++          ++          ++`),
        p("The returned reference points into `a` or into `b`, and the caller must keep the right one alive. With one reference parameter the compiler assumes the result borrows from it (that is why `fn first_word(text: &str) -> &str` needs nothing). With two, you say it: a **lifetime parameter** `'a` names \"how long a borrow is valid\", and `&'a str` on both inputs and the output means \"the result is valid as long as both inputs are\":"),
        code("rust", `
fn longer<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() >= b.len() { a } else { b }
}

fn first_word(text: &str) -> &str {           // one input reference: no annotation needed
    text.split(' ').next().unwrap_or("")
}

fn route_label(code: &str) -> String {        // build new text: return it owned
    format!("Route {code}")
}

fn main() {
    let hub = String::from("Hoi An");
    let depot = String::from("Da Nang");
    println!("{}", longer(&hub, &depot));       // Da Nang
    println!("{}", first_word("Song Han Logistics")); // Song
    println!("{}", route_label("DN-07"));       // Route DN-07
}`, "src/main.rs"),
        p("A lifetime annotation never makes a value live longer. It only describes the relationship, so the compiler can check every caller. Use the result after one of the inputs is gone, and the caller gets the error:"),
        code("rust", `
fn longer<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() >= b.len() { a } else { b }
}

fn main() {
    let hub = String::from("Hoi An");
    let winner;
    {
        let city = String::from("Tam Ky");
        winner = longer(&hub, &city);
    }
    println!("{winner}");
}`, "src/main.rs"),
        code("text", `
error[E0597]: \`city\` does not live long enough
  --> src/main.rs:10:31
   |
 9 |         let city = String::from("Tam Ky");
   |             ---- binding \`city\` declared here
10 |         winner = longer(&hub, &city);
   |                               ^^^^^ borrowed value does not live long enough
11 |     }
   |     - \`city\` dropped here while still borrowed
12 |     println!("{winner}");
   |                ------ borrow later used here`),
        p("Lifetimes in structs, and the rest of the elision rules, come in the next course. For now: if a function builds something new, return it owned; if it hands back part of an input, the signature says which input."),

        h2("6. Practice"),
        p("First, trace an index loop and decide which borrows compile."),
        challenge("chal_quiz_rsf_211"),
        p("Then fix the hub's unload tool. Both functions get the cage as `&mut Vec<String>`: change it in place, and do not skip a parcel that slides into the position you just emptied."),
        challenge("chal_fix_rsf_212", "For unload, cage.retain(...) with a closure that keeps parcels not in delivered, and compare the length before and after. For take_fragile, use a while loop that only moves i forward when nothing was removed, and push what cage.remove(i) returns."),

        h2("7. The fix"),
        p("The unload tool now uses `retain`, returns how many parcels it removed, and has a test for the exact case that slipped through: two delivered parcels next to each other."),
        code("rust", `
/// Removes every delivered parcel from the cage and returns how many were removed.
fn remove_delivered(cage: &mut Vec<String>, delivered: &[String]) -> usize {
    let before = cage.len();
    cage.retain(|parcel| !delivered.contains(parcel));
    before - cage.len()
}

// test data that reproduces the incident:
// cage      SH-1001 SH-1002 SH-1003 SH-1004
// delivered SH-1002 SH-1003            (neighbours)
// expected  2 removed, left: ["SH-1001", "SH-1004"]`, "src/unload.rs"),
        numbered([
            "**Read E0502 as a design question.** \"Something is reading this vector while I change it\" means the algorithm needs a different shape, not a different loop syntax.",
            "**`retain` for removing by a condition.** One pass, order preserved, no indexes.",
            "**Borrow parameters as narrowly as possible.** `delivered: &[String]` only needs to be read; `cage: &mut Vec<String>` needs to change length, so it gets `&mut Vec`.",
            "**Return the count.** The caller can now check it against the driver's delivery list and flag a mismatch, instead of finding out from customers.",
        ]),

        h2("8. Pitfalls"),
        bullets([
            "**Changing a vector while iterating over it.** E0502 is the compiler catching it; an index loop only moves the bug to run time.",
            "**`for i in 0..v.len()` with removals.** The range is computed once; after a removal you skip an element and may index past the end.",
            "**A bounds check that turns a panic into a silent skip.** A panic you understand is better than wrong data nobody notices.",
            "**Keeping a reference across a `push`.** Use it first, or clone the value you need.",
            "**Returning `&str` to text built inside the function.** Return a `String`.",
            "**`&String` and `&Vec<T>` parameters.** Take `&str` and `&[T]`; they accept more callers.",
            "**Changing a clone of a `&mut` parameter.** The caller's value stays the same.",
            "**Adding lifetime annotations until it compiles.** If the error says a value does not live long enough, the fix is usually to own the value or to keep it alive longer, not more `'a`.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Functions that only read take `&T`, `&str` or `&[T]`; functions that change take `&mut T`; functions that keep the value take it by value.",
            "No vector is changed while a reference into it is still used.",
            "Removing by a condition uses `retain`; a manual loop increases the index only when nothing was removed.",
            "A test covers two neighbouring elements that both match.",
            "New text is returned as `String`; a returned `&str` always points into a parameter.",
            "Lifetime parameters appear only when a function returns a reference and has more than one reference input.",
        ]),
    ],
});
