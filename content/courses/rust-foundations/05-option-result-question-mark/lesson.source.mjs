// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-rsf-3-1",
    title: "Option, Result & the ? operator",
    slug: { _type: "slug", current: "rust-option-result-question-mark" },
    description:
        "The Da Nang depot's nightly import read 4 812 scan lines, hit one weight typed as 12O0 with a letter O, called unwrap() and panicked. Nothing was imported, and the morning shift planned the trucks from yesterday's numbers. Learn how Rust represents a missing value (Option) and a failure with a reason (Result), how to handle them with match, if let and let-else, when unwrap and expect are acceptable, how the ? operator passes errors up, how ok_or and map_err convert between error types, how to write a small error enum with Display, and how main can return a Result.",
    estimatedTime: 24,

    scenario: {
        role: "Junior developer at Song Han Logistics, owner of the nightly scan-log import",
        problem:
            "Every night at 23:00 the import tool reads the day's scan log, one line per parcel, and loads the weights into the route planner. On Tuesday the log had 4 812 lines. Line 3 017 said 12O0 instead of 1200, because a scanner had been fixed by hand. The tool stopped with a panic message, imported nothing, and nobody noticed until the morning shift saw yesterday's figures in the planner.",
    },

    content: [
        h2("1. The incident"),
        p("The scan log is plain text: one parcel per line, three fields separated by commas, the parcel id, the delivery route and the weight in grams. The first Rust version of the import tool was a direct port of a Python script:"),
        code("rust", `
use std::io::Read;

fn main() {
    let mut log = String::new();
    std::io::stdin().read_to_string(&mut log).unwrap();

    let mut total_grams: u32 = 0;
    let mut parcels = 0;
    for line in log.lines() {
        let fields: Vec<&str> = line.split(',').collect();
        let grams: u32 = fields[2].parse().unwrap();
        total_grams += grams;
        parcels += 1;
    }
    println!("imported {parcels} parcels, {total_grams} g");
}`, "src/main.rs"),
        p("On Tuesday night a scanner whose keypad had been repaired sent `12O0`, with the letter O, as a weight. The cron job's log the next morning held this, and nothing else:"),
        code("text", `
thread 'main' (15237) panicked at src/main.rs:11:44:
called \`Result::unwrap()\` on an \`Err\` value: ParseIntError { kind: InvalidDigit }
note: run with \`RUST_BACKTRACE=1\` environment variable to display a backtrace`),
        bullets([
            "**One bad line out of 4 812 lost all 4 812.** The tool panicked before it printed or saved anything, so the 4 811 good lines were never imported.",
            "**The message says what, not where in the data.** `src/main.rs:11:44` is the `unwrap()` in the source. Which line of the log was bad, the message does not say. Someone had to search the file by hand.",
            "**The same tool was one blank line away from the same outage.** When the log ends with an empty line, `split(',')` gives one empty field, and `fields[2]` panics with `index out of bounds: the len is 1 but the index is 2`.",
        ]),
        p("The number in brackets after `'main'` is the thread id; you will see a different one on every run."),

        h2("2. Why parse() makes you choose"),
        p("Turning text into a number can fail, and Rust puts that into the type. `parse::<u32>()` does not return a `u32`; it returns a `Result<u32, ParseIntError>`, which is either `Ok(number)` or `Err(reason)`:"),
        code("rust", `
fn main() {
    println!("{:?}", "1250".parse::<u32>());
    println!("{:?}", "12O0".parse::<u32>());
    println!("{:?}", "".parse::<u32>());
    println!("{:?}", "-5".parse::<u32>());
    println!("{:?}", "99999999999".parse::<u32>());
    match "12O0".parse::<u32>() {
        Ok(g) => println!("{g} g"),
        Err(e) => println!("error: {e}"),
    }
    if let Err(e) = "".parse::<u32>() { println!("error: {e}"); }
    if let Err(e) = "99999999999".parse::<u32>() { println!("error: {e}"); }
}`, "src/main.rs"),
        code("text", `
Ok(1250)
Err(ParseIntError { kind: InvalidDigit })
Err(ParseIntError { kind: Empty })
Err(ParseIntError { kind: InvalidDigit })
Err(ParseIntError { kind: PosOverflow })
error: invalid digit found in string
error: cannot parse integer from empty string
error: number too large to fit in target type`),
        p("`{:?}` shows the debug form, meant for developers. `{}` (here `{e}`) shows the error's **message**, meant for people. `-5` is an invalid digit for an unsigned type, and 99 999 999 999 does not fit in a `u32` (lesson 1-1)."),
        p("`.unwrap()` means \"give me the `Ok` value, and if it is an `Err`, panic\". The original tool used it on data that comes from scanners, people and cables, which is exactly the data that will one day be wrong."),

        h2("3. Option and Result"),
        p("Rust has no `null`. A value that may be missing is an `Option<T>`, an enum with two variants, `Some(value)` and `None` (enums and `match` are from lesson 2-2). A value that may fail with a reason is a `Result<T, E>`, with `Ok(value)` and `Err(error)`. The standard library uses them everywhere:"),
        code("rust", `
fn main() {
    let routes = vec!["DN-07", "DN-03", "DN-11"];
    let first: Option<&&str> = routes.first();
    println!("{first:?}");
    println!("{:?}", routes.get(7));
    println!("{}", routes.get(7).unwrap_or(&"none"));
    println!("{}", "12O0".parse::<u32>().unwrap_or(0));
    println!("{}", "12O0".parse::<u32>().is_err());
    let missing: Option<u32> = None;
    println!("{:?}", missing.ok_or("no weight"));
    println!("{:?}", Some(1250).ok_or("no weight"));
    println!("{:?}", "1250".parse::<u32>().ok());
}`, "src/main.rs"),
        code("text", `
Some("DN-07")
None
none
0
true
Err("no weight")
Ok(1250)
Some(1250)`),
        bullets([
            "**`routes.get(7)`** returns `None` instead of panicking like `routes[7]`. Use `get` whenever the index comes from data.",
            "**`unwrap_or(default)`** gives the value or a fallback. Note the `0` on line 4: a garbled weight silently became 0 g. A default is right for a missing setting, wrong for a measurement.",
            "**`ok_or(error)`** turns an `Option` into a `Result` by supplying the reason that `None` did not have. **`.ok()`** goes the other way and throws the reason away.",
            "**`is_ok()` / `is_err()` / `is_some()` / `is_none()`** answer yes or no without taking the value out.",
        ]),
        image("result-paths", {
            alt: "Diagram: Option and Result, the value might not be there. Both are enums, and you cannot use the value inside until you say what happens in the other case. Option<T> means there may be no value, no reason needed: Some(value) or None, returned by routes.get(7), line.split_once(',') and strip_prefix. Result<T, E> means this can fail, and here is why: Ok(value) or Err(error), returned by parse::<u32>(), reading a file or a network call. Convert between them: option.ok_or(err) gives a Result, result.ok() gives an Option and drops the reason. What to do with the None or the Err, four boxes. Red, unwrap() or expect(): panic, the program stops and one bad line loses the batch; for tests, examples and values that cannot be missing unless the program itself is wrong. Green, match, if let or let-else: handle it here, reject the line, log it and carry on with the next one; where you know what the failure means for the user. Blue, value?: pass it up, return the Err or None to the caller right now, otherwise unwrap the Ok; the function must return Result or Option itself. Amber, unwrap_or(default): use a fallback value; fine for a missing setting, wrong for a weight, where 0 g hides the bad line. Bottom: change the error on the way up with raw.parse().map_err(|e| format!(\"bad weight '{raw}': {e}\"))?; map_err turns the library's error into your own message or enum, and the Ok value passes through untouched.",
            caption: "Every Option and Result forces a decision: panic, handle it here, pass it up, or fall back to a default.",
        }),

        h2("4. Handling it here: match, if let, let-else"),
        p("Three forms take the value out and make you write the other case. Here they are in one function that describes a scan line:"),
        code("rust", `
fn describe(line: &str) -> String {
    let Some((id, rest)) = line.split_once(',') else {
        return format!("'{line}': no comma");
    };
    if let Some(route) = rest.strip_suffix(",X") {
        return format!("{id} on {route} is cancelled");
    }
    match rest.split_once(',') {
        Some((route, grams)) => format!("{id} on {route}, {grams} g"),
        None => format!("{id}: weight missing"),
    }
}

fn main() {
    println!("{}", describe("SH10231,DN-07,1250"));
    println!("{}", describe("SH10232,DN-07,X"));
    println!("{}", describe("SH10233,DN-03"));
    println!("{}", describe("garbage"));
}`, "src/main.rs"),
        code("text", `
SH10231 on DN-07, 1250 g
SH10232 on DN-07 is cancelled
SH10233: weight missing
'garbage': no comma`),
        bullets([
            "**`match`** lists every case, and the compiler refuses to build if one is missing. Use it when both cases do real work.",
            "**`if let Some(x) = ...`** runs a block only for the case you care about; the other case simply skips the block.",
            "**`let ... else`** (let-else) is for \"I need this value to continue, otherwise leave\". The `else` block must leave the function (`return`, `continue`, `break` or a panic), so after it the value is simply there, without extra nesting. `split_once(',')` returns `Option<(&str, &str)>`, and the pattern takes the tuple apart in one step.",
        ]),

        h2("5. unwrap, expect and when they are fine"),
        p("A panic is not always wrong. It is the right reaction to a **bug in the program**, a state that cannot happen if the code is correct. It is the wrong reaction to **bad input**, which will happen. `expect` is `unwrap` with a message, so the panic at least says what was assumed:"),
        code("rust", `
fn main() {
    let raw = "12O0";
    let grams: u32 = raw.parse().expect("weight must be a whole number of grams");
    println!("{grams}");
}`, "src/main.rs"),
        code("text", `
thread 'main' (16710) panicked at src/main.rs:3:34:
weight must be a whole number of grams: ParseIntError { kind: InvalidDigit }`),
        bullets([
            "**Fine:** tests, short examples, and values the program itself guarantees, such as `\"30000\".parse::<u32>().expect(\"constant is a valid number\")` or reading a config file without which the service cannot start at all.",
            "**Not fine:** anything read from a file, a scanner, a user, the network or another service. One unusual line must not decide whether the other 4 811 are processed.",
            "**Prefer `expect` to `unwrap`** when you do panic: write the assumption that was broken, not the operation.",
        ]),

        h2("6. Passing errors up with ?"),
        p("Often the function that finds the problem is not the one that knows what to do about it. A small helper that reads a weight should not decide whether the whole batch stops. It should report the failure to its caller. The `?` operator does that in one character:"),
        code("rust", `
use std::num::ParseIntError;

fn weight_of(line: &str) -> Result<u32, ParseIntError> {
    let raw = line.rsplit(',').next().unwrap_or("");
    let grams = raw.trim().parse::<u32>()?; // Err? return it to the caller now
    Ok(grams)
}

fn route_of(line: &str) -> Option<&str> {
    let (_, rest) = line.split_once(',')?; // None? return None now
    let (route, _) = rest.split_once(',')?;
    Some(route)
}

fn main() {
    println!("{:?}", weight_of("SH10231,DN-07,1250"));
    println!("{:?}", weight_of("SH10233,DN-03,12O0"));
    println!("{:?}", route_of("SH10231,DN-07,1250"));
    println!("{:?}", route_of("SH10231"));
}`, "src/main.rs"),
        code("text", `
Ok(1250)
Err(ParseIntError { kind: InvalidDigit })
Some("DN-07")
None`),
        p("`expr?` means: if `expr` is `Ok(v)`, the whole expression is `v` and the function continues; if it is `Err(e)`, **return `Err(e)` from this function right now**. On an `Option`, `None` is returned the same way. That is why `?` only works inside a function that itself returns a `Result` (or an `Option`). In a `main` that returns nothing, the compiler says so:"),
        code("text", `
error[E0277]: the \`?\` operator can only be used in a function that returns \`Result\` or \`Option\` (or another type that implements \`FromResidual\`)
 --> src/main.rs:2:36
  |
1 | fn main() {
  | --------- this function should return \`Result\` or \`Option\` to accept \`?\`
2 |     let grams: u32 = "1250".parse()?;
  |                                    ^ cannot use the \`?\` operator in a function that returns \`()\``),
        h3("Changing the error on the way: ok_or and map_err"),
        p("`?` needs the error types to match the function's return type. When they do not, convert first. `ok_or` gives an `Option` an error, and `map_err` replaces the error inside a `Result`, leaving the `Ok` value alone:"),
        code("rust", `
fn weight_of(line: &str) -> Result<u32, String> {
    let raw = line.split(',').nth(2).ok_or("missing weight field")?;
    let grams: u32 = raw.parse().map_err(|e| format!("bad weight '{raw}': {e}"))?;
    Ok(grams)
}

fn main() {
    println!("{:?}", weight_of("SH10231,DN-07,1250"));
    println!("{:?}", weight_of("SH10233,DN-03"));
    println!("{:?}", weight_of("SH10234,DN-03,12O0"));
    println!("{}", weight_of("SH10234,DN-03,").unwrap_or(0));
}`, "src/main.rs"),
        code("text", `
Ok(1250)
Err("missing weight field")
Err("bad weight '12O0': invalid digit found in string")
0`),
        bullets([
            "`|e| format!(...)` is a **closure**, a small unnamed function: it receives the `ParseIntError` as `e` and returns the new error.",
            "`ok_or(\"missing weight field\")` makes a `Result<&str, &str>`, and `?` still works in a function returning `Result<u32, String>`: on the way out, `?` converts the error with `From`, and a `&str` converts into a `String`. That conversion step is all you need to know about `From` for now.",
            "The last line shows the trap from section 3 again: `unwrap_or(0)` hides a broken line behind a believable number.",
        ]),

        h2("7. Your own error type"),
        p("A `String` error is fine for a message, but the caller cannot tell the kinds of failure apart without parsing text. An **error enum** names every way a line can be wrong, carries the details, and implements `Display` for the message:"),
        code("rust", `
use std::fmt;

#[derive(Debug)]
enum ScanError {
    FieldCount(usize),
    UnknownRoute(String),
    BadWeight { raw: String, reason: String },
}

impl fmt::Display for ScanError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ScanError::FieldCount(n) => write!(f, "expected 3 fields, found {n}"),
            ScanError::UnknownRoute(r) => write!(f, "unknown route '{r}'"),
            ScanError::BadWeight { raw, reason } => write!(f, "bad weight '{raw}': {reason}"),
        }
    }
}

fn parse_weight(line: &str) -> Result<u32, ScanError> {
    let fields: Vec<&str> = line.split(',').map(|f| f.trim()).collect();
    if fields.len() != 3 {
        return Err(ScanError::FieldCount(fields.len()));
    }
    if !fields[1].starts_with("DN-") {
        return Err(ScanError::UnknownRoute(fields[1].to_string()));
    }
    let grams = fields[2].parse::<u32>().map_err(|e| ScanError::BadWeight {
        raw: fields[2].to_string(),
        reason: e.to_string(),
    })?;
    Ok(grams)
}

fn main() {
    for line in ["SH10231,DN-07,1250", "", "SH10233,HA-01,410", "SH10234,DN-03,12O0"] {
        match parse_weight(line) {
            Ok(g) => println!("ok: {g} g"),
            Err(e) => println!("rejected: {e}  (debug: {e:?})"),
        }
    }
}`, "src/main.rs"),
        code("text", `
ok: 1250 g
rejected: expected 3 fields, found 1  (debug: FieldCount(1))
rejected: unknown route 'HA-01'  (debug: UnknownRoute("HA-01"))
rejected: bad weight '12O0': invalid digit found in string  (debug: BadWeight { raw: "12O0", reason: "invalid digit found in string" })`),
        bullets([
            "**`impl fmt::Display for ScanError`** is what makes `{e}` work. You write one `fmt` method; `write!(f, ...)` works like `format!` but writes into the formatter. Lesson 4-1 explains traits such as `Display` in general.",
            "**`#[derive(Debug)]`** gives the `{:?}` form for free, handy in logs and tests.",
            "**Early `return Err(...)`** checks one rule at a time, in a fixed order, so every line gets exactly one, predictable error.",
            "The caller can now `match` on the variant, for example to count unknown routes separately from bad weights.",
        ]),
        callout("info", "Going further",
            "Larger programs implement std::error::Error for their error enums and add From conversions so that ? converts library errors automatically. The Rust Practical course covers error enums and From in depth; for one tool, an enum with Display is enough."),
        h3("main can return a Result"),
        code("rust", `
fn main() -> Result<(), String> {
    let grams: u32 = "1250".parse().map_err(|e| format!("{e}"))?;
    println!("first: {grams} g");
    let grams: u32 = "12O0".parse().map_err(|e| format!("bad weight: {e}"))?;
    println!("second: {grams} g");
    Ok(())
}`, "src/main.rs"),
        code("text", `
first: 1250 g
Error: "bad weight: invalid digit found in string"`),
        p("When `main` returns `Err`, Rust prints `Error:` followed by the error's **debug** form and exits with code 1 instead of 101. No panic, no backtrace hint. Use it for errors that really should stop the program, such as an unreadable input file; `Ok(())` at the end means success, with `()` as \"no value\"."),

        h2("8. Practice"),
        p("Rewrite the line parser of the import tool. Every line must end up either accepted or rejected with a message and its line number, and nothing may panic."),
        challenge("chal_coding_rsf_311", "Collect the trimmed fields into a Vec<&str> and check fields.len() first. Then check the id, then the route, each with an early return Err(...). For the weight, raw.parse::<u32>().map_err(|e| ScanError::BadWeight { raw: raw.to_string(), reason: e.to_string() })? gives you the number or leaves the function. The limit check comes last."),

        h2("9. The fix"),
        p("The import tool now treats every line on its own. A bad line is reported with its number and skipped; the good ones are imported; only a failure to read the input at all stops the program:"),
        code("rust", `
use std::io::Read;

fn weight_of(line: &str) -> Result<u32, String> {
    let fields: Vec<&str> = line.split(',').map(|f| f.trim()).collect();
    if fields.len() != 3 {
        return Err(format!("expected 3 fields, found {}", fields.len()));
    }
    let raw = fields[2];
    raw.parse().map_err(|e| format!("bad weight '{raw}': {e}"))
}

fn main() -> Result<(), std::io::Error> {
    let mut log = String::new();
    std::io::stdin().read_to_string(&mut log)?; // an unreadable input is still fatal

    let mut total_grams: u64 = 0;
    let mut parcels = 0;
    let mut rejected = Vec::new();
    for (i, line) in log.lines().enumerate() {
        if line.trim().is_empty() {
            continue; // a blank line is not an error
        }
        match weight_of(line) {
            Ok(grams) => {
                total_grams += u64::from(grams);
                parcels += 1;
            }
            Err(e) => rejected.push(format!("line {}: {e}", i + 1)),
        }
    }
    println!("imported {parcels} parcels, {total_grams} g");
    for r in &rejected {
        println!("rejected {r}");
    }
    Ok(())
}`, "src/main.rs"),
        p("With the Tuesday log shortened to six lines, including the bad weight, a blank line and a line with a missing field:"),
        code("text", `
imported 3 parcels, 2490 g
rejected line 3: bad weight '12O0': invalid digit found in string
rejected line 6: expected 3 fields, found 2`),
        numbered([
            "**No `unwrap` on data.** `weight_of` returns a `Result`, and the loop decides what a bad line means: report it, keep going.",
            "**Errors carry context.** The message names the field and the bad value, and the loop adds the line number, so the night shift can fix the scanner record in a minute.",
            "**`enumerate()`** gives `(index, line)` pairs; `i + 1` is the human line number, counting blank lines too.",
            "**`main` returns `Result`** for the one failure that really is fatal, reading the input. `?` replaces the `unwrap()` that was there.",
            "**The total is a `u64`.** `u32::MAX` grams is about 4 295 tonnes, which a busy sale week across all depots can pass; with `u64` the question never comes up (lesson 1-1).",
        ]),
        p("The team also added an alert: if more than 1% of the lines are rejected, the import still runs, but the on-call developer gets a message."),

        h2("10. Pitfalls"),
        bullets([
            "**`unwrap()` on input.** Every `unwrap` on parsed, read or received data is a future outage. Search for them before a release.",
            "**`unwrap_or(0)` for measurements.** A wrong number that looks normal is worse than an error. Defaults are for settings, not data.",
            "**Indexing with `fields[2]`** before checking `fields.len()`. Check the length, or use `get(2)` and handle `None`.",
            "**Losing the context.** `map_err(|_| \"bad line\")` throws away which value and why. Keep the raw value and `e.to_string()`.",
            "**`?` in a function that returns `()`.** Change the return type to `Result` (or `Option`) and return `Ok(...)` at the end.",
            "**`expect(\"failed\")`.** A message that repeats the operation helps nobody; write the assumption: `expect(\"config has a [depot] section\")`.",
            "**Converting errors to strings too early.** If the caller needs to react differently to different failures, give it an enum, not a `String`.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Functions that can fail return `Result<T, E>`; functions that may find nothing return `Option<T>`.",
            "No `unwrap` or `expect` on data from outside the program; `expect` messages state the broken assumption.",
            "Errors are handled where the decision is made (`match`, `if let`, let-else) and passed up with `?` everywhere else.",
            "`ok_or` and `map_err` add context: the bad value, the field, the line number.",
            "Error enums implement `Display` with messages a person can act on, and derive `Debug`.",
            "Batch jobs report bad records and process the good ones; only failures that make the whole job meaningless stop it.",
            "Tests include a blank line, a garbled value, a missing field and a value too large for its type.",
        ]),
    ],
});
