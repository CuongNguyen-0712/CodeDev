// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-rsf-4-1",
    title: "Traits basics",
    slug: { _type: "slug", current: "rust-traits-basics" },
    description:
        "Three thousand customers of Song Han Logistics received a delivery SMS that read: your parcel Parcel { id: \"DN-07-0412\", weight_g: 1250, cod_vnd: 185000 } is out for delivery today. The developer had followed the compiler's own suggestion to use {:?}. Learn what a trait is, how to define one and implement it for your types, default methods, the difference between Debug and Display and how to write fmt::Display by hand, what derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord) gives a type, and how trait bounds let one generic function work for every type that implements a trait.",
    estimatedTime: 25,

    scenario: {
        role: "Junior developer at Song Han Logistics, porting the depot's notification scripts to Rust",
        problem:
            "The morning SMS batch for the Da Nang routes went out with the internal debug form of each parcel in the text, field names, quotes and all. Customer support got 140 calls before 9:00 asking whether the message was a scam. The code compiled without a warning, and the developer had only done what the compiler suggested.",
    },

    content: [
        h2("1. The incident"),
        p("Every morning at 7:00, the depot sends an SMS to each customer whose parcel is on a truck. The old Python script built the text with an f-string. In the Rust port, a parcel is a struct, and the SMS text is built with `format!`:"),
        code("rust", `
#[derive(Debug)]
struct Parcel {
    id: String,
    weight_g: u32,
    cod_vnd: u64,
}

fn sms_text(parcel: &Parcel) -> String {
    format!("Song Han: your parcel {:?} is out for delivery today.", parcel)
}

fn main() {
    let parcel = Parcel { id: String::from("DN-07-0412"), weight_g: 1250, cod_vnd: 185_000 };
    println!("{}", sms_text(&parcel));
}`, "src/main.rs"),
        p("On 3 March, about 3 000 customers received this:"),
        code("text", `
Song Han: your parcel Parcel { id: "DN-07-0412", weight_g: 1250, cod_vnd: 185000 } is out for delivery today.`),
        bullets([
            "**Nothing crashed.** The program did what `{:?}` means: print the value in its **debug** form, the one meant for developers.",
            "**It leaked internal names.** `cod_vnd` (cash on delivery) and `weight_g` are field names, not words a customer knows. Some customers thought the message was phishing and called support.",
        ]),

        h2("2. Reproduce it: the compiler's suggestion"),
        p("The first version of `sms_text` used `{}`, like most format strings do. It did not compile:"),
        code("text", `
error[E0277]: \`Parcel\` doesn't implement \`std::fmt::Display\`
 --> src/main.rs:9:68
  |
9 |     format!("Song Han: your parcel {} is out for delivery today.", parcel)
  |                                    --                              ^^^^^^ \`Parcel\` cannot be formatted with the default formatter
  |                                    |
  |                                    required by this formatting parameter
  |
help: the trait \`std::fmt::Display\` is not implemented for \`Parcel\`
 --> src/main.rs:2:1
  |
2 | struct Parcel {
  | ^^^^^^^^^^^^^
  = note: in format strings you may be able to use \`{:?}\` (or {:#?} for pretty-print) instead
  = note: required for \`&Parcel\` to implement \`std::fmt::Display\``),
        p("The developer read the `note:` line, changed `{}` to `{:?}`, and the program compiled. The note is good advice for a log line. For a message to a customer it is the wrong fix, and to see why you need the idea behind both lines of the error: **traits**."),
        bullets([
            "`{}` asks the value for its **`Display`** trait: the text a person should read.",
            "`{:?}` asks for its **`Debug`** trait: the text a developer should read. `#[derive(Debug)]` generated that one automatically from the field names.",
            "`Parcel` had `Debug` but no `Display`, so `{}` could not compile and `{:?}` could.",
        ]),

        h2("3. What a trait is"),
        p("A **trait** is a named set of methods that a type promises to have. It describes what a type **can do**, not what it **is**. The depot prices two kinds of items, documents and packages. They have different fields, but both can be priced, so the team wrote a `Priced` trait:"),
        code("rust", `
trait Priced {
    fn price_vnd(&self) -> u64;                 // required: every type must write it

    fn price_text(&self) -> String {            // default method: written once, here
        format!("{} VND", self.price_vnd())
    }
}

struct Document {
    express: bool,
}

struct Package {
    weight_g: u32,
}

impl Priced for Document {
    fn price_vnd(&self) -> u64 {
        if self.express { 25_000 } else { 15_000 }
    }
}

impl Priced for Package {
    fn price_vnd(&self) -> u64 {
        20_000 + u64::from(self.weight_g / 1000) * 8_000
    }

    fn price_text(&self) -> String {            // a type may override a default method
        format!("{} VND ({} g)", self.price_vnd(), self.weight_g)
    }
}

fn main() {
    let letter = Document { express: true };
    let carton = Package { weight_g: 2300 };
    println!("{}", letter.price_vnd());
    println!("{}", letter.price_text());
    println!("{}", carton.price_text());
}`, "src/main.rs"),
        code("text", `
25000
25000 VND
36000 VND (2300 g)`),
        bullets([
            "**`trait Priced { ... }`** declares the methods. A method with only a signature and a `;` is **required**: every type that implements the trait must write it.",
            "**A method with a body is a default method.** `Document` gets `price_text` for free; `Package` replaces it with its own version.",
            "**`impl Priced for Document { ... }`** is where a type keeps the promise. If a required method is missing, the program does not compile (`error[E0046]: not all trait items implemented, missing: price_vnd`).",
            "**`&self`** is the value the method is called on, borrowed (lesson 2-1). Inside the trait, `self.price_vnd()` works for every type, because every type that implements `Priced` has that method.",
            "A type only has the methods of the traits it implements. Calling `price_text()` on a type without `impl Priced` is `error[E0599]: no method named price_text found for struct Document`.",
        ]),
        callout("info", "Traits from the standard library work the same way",
            "Display, Debug, Clone, PartialEq, Ord, Hash and Iterator are all ordinary traits defined in the standard library. format!, sort, HashMap and the for loop simply require that your type implements the right one. Implementing them is how your types plug into the rest of Rust."),

        h2("4. Display: text for people"),
        p("`Display` has one required method, `fmt`, which writes the text into a `Formatter`. You cannot derive it: only you know what a customer should read. Here is `Display` for the parcel:"),
        code("rust", `
use std::fmt;

struct Parcel {
    id: String,
    weight_g: u32,
    cod_vnd: u64,
}

impl fmt::Display for Parcel {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let kg = f64::from(self.weight_g) / 1000.0;
        write!(f, "{} ({kg:.2} kg, COD {} VND)", self.id, self.cod_vnd)
    }
}

fn main() {
    let parcel = Parcel { id: String::from("DN-07-0412"), weight_g: 1250, cod_vnd: 185_000 };
    println!("Song Han: your parcel {parcel} is out for delivery today.");
    let label: String = parcel.to_string();   // Display gives you to_string() for free
    println!("{label}");
    println!("[{:>40}]", parcel);              // width is ignored: write! does not pad
    println!("[{:>40}]", parcel.to_string());  // pad the String instead
}`, "src/main.rs"),
        code("text", `
Song Han: your parcel DN-07-0412 (1.25 kg, COD 185000 VND) is out for delivery today.
DN-07-0412 (1.25 kg, COD 185000 VND)
[DN-07-0412 (1.25 kg, COD 185000 VND)]
[    DN-07-0412 (1.25 kg, COD 185000 VND)]`),
        bullets([
            "**`write!(f, ...)`** works like `format!`, but writes into the formatter instead of creating a new `String`. It returns a `fmt::Result`, which `fmt` returns as is.",
            "**`to_string()`** comes free with every `Display` type, the same way it works on numbers.",
            "**Width and alignment such as `{:>40}` are ignored** by a `fmt` that only calls `write!`. Format the `to_string()` result when you need padding, as in the last line.",
        ]),
        h3("Several write! calls"),
        p("When the text depends on the data, call `write!` several times. Each call can fail (a full output buffer, a closed pipe), so end each one with `?`, which returns the error at once (lesson 3-1), and return `Ok(())` at the end. A `Display` implementation can also reuse another type's `Display`:"),
        code("rust", `
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Priority {
    Standard,
    Express,
    SameDay,
}

impl fmt::Display for Priority {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let text = match self {
            Priority::Standard => "standard",
            Priority::Express => "express",
            Priority::SameDay => "same day",
        };
        write!(f, "{text}")
    }
}

struct Stop {
    route: String,
    priority: Priority,
    parcels: u32,
}

impl fmt::Display for Stop {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}: {} parcels", self.route, self.parcels)?;   // ? stops at the first error
        if self.priority != Priority::Standard {
            write!(f, " [{}]", self.priority)?;                   // Display of Priority, reused
        }
        Ok(())
    }
}

fn main() {
    let stops = [
        Stop { route: String::from("DN-07"), priority: Priority::SameDay, parcels: 41 },
        Stop { route: String::from("DN-12"), priority: Priority::Standard, parcels: 18 },
        Stop { route: String::from("HA-03"), priority: Priority::Express, parcels: 9 },
    ];
    for stop in &stops {
        println!("{stop}");
    }
}`, "src/main.rs"),
        code("text", `
DN-07: 41 parcels [same day]
DN-12: 18 parcels
HA-03: 9 parcels [express]`),
        image("debug-vs-display", {
            alt: "Diagram: one Parcel, two formats; {:?} is for developers, {} is for people. Both are traits; Debug can be derived, Display has to be written because only you know what a customer should read. Left, red, Debug with {:?} and {:#?}: #[derive(Debug)] is generated from the field names, shows everything, quotes strings and changes when a field is added; it prints Parcel { id: \"DN-07-0412\", weight_g: 1250, cod_vnd: 185000 }. Right, green, Display with {} and .to_string(): impl fmt::Display for Parcel is written by hand in fn fmt, you choose the words, units and order, and it cannot be derived; it prints DN-07-0412 (1.25 kg). Bottom, what each derive gives a type: Debug gives {:?}, {:#?} and readable assert_eq! failures; Clone gives .clone(), an explicit and possibly expensive copy; Copy, which needs Clone, makes let q = p copy instead of move, only if every field is Copy, so no String and no Vec; PartialEq and Eq give == and !=, contains() and dedup(), comparing all fields; Hash with Eq makes the type a key in HashMap and HashSet; PartialOrd and Ord give < and >, sort(), max() and BTreeMap keys, comparing fields top to bottom and enum variants in declaration order. Not derived: Display, and your own traits such as Priced; those you implement with impl Trait for Type.",
            caption: "Derive the traits that only depend on the fields. Write Display, and your own traits, by hand.",
        }),

        h2("5. derive: traits the compiler can write for you"),
        p("Some traits have only one sensible implementation: compare every field, copy every field, hash every field. For those, `#[derive(...)]` asks the compiler to write the `impl` block. Each derive switches on something specific:"),
        code("rust", `
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
enum Priority {
    Standard,
    Express,
    SameDay,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
struct RouteCode {
    depot: String,
    number: u16,
}

fn main() {
    let p = Priority::Express;
    let q = p;                                  // Copy: p is copied, still usable
    println!("{p:?} {q:?} {}", p == q);         // PartialEq: == and !=
    let mut queue = vec![Priority::SameDay, Priority::Standard, Priority::Express];
    queue.sort();                               // Ord on an enum: declaration order
    println!("{queue:?}");

    let mut routes = vec![
        RouteCode { depot: String::from("DN"), number: 12 },
        RouteCode { depot: String::from("HA"), number: 3 },
        RouteCode { depot: String::from("DN"), number: 7 },
    ];
    routes.sort();                              // Ord on a struct: field by field, top to bottom
    println!("{routes:?}");

    let dn7 = RouteCode { depot: String::from("DN"), number: 7 };
    let mut parcels_per_route: HashMap<RouteCode, u32> = HashMap::new();
    parcels_per_route.insert(dn7.clone(), 300); // Eq + Hash: usable as a key; Clone: .clone()
    println!("{:?}", parcels_per_route.get(&dn7));
}`, "src/main.rs"),
        code("text", `
Express Express true
[Standard, Express, SameDay]
[RouteCode { depot: "DN", number: 7 }, RouteCode { depot: "DN", number: 12 }, RouteCode { depot: "HA", number: 3 }]
Some(300)`),
        bullets([
            "**`Debug`**: `{:?}` and `{:#?}` (one field per line). Derive it on almost every type; `assert_eq!` needs it to print what went wrong.",
            "**`Clone`**: an explicit `.clone()`. **`Copy`**: assignment and passing to a function copy the value instead of moving it (lesson 1-2). `Copy` is only allowed when every field is `Copy`: numbers, `bool`, `char` and enums without data, but not `String` or `Vec`.",
            "**`PartialEq`, `Eq`**: `==` and `!=`, true when every field is equal. Also needed by `contains` and `dedup`.",
            "**`Hash`** (together with `Eq`): the type can be a `HashMap` key or a `HashSet` element (lesson 3-2).",
            "**`PartialOrd`, `Ord`**: `<`, `>`, `sort()`, `max()` and `BTreeMap` keys. Structs compare field by field **in the order the fields are written**, so `RouteCode` sorts by `depot` first, then by `number`. Enum variants compare in **declaration order**, not alphabetically.",
        ]),
        p("Forget a derive and the compiler tells you which one, usually with the line to add:"),
        code("text", `
error[E0369]: binary operation \`==\` cannot be applied to type \`RouteCode\`
  --> src/main.rs:10:22
   |
10 |     println!("{}", a == b);
   |                    - ^^ - RouteCode
   |                    |
   |                    RouteCode
   |
note: an implementation of \`PartialEq\` might be missing for \`RouteCode\`
help: consider annotating \`RouteCode\` with \`#[derive(PartialEq)]\``),
        code("text", `
error[E0204]: the trait \`Copy\` cannot be implemented for this type
 --> src/main.rs:1:24
  |
1 | #[derive(Debug, Clone, Copy)]
  |                        ^^^^
2 | struct Parcel {
3 |     id: String,
  |     ---------- this field does not implement \`Copy\``),
        callout("warning", "Derived order follows the field order, not your intent",
            "A derived Ord compares the first field first. If a Stop struct starts with route and you want to sort by priority, the derive sorts by route. Either put the most important field first, or sort with sort_by_key and say which field you mean."),

        h2("6. Generic functions with trait bounds"),
        p("Traits pay off when one function works for every type that implements them. The total price of a list of documents and the total of a list of packages are the same loop, so write it once, for any `T` that is `Priced`:"),
        code("rust", `
// Priced, Document and Package as in section 3

// T can be any type, as long as it implements Priced
fn total<T: Priced>(items: &[T]) -> u64 {
    let mut sum = 0;
    for item in items {
        sum += item.price_vnd();
    }
    sum
}

// impl Trait in argument position: the same idea, shorter to write
fn print_price(item: &impl Priced) {
    println!("price: {} VND", item.price_vnd());
}

fn main() {
    let letters = [Document { express: false }, Document { express: true }];
    let cartons = vec![Package { weight_g: 800 }, Package { weight_g: 2300 }, Package { weight_g: 5000 }];
    println!("{}", total(&letters));
    println!("{}", total(&cartons));
    print_price(&letters[1]);
    print_price(&cartons[2]);
}`, "src/main.rs"),
        code("text", `
40000
116000
price: 25000 VND
price: 60000 VND`),
        bullets([
            "**`<T: Priced>`** declares a type parameter `T` with a **trait bound**: inside the function you may call exactly the methods of `Priced` on a `T`, nothing else.",
            "**`&[T]`** is a slice (lesson 2-1), so `total` accepts an array (`&letters`) and a `Vec` (`&cartons`) alike.",
            "**`&impl Priced`** is shorthand for a generic parameter with that bound. Use it when the type appears once; use `<T: Priced>` when two parameters must be the same type.",
            "The compiler makes one copy of `total` per type it is used with (`total` for `Document`, `total` for `Package`), so a generic call is as fast as a hand-written one.",
        ]),
        p("Without the bound, the compiler refuses to assume anything about `T`, and tells you which bound to add:"),
        code("text", `
error[E0369]: binary operation \`>\` cannot be applied to type \`T\`
 --> src/main.rs:2:7
  |
2 |     a > b
  |     - ^ - T
  |     |
  |     T
  |
help: consider restricting type parameter \`T\` with trait \`PartialOrd\`
  |
1 | fn heavier<T: std::cmp::PartialOrd>(a: T, b: T) -> bool {
  |             ++++++++++++++++++++++`),
        p("One `T` means **one** type per call. An array that mixes a `Document` and a `Package` is `error[E0308]: mismatched types` (expected `Document`, found `Package`). Mixing types in one list needs **trait objects**, `Vec<&dyn Priced>`, which the next course, Practical Rust, covers together with when to choose them over generics."),

        h2("7. Practice"),
        p("First, predict what derived traits do and which programs compile."),
        challenge("chal_quiz_rsf_411"),
        p("Now fix the evening route sheet: it prints the debug form of every item and a price of 0. Implement the pricing trait and `Display` for both item types, and the generic total."),
        challenge("chal_coding_rsf_412", "Write one impl block per trait and type: impl Priced for Document, impl Priced for Package, impl fmt::Display for Document and for Package. For the started 500 g blocks, look at u32::div_ceil, or add 499 before dividing by 500. For the optional \" (express)\", use two write! calls ending in ? and return Ok(())."),

        h2("8. The fix"),
        p("The team kept `#[derive(Debug)]` for the logs and gave `Parcel` a real `Display`. The SMS text uses `{}`, and the cash-on-delivery sentence is added only when there is something to pay:"),
        code("rust", `
use std::fmt;

#[derive(Debug)]
struct Parcel {
    id: String,
    weight_g: u32,
    cod_vnd: u64,
}

impl fmt::Display for Parcel {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let kg = f64::from(self.weight_g) / 1000.0;
        write!(f, "{} ({kg:.2} kg)", self.id)
    }
}

fn sms_text(parcel: &Parcel) -> String {
    let mut text = format!("Song Han: your parcel {parcel} is out for delivery today.");
    if parcel.cod_vnd > 0 {
        text.push_str(&format!(" Please have {} VND ready.", parcel.cod_vnd));
    }
    text
}

fn main() {
    let parcel = Parcel { id: String::from("DN-07-0412"), weight_g: 1250, cod_vnd: 185_000 };
    let prepaid = Parcel { id: String::from("DN-07-0413"), weight_g: 300, cod_vnd: 0 };
    println!("{}", sms_text(&parcel));
    println!("{}", sms_text(&prepaid));
    println!("log: {parcel:?}");      // Debug stays, for developers and logs

    assert_eq!(
        sms_text(&prepaid),
        "Song Han: your parcel DN-07-0413 (0.30 kg) is out for delivery today."
    );
}`, "src/main.rs"),
        code("text", `
Song Han: your parcel DN-07-0412 (1.25 kg) is out for delivery today. Please have 185000 VND ready.
Song Han: your parcel DN-07-0413 (0.30 kg) is out for delivery today.
log: Parcel { id: "DN-07-0412", weight_g: 1250, cod_vnd: 185000 }`),
        numbered([
            "**`Display` for what people read, `Debug` for what developers read.** Both stay; each is used where it belongs.",
            "**The customer text is decided in one place.** Every SMS, label and receipt that prints a `Parcel` with `{}` gets the same words, and adding a field to the struct no longer changes the SMS.",
            "**A test pins the exact text.** `assert_eq!` compares the whole message, so a future `{:?}` fails the test instead of reaching customers.",
            "**The rule went into the review checklist:** `{:?}` in a string that leaves the company is a bug.",
        ]),

        h2("9. Pitfalls"),
        bullets([
            "**Following the `{:?}` note for user-facing text.** The compiler's suggestion fixes the build, not the message. Implement `Display`.",
            "**Expecting `#[derive(Display)]`.** It does not exist in the standard library; write `impl fmt::Display`.",
            "**Forgetting `?` between several `write!` calls.** Without it, the compiler warns `unused Result that must be used`, and errors are lost.",
            "**`Copy` on a type with a `String` or `Vec`.** Not allowed (E0204). Use `Clone` and call `.clone()` where you really need a second copy.",
            "**Relying on derived `Ord` without checking field order.** It sorts by the first field first; enum variants by declaration order.",
            "**`Hash` without `Eq`.** A `HashMap` key needs both, and they must agree; deriving both on the same type guarantees that.",
            "**A generic function without bounds.** Inside `fn f<T>(x: T)` you cannot compare, print or clone `x` until you add `T: PartialOrd`, `T: Display`, `T: Clone`.",
            "**One generic `T` for mixed types.** `&[T]` holds one type; mixed lists need trait objects (next course).",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every type that a person will read has `impl fmt::Display`; `{:?}` appears only in logs, debugging and tests.",
            "Types derive `Debug`, plus exactly the traits they need: `Clone`, `Copy` for small value types, `PartialEq`/`Eq`, `Hash`, `PartialOrd`/`Ord`.",
            "The field order of a type with derived `Ord` is the sort order you want, or sorting uses an explicit key.",
            "Shared behaviour is a trait with required methods; shared code inside it is a default method.",
            "Functions that work for several types take `&[T]` or `&impl Trait` with the smallest bound that compiles.",
            "Customer-facing text is pinned by a test that compares the full string.",
        ]),
    ],
});
