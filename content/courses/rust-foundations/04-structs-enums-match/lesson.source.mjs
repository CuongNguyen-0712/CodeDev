// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-rsf-2-2",
    title: "Structs, enums & match",
    slug: { _type: "slug", current: "rust-structs-enums-match" },
    description:
        "The daily cash-on-delivery report came out 275 000 VND short, and a driver was asked to explain the missing cash. He had handed in every đồng: the report only counted parcels whose status string was exactly \"delivered\", and the new driver app wrote \"Delivered\". Learn how to group data in a struct, add methods with impl, &self and &mut self, model states with enums whose variants carry their own data, and let match check that every case is handled, with if let and matches! for the one-case checks.",
    estimatedTime: 25,

    scenario: {
        role: "Junior developer at Song Han Logistics, owner of the parcel tracking module",
        problem:
            "Each parcel has a status stored as text, written by three programs: the depot scanner, the driver app and a support tool. The end-of-day cash report adds up the cash on delivery (COD) of every parcel with status \"delivered\". After the driver app was updated, the report for route DN-07 was 275 000 VND short, and the money was sitting in the driver's bag the whole time.",
    },

    content: [
        h2("1. The incident"),
        p("Many parcels are paid in cash on delivery: the driver collects the price at the door and hands the cash in at the end of the day. The cash report was one of the first tools ported to Rust, and the port kept the old data model, a status string:"),
        code("rust", `
struct Parcel {
    id: String,
    status: String,
    cod_vnd: u32,
}

fn cod_collected(parcels: &[Parcel]) -> u32 {
    let mut total = 0;
    for p in parcels {
        if p.status == "delivered" {
            total += p.cod_vnd;
        }
    }
    total
}

fn main() {
    let parcels = vec![
        Parcel { id: String::from("SH-1001"), status: String::from("delivered"), cod_vnd: 250_000 },
        Parcel { id: String::from("SH-1002"), status: String::from("Delivered"), cod_vnd: 180_000 },
        Parcel { id: String::from("SH-1003"), status: String::from("delivred"), cod_vnd: 95_000 },
        Parcel { id: String::from("SH-1004"), status: String::from("returned"), cod_vnd: 120_000 },
    ];
    println!("COD collected: {} VND", cod_collected(&parcels));
}`, "src/main.rs"),
        code("text", `
COD collected: 250000 VND`),
        p("The driver had collected 250 000 + 180 000 + 95 000 = 525 000 VND. The report said 250 000. `SH-1002` was written as `\"Delivered\"` by the new version of the driver app, and `SH-1003` as `\"delivred\"` by a support agent fixing a record by hand. Both compiled into perfectly valid strings."),
        bullets([
            "**A string can hold any text, so the compiler cannot check it.** Every program that writes a status can invent a new spelling, and every program that reads one has to guess.",
            "**The data that belongs to a status is not attached to it.** `cod_vnd` is the cash due, but nothing says whether it was collected, and a returned parcel still carries an amount.",
        ]),
        p("Rust has a better tool for \"one of a fixed set of states\": the **enum**. First, structs."),

        h2("2. Structs: grouping data"),
        p("A **struct** groups named values, its **fields**, into one type. You saw one above. Methods go into an **`impl` block** next to it:"),
        code("rust", `
#[derive(Debug)]
struct Cage {
    route: String,
    capacity: u16,
    parcels: Vec<String>,
}

impl Cage {
    fn new(route: &str, capacity: u16) -> Cage {     // associated function: Cage::new(...)
        Cage { route: route.to_string(), capacity, parcels: Vec::new() }
    }

    fn is_full(&self) -> bool {                      // &self: reads the cage
        self.parcels.len() >= usize::from(self.capacity)
    }

    fn load(&mut self, parcel: &str) -> bool {       // &mut self: changes the cage
        if self.is_full() {
            return false;
        }
        self.parcels.push(parcel.to_string());
        true
    }
}

fn main() {
    let mut cage = Cage::new("DN-07", 2);
    println!("{}", cage.load("SH-1001"));   // true
    println!("{}", cage.load("SH-1002"));   // true
    println!("{}", cage.load("SH-1003"));   // false: full
    println!("{} holds {} of {}", cage.route, cage.parcels.len(), cage.capacity);
    println!("{cage:?}");
}`, "src/main.rs"),
        code("text", `
true
true
false
DN-07 holds 2 of 2
Cage { route: "DN-07", capacity: 2, parcels: ["SH-1001", "SH-1002"] }`),
        bullets([
            "**`Cage { route: ..., capacity, parcels: ... }`** creates a value. Every field must be given. `capacity` alone is shorthand for `capacity: capacity` when a variable has the field's name.",
            "**An associated function** has no `self` parameter and is called on the type: `Cage::new(...)`. `new` is only a convention, not a keyword.",
            "**`&self`** borrows the struct for reading, **`&mut self`** borrows it for changing; these are the borrows of lesson 2-1. `cage.load(...)` needs `let mut cage`. A method that takes `self` (no `&`) would consume the struct, as in lesson 1-2.",
            "**`self.parcels.len()`** is a `usize` and `capacity` is a `u16`, so the comparison converts with `usize::from` (lesson 1-1).",
            "**`#[derive(Debug)]`** asks the compiler to write the code that prints the struct with `{:?}`. `{:#?}` prints it over several lines. Debug output is for developers, not for customers; lesson 4-1 adds user-facing formatting.",
        ]),

        h2("3. Enums: one of several variants, each with its own data"),
        p("An **enum** lists every possible variant of a type. Unlike enums in many other languages, each variant can carry its **own data**:"),
        code("rust", `
#[derive(Debug)]
enum Status {
    InDepot,
    OutForDelivery { driver: String },
    Delivered { cod: u32 },
    Returned { reason: String },
}`, "src/status.rs"),
        bullets([
            "**A `Status` is always exactly one of the four.** There is no fifth spelling: `Status::Delivred` is a compile error, not a silent zero in a report.",
            "**The data lives inside the variant it belongs to.** Only a delivered parcel has a collected `cod`; only a returned parcel has a `reason`; only a parcel out for delivery has a `driver`. You cannot read the driver of a parcel that is in the depot, because there is none.",
            "**Variants are written `Status::InDepot`** or, with data, `Status::Delivered { cod: 250_000 }`. A variant can also hold unnamed values, like `Weighed(u32)`.",
        ]),
        p("You already know two enums from the standard library: `Option<T>` is `Some(value)` or `None`, which `checked_add` returned in lesson 1-1, and `Result<T, E>` is `Ok(value)` or `Err(error)`, which `try_from` returned. Lesson 3-1 is about both."),
        image("parcel-status", {
            alt: "State diagram of enum Status: a parcel is in exactly one variant, and match must handle every variant. InDepot has no extra data. OutForDelivery holds driver: String. Delivered holds cod: u32. Returned holds reason: String. Arrows: from InDepot, the event Out with a driver goes to OutForDelivery. From OutForDelivery, Deliver with cod goes to Delivered, only if cod equals cod_due; Fail on attempts 1 and 2 goes back to InDepot; Fail on the 3rd attempt goes to Returned. A dashed arrow, Recall, goes from InDepot straight to Returned, from the depot only. Bottom note: every other event is rejected; Delivered and Returned are final; a typo such as Status::Delivred does not compile, and a new variant breaks every match that forgets it, error E0004.",
            caption: "The parcel lifecycle as an enum. Each status carries only the data that exists in that status.",
        }),

        h2("4. match: handle every case"),
        p("`match` compares a value against **patterns**, top to bottom, and runs the first arm that fits. Patterns can take enum variants apart and bind their data to names:"),
        code("rust", `
fn describe(status: &Status) -> String {
    match status {
        Status::InDepot => String::from("in depot"),
        Status::OutForDelivery { driver } => format!("out with {driver}"),
        Status::Delivered { cod } => format!("delivered, COD {cod} VND"),
        Status::Returned { reason } => format!("returned: {reason}"),
    }
}

fn cod_collected(statuses: &[Status]) -> u32 {
    let mut total = 0;
    for status in statuses {
        if let Status::Delivered { cod } = status {
            total += cod;
        }
    }
    total
}

fn main() {
    let statuses = vec![
        Status::Delivered { cod: 250_000 },
        Status::OutForDelivery { driver: String::from("Minh") },
        Status::Delivered { cod: 180_000 },
        Status::Returned { reason: String::from("wrong address") },
        Status::InDepot,
    ];
    for s in &statuses {
        println!("{}", describe(s));
    }
    println!("COD collected: {} VND", cod_collected(&statuses));
    let delivered = statuses.iter().filter(|s| matches!(s, Status::Delivered { .. })).count();
    println!("{delivered} delivered");
}`, "src/main.rs"),
        code("text", `
delivered, COD 250000 VND
out with Minh
delivered, COD 180000 VND
returned: wrong address
in depot
COD collected: 430000 VND
2 delivered`),
        bullets([
            "**`match` is an expression**: each arm produces a value, here a `String`, and all arms must produce the same type. `format!` works like `println!` but returns the text instead of printing it.",
            "**`Status::Delivered { cod }`** binds the variant's field to a variable `cod` inside the arm. `{ .. }` ignores all fields.",
            "**`if let`** is a `match` with one interesting arm: run the block only if the value fits the pattern. It is the right tool when every other case means \"do nothing\".",
            "**`matches!(value, pattern)`** returns `true` or `false`. Useful for counting and filtering.",
        ]),
        h3("Exhaustiveness: the compiler keeps the list"),
        p("A `match` must cover every possible value. Add a variant `Lost` to `Status` and every `match` that does not handle it stops compiling:"),
        code("text", `
error[E0004]: non-exhaustive patterns: \`&Status::Lost\` not covered
  --> src/main.rs:10:11
   |
10 |     match status {
   |           ^^^^^^ pattern \`&Status::Lost\` not covered
   |
note: \`Status\` defined here
  --> src/main.rs:1:6
   |
 1 | enum Status {
   |      ^^^^^^
...
 6 |     Lost,
   |     ---- not covered
   = note: the matched value is of type \`&Status\``),
        p("This is the opposite of the string bug: when the set of statuses changes, the compiler hands you the list of every place that needs a decision. Use the wildcard `_ => ...` only when \"everything else\" really means the same thing, and you want new variants to fall into it silently."),
        h3("match on numbers and tuples"),
        p("Patterns work on numbers too, with ranges, and `_` matches anything:"),
        code("rust", `
fn size_class(weight_g: u32) -> &'static str {
    match weight_g {
        0 => "invalid",
        1..=2_000 => "small",
        2_001..=10_000 => "medium",
        _ => "bulky",                 // _ matches everything else
    }
}

fn main() {
    for w in [0, 850, 2_000, 7_400, 31_000] {
        println!("{w} g: {}", size_class(w));
    }
}`, "src/main.rs"),
        code("text", `
0 g: invalid
850 g: small
2000 g: small
7400 g: medium
31000 g: bulky`),
        p("`&'static str` is a string slice that lives for the whole program, which every string literal does. Matching on a **tuple** of two values, such as `(current_status, event)`, is a clean way to write a state machine: each arm is one allowed move, and `_ => ...` rejects everything else. That is the shape of the practice challenge."),
        callout("tip", "Guards add a condition to an arm",
            "An arm can have an if after its pattern: Status::Delivered { cod } if cod > 1_000_000 => flag_for_audit(). The arm only matches when the pattern fits AND the condition is true; otherwise match tries the next arm."),

        h2("5. Practice"),
        p("Build the parcel status tracker the cash report should have used. The types and `Parcel::new` are given; you write `apply`, `label` and `cod_collected`. The tests send events that are not allowed in the current status, and those must be rejected without changing the parcel."),
        challenge("chal_coding_rsf_221", "In apply, match on the pair (&self.status, event). Write one arm per allowed move, use a guard (if cod == self.cod_due) for the delivery, and let a final _ arm return false. Count the failed attempt before you decide between InDepot and Returned."),

        h2("6. The fix"),
        p("The parcel record now stores a `Status` enum instead of a string. The three programs that write statuses go through one parser at the boundary, which turns the incoming text into a variant or rejects it, and the cash report matches on the variant:"),
        code("rust", `
fn cod_collected(parcels: &[Parcel]) -> u32 {
    let mut total = 0;
    for p in parcels {
        if let Status::Delivered { cod } = p.status {
            total += cod;
        }
    }
    total
}

// SH-1001 Delivered { cod: 250000 }
// SH-1002 Delivered { cod: 180000 }   (the app's "Delivered" is parsed into the variant)
// SH-1003 rejected at the boundary:    "delivred" is not a status; the support tool shows an error
// SH-1004 Returned { reason: "refused" }
// COD collected: 430000 VND, and SH-1003 is fixed by hand before the report runs`, "src/report.rs"),
        numbered([
            "**States are enum variants, not strings.** A typo is a compile error inside the program, and a parse error at its edge.",
            "**Data lives in the variant it belongs to.** `cod` exists only in `Delivered`, so a returned parcel cannot be counted by accident.",
            "**`match` without a catch-all where it matters.** Adding `Lost` or `Damaged` next year will point at the cash report and ask what to do.",
            "**Text is parsed once, at the boundary.** Inside the program, nobody compares status strings again.",
        ]),

        h2("7. Pitfalls"),
        bullets([
            "**Strings or integers for a fixed set of states.** `\"delivered\"`, `\"Delivered\"` and `3` are all valid values the compiler cannot check.",
            "**A separate field for data that belongs to one state**, like `cod_vnd` next to a status. Put it inside the variant.",
            "**`_ =>` everywhere.** It hides new variants from the compiler. Use it for \"really everything else\", not to save typing.",
            "**Forgetting `&mut self`.** A method that changes the struct through `&self` does not compile; one that takes `self` consumes it.",
            "**Printing `{:?}` to users.** `Delivered { cod: 250000 }` is a debug view; write a `label` or a `Display` implementation (lesson 4-1).",
            "**Mixing up `if let` and `==`.** Comparing enums with `==` needs `#[derive(PartialEq)]`, and it cannot bind the data inside; `if let` and `matches!` can.",
        ]),

        h2("8. Checklist"),
        bullets([
            "Related values that travel together are a struct, with methods in an `impl` block.",
            "Methods that read take `&self`, methods that change take `&mut self`.",
            "Every \"one of these states\" value is an enum, and each variant carries only its own data.",
            "Text from outside is turned into a variant at the boundary, or rejected there.",
            "Important `match`es list every variant, so a new variant is a compile error, not a silent default.",
            "`if let` and `matches!` are used for single-case checks; `match` for real decisions.",
        ]),
    ],
});
