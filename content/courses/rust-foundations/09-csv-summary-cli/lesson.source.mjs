// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-rsf-4-2",
    title: "Mini project: a CSV summary CLI",
    slug: { _type: "slug", current: "rust-csv-summary-cli" },
    description:
        "The first Rust version of the depot's manifest summary crashed at 22:00 on a blank last line. After a one-line fix it ran, and reported 275005 VND of cash on delivery for a file that held 395000, plus a weight of 4.700000000000001 kg. Build the replacement step by step: read stdin, number the lines, skip the header and blank lines, parse each row into a struct with Result and clear messages, keep going after bad rows, group per route in a BTreeMap with integer grams and VND, and print a fixed report with every skipped line listed. Everything you learned in this course, in one small command-line tool.",
    estimatedTime: 35,

    scenario: {
        role: "Junior developer at Song Han Logistics, replacing the depot's Python manifest script with a Rust command-line tool",
        problem:
            "Every evening the dispatchers export the next day's manifest as a CSV, and a summary per route tells the drivers how much weight they carry and how much cash on delivery they must collect. The first Rust port panicked on the night it went live. After a quick fix it printed totals, but the cash total was 119995 VND short, and nobody could say which row was wrong.",
    },

    content: [
        h2("1. The incident"),
        p("The Python script had grown over five years. The first Rust port was a straight translation: read the file, skip the header, split each line on commas, add up two columns:"),
        code("rust", `
use std::io::Read;

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();

    let mut total_kg = 0.0;
    let mut total_cod = 0.0;
    for line in input.lines().skip(1) {           // skip the header
        let fields: Vec<&str> = line.split(',').collect();
        let weight_kg: f64 = fields[2].parse().unwrap();
        let cod_vnd: f64 = fields[3].parse().unwrap();
        total_kg += weight_kg;
        total_cod += cod_vnd;
    }
    println!("parcels weight: {total_kg} kg");
    println!("COD to collect: {total_cod} VND");
}`, "src/main.rs"),
        p("That evening's export, `manifest.csv`, looked like this. A dispatcher had fixed one weight by hand in a text editor and typed it the Vietnamese way, with a decimal comma, and the spreadsheet export ended with an empty line:"),
        code("text", `
parcel_id,route,weight_kg,cod_vnd
DN-07-0412,DN-07,1.1,185000
DN-07-0413,DN-07,2.2,0
DN-12-0101,DN-12,1,5,120000
DN-12-0102,DN-12,0.4,90000
`, "manifest.csv"),

        h2("2. Reproduce it"),
        p("The 22:00 run, `cargo run --release < manifest.csv`, stopped at once:"),
        code("text", `
thread 'main' (35329) panicked at src/main.rs:11:36:
index out of bounds: the len is 1 but the index is 2
note: run with \`RUST_BACKTRACE=1\` environment variable to display a backtrace`),
        p("The number after `'main'` is the thread id and differs on every run. The blank last line splits into one empty field, so `fields[2]` does not exist, and indexing past the end of a `Vec` panics. The on-call developer added `if line.is_empty() { continue; }` at the top of the loop. The program now finished:"),
        code("text", `
parcels weight: 4.700000000000001 kg
COD to collect: 275005 VND`),
        p("The real totals are 5.2 kg and 395 000 VND. Four separate bugs hide in eleven lines:"),
        bullets([
            "**No check of the field count.** `1,5` split into two fields, so the row `DN-12-0101,DN-12,1,5,120000` had five. The code read weight `1` and cash `5` from the wrong columns, and the 120 000 VND row silently became 5 VND.",
            "**`unwrap` on input data.** One bad row stops the whole summary, and the panic message names a line of **code**, not a line of the **file**.",
            "**`f64` for sums.** 0.1-style decimals have no exact binary form, so the total prints as `4.700000000000001`. Money stored as `f64` drifts the same way.",
            "**No list of rejected rows.** Even a correct tool must tell the dispatcher which line to fix.",
        ]),

        h2("3. What the tool must do"),
        p("Before writing code, the team wrote the behaviour down, in the order a line is processed:"),
        numbered([
            "Read the whole CSV from stdin, so it works with `< manifest.csv` and in a pipe.",
            "Number the lines from 1, the way an editor does, so error messages point at the file.",
            "Skip line 1 (the header) and blank lines.",
            "Parse each other line into a typed `Row`, or a message saying what is wrong with it.",
            "Add good rows to their route's totals; remember bad rows with their line number; never stop early.",
            "Print one line per route in sorted order, a total line, and the list of skipped rows.",
        ]),
        p("Weights are now exported in **grams** and cash in **đồng**, both whole numbers, so the sums can be exact `u64` integers. The format of the file is fixed at `parcel_id,route,weight_g,cod_vnd`."),
        image("csv-pipeline", {
            alt: "Diagram of the route-summary tool, where every line ends up in the report or in the error list, and there is no unwrap on input data. 1, read stdin with read_to_string into one String holding the whole CSV file. 2, number the lines with lines().enumerate(), line_no = index + 1; both backslash-r backslash-n and backslash-n line endings work. 3, skip line 1, the header, and blank lines, the cause of the panic in the incident. 4, parse_row(line) returns Result<Row, String>: it checks the field count and empty fields and parses the numbers with the question mark operator. From there, Ok(row) goes to 5, group per route in a BTreeMap<String, RouteTotals> with routes.entry(route).or_default(); grams and VND are integers, so sums are exact, and the BTreeMap keeps routes sorted: DN-07, DN-12, HA-03. Err(message) goes to errors, a Vec<String>, such as line 4: expected 4 fields, found 5, and the loop continues with the next line. Both feed 6, the report: one line per route, a total line, then every skipped row with its line number. On the side, not handled on purpose: quoted fields with commas inside, such as \"Hoi An, Quang Nam\"; the export never writes them, and a file that can contain them needs a real CSV parser, the csv crate.",
            caption: "Each line takes exactly one path: skipped, added to a route, or reported as an error.",
        }),

        h2("4. Step 1: read stdin and number the lines"),
        code("rust", `
let mut input = String::new();
std::io::stdin().read_to_string(&mut input).expect("stdin must be UTF-8 text");

for (index, line) in input.lines().enumerate() {
    let line_no = index + 1;                      // people count lines from 1
    if line_no == 1 || line.trim().is_empty() {
        continue;                                 // header and blank lines
    }
    // ... parse the line
}`),
        bullets([
            "**`read_to_string`** needs `use std::io::Read;` at the top of the file. It fails only if stdin is not valid UTF-8 or cannot be read; for a command-line tool, stopping with a clear `expect` message is fine there, because nothing useful can happen without input.",
            "**`lines()`** splits on `\\n` and also removes a `\\r` before it, so files saved on Windows work unchanged.",
            "**`enumerate()`** pairs every item with its index, starting at 0. `index + 1` is the line number a person sees in an editor.",
            "**`line.trim().is_empty()`** treats a line of spaces as blank too.",
        ]),

        h2("5. Step 2: parse a row into a struct, or say why not"),
        p("Each row becomes a `Row` with typed fields. Parsing returns `Result<Row, String>`: either a row, or a message for a person (lesson 3-1):"),
        code("rust", `
// One data row of the manifest CSV: parcel_id,route,weight_g,cod_vnd
struct Row {
    parcel_id: String,
    route: String,
    weight_g: u32,
    cod_vnd: u64,
}

// shortcut: plain split(','), no quoted fields; use the csv crate when files can contain quotes.
fn parse_row(line: &str) -> Result<Row, String> {
    let fields: Vec<&str> = line.split(',').map(|field| field.trim()).collect();
    if fields.len() != 4 {
        return Err(format!("expected 4 fields, found {}", fields.len()));
    }
    if fields[0].is_empty() || fields[1].is_empty() {
        return Err(String::from("parcel_id and route must not be empty"));
    }
    let weight_g: u32 = fields[2].parse().map_err(|_| format!("bad weight_g {:?}", fields[2]))?;
    let cod_vnd: u64 = fields[3].parse().map_err(|_| format!("bad cod_vnd {:?}", fields[3]))?;
    Ok(Row {
        parcel_id: fields[0].to_string(),
        route: fields[1].to_string(),
        weight_g,
        cod_vnd,
    })
}

fn main() {
    let lines = [
        "DN-07-0412,DN-07,1100,185000",
        "DN-12-0101,DN-12,1,5,120000",
        "HA-03-0007,HA-03,850,abc",
        "HA-03-0008, HA-03 , 3000 ,250000",
        ",DN-07,100,0",
        "DN-07-0420,DN-07,-5,0",
    ];
    for line in lines {
        match parse_row(line) {
            Ok(row) => println!("ok:  {} {} {} g {} VND", row.parcel_id, row.route, row.weight_g, row.cod_vnd),
            Err(message) => println!("err: {message}"),
        }
    }
}`, "src/main.rs"),
        code("text", `
ok:  DN-07-0412 DN-07 1100 g 185000 VND
err: expected 4 fields, found 5
err: bad cod_vnd "abc"
ok:  HA-03-0008 HA-03 3000 g 250000 VND
err: parcel_id and route must not be empty
err: bad weight_g "-5"`),
        bullets([
            "**`.map(|field| field.trim())`** applies `trim` to every piece. `|field| ...` is a **closure**, a small unnamed function; the next course, Practical Rust, covers closures and iterator chains in depth. `collect()` gathers the pieces into the `Vec<&str>` named in the annotation.",
            "**The field count is checked first.** This one line catches the decimal comma from the incident, which used to shift every column silently.",
            "**`parse()` returns a `Result`**. `map_err` replaces its technical error (`ParseIntError`) with a message that quotes the field, and `?` returns that message from `parse_row` at once.",
            "**`{:?}` on a `&str` prints it in quotes**, so an empty or space-only field is visible in the message: `bad weight_g \"\"`. Debug formatting is fine here: the reader is the dispatcher fixing a file, and the quotes help.",
            "**Unsigned types reject negative values for free.** `\"-5\"` does not parse as a `u32`, so a negative weight never enters the totals.",
            "The fields are `&str` slices that borrow from `line` (lesson 2-1). The `Row` must outlive the line, so `to_string()` makes owned `String`s for it.",
        ]),

        h2("6. Step 3: collect errors and keep going"),
        p("A bad row must not stop the summary. `match` on the result: a good row is used, a bad row becomes a message with its line number, and `continue` moves on. The same pattern handles a check that needs more than one row, such as a parcel listed twice:"),
        code("rust", `
let row = match parse_row(line) {
    Ok(row) => row,
    Err(message) => {
        errors.push(format!("line {line_no}: {message}"));
        continue;
    }
};
if !seen.insert(row.parcel_id.clone()) {          // HashSet::insert is false if already there
    errors.push(format!("line {line_no}: duplicate parcel_id {}", row.parcel_id));
    continue;
}`),
        p("`errors` is a `Vec<String>` and `seen` a `HashSet<String>` (lesson 3-2). `insert` returns `false` when the value was already in the set, which turns the duplicate check into one `if`."),

        h2("7. Step 4: group per route in a BTreeMap"),
        code("rust", `
#[derive(Default)]
struct RouteTotals {
    parcels: u32,
    weight_g: u64,
    cod_vnd: u64,
}

let mut routes: BTreeMap<String, RouteTotals> = BTreeMap::new();

let totals = routes.entry(row.route).or_default();
totals.parcels += 1;
totals.weight_g += u64::from(row.weight_g);
totals.cod_vnd += row.cod_vnd;`),
        bullets([
            "**`#[derive(Default)]`** writes `RouteTotals::default()` for you: every number starts at 0 (lesson 4-1 showed what derives do).",
            "**`entry(key).or_default()`** returns a mutable reference to the route's totals, inserting a default one the first time the route appears. One lookup, no `if contains_key`.",
            "**`BTreeMap` instead of `HashMap`**: it keeps its keys sorted, so the report lists `DN-07`, `DN-12`, `HA-03` in the same order every run. A `HashMap` would print them in a different order from run to run.",
            "**`u64` sums of `u32` weights**: `u64::from` widens each value, so a day of heavy parcels cannot overflow the total (lesson 1-1).",
        ]),

        h2("8. Step 5: the report, without floats"),
        p("Grams become kilograms only when printed. Integer division and remainder give exact digits, and `{:03}` pads the grams to three digits, so 3 050 g prints as `3.050 kg`:"),
        code("rust", `
fn kg(grams: u64) -> String {
    format!("{}.{:03} kg", grams / 1000, grams % 1000)
}`),
        p("Widths line the columns up: `{:<8}` pads on the right to 8 characters, `{:>12}` pads on the left to 12. They work here because the values are numbers and `String`s, which honour widths."),

        h2("9. The whole program"),
        code("rust", `
use std::collections::{BTreeMap, HashSet};
use std::io::Read;

// One data row of the manifest CSV: parcel_id,route,weight_g,cod_vnd
struct Row {
    parcel_id: String,
    route: String,
    weight_g: u32,
    cod_vnd: u64,
}

#[derive(Default)]
struct RouteTotals {
    parcels: u32,
    weight_g: u64,
    cod_vnd: u64,
}

// shortcut: plain split(','), no quoted fields; use the csv crate when files can contain quotes.
fn parse_row(line: &str) -> Result<Row, String> {
    let fields: Vec<&str> = line.split(',').map(|field| field.trim()).collect();
    if fields.len() != 4 {
        return Err(format!("expected 4 fields, found {}", fields.len()));
    }
    if fields[0].is_empty() || fields[1].is_empty() {
        return Err(String::from("parcel_id and route must not be empty"));
    }
    let weight_g: u32 = fields[2].parse().map_err(|_| format!("bad weight_g {:?}", fields[2]))?;
    let cod_vnd: u64 = fields[3].parse().map_err(|_| format!("bad cod_vnd {:?}", fields[3]))?;
    Ok(Row {
        parcel_id: fields[0].to_string(),
        route: fields[1].to_string(),
        weight_g,
        cod_vnd,
    })
}

fn kg(grams: u64) -> String {
    format!("{}.{:03} kg", grams / 1000, grams % 1000)
}

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).expect("stdin must be UTF-8 text");

    let mut routes: BTreeMap<String, RouteTotals> = BTreeMap::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut errors: Vec<String> = Vec::new();

    for (index, line) in input.lines().enumerate() {
        let line_no = index + 1;                      // people count lines from 1
        if line_no == 1 || line.trim().is_empty() {
            continue;                                 // header and blank lines
        }
        let row = match parse_row(line) {
            Ok(row) => row,
            Err(message) => {
                errors.push(format!("line {line_no}: {message}"));
                continue;
            }
        };
        if !seen.insert(row.parcel_id.clone()) {
            errors.push(format!("line {line_no}: duplicate parcel_id {}", row.parcel_id));
            continue;
        }
        let totals = routes.entry(row.route).or_default();
        totals.parcels += 1;
        totals.weight_g += u64::from(row.weight_g);
        totals.cod_vnd += row.cod_vnd;
    }

    println!("{:<8}{:>8}{:>12}{:>12}", "route", "parcels", "weight", "COD (VND)");
    let mut all = RouteTotals::default();
    for (route, t) in &routes {
        println!("{:<8}{:>8}{:>12}{:>12}", route, t.parcels, kg(t.weight_g), t.cod_vnd);
        all.parcels += t.parcels;
        all.weight_g += t.weight_g;
        all.cod_vnd += t.cod_vnd;
    }
    println!("{:<8}{:>8}{:>12}{:>12}", "total", all.parcels, kg(all.weight_g), all.cod_vnd);
    println!("{} row(s) skipped", errors.len());
    for error in &errors {
        println!("  {error}");
    }
}`, "src/main.rs"),
        p("Run it on the next evening's export, which has the same decimal-comma mistake, a typo in a cash field, a parcel listed twice, spaces around some fields and a blank last line:"),
        code("text", `
parcel_id,route,weight_g,cod_vnd
DN-07-0412,DN-07,1100,185000
DN-07-0413,DN-07,2200,0
DN-12-0101,DN-12,1,5,120000
DN-12-0102,DN-12,400,90000
HA-03-0007,HA-03,850,abc
DN-07-0412,DN-07,1100,185000
HA-03-0008, HA-03 , 3000 ,250000
`, "manifest.csv"),
        code("text", `
$ cargo run --release < manifest.csv
route    parcels      weight   COD (VND)
DN-07          2    3.300 kg      185000
DN-12          1    0.400 kg       90000
HA-03          1    3.000 kg      250000
total          4    6.700 kg      525000
3 row(s) skipped
  line 4: expected 4 fields, found 5
  line 6: bad cod_vnd "abc"
  line 7: duplicate parcel_id DN-07-0412`),
        callout("warning", "This is not a full CSV parser",
            "Real CSV allows quoted fields that contain commas, quotes and even line breaks, such as \"Hoi An, Quang Nam\". split on a comma cannot handle them. The depot's export never writes quotes, the tool says so in a shortcut comment, and the field-count check turns a surprise quote into a reported error instead of shifted columns. When a file can contain quoted fields, use the csv crate with Cargo instead of extending split."),

        h2("10. Practice"),
        p("The drivers' handhelds export a second file every evening: what actually happened to each parcel, with a `status` column. Write the parser and the per-route totals for it. The test runner around your two functions works exactly like the program above: it skips the header and blank lines, groups per route in a `BTreeMap` and lists every rejected line."),
        challenge("chal_coding_rsf_421", "Start from parse_row in section 5: there are now five fields, and the status column becomes an enum with a match that returns an error for anything except delivered and failed. In add, match on delivery.status to decide whether the cash is collected or still open."),

        h2("11. What changed since the incident"),
        numbered([
            "**Every line has exactly one outcome**: skipped (header, blank), added to a route, or reported with its line number. Nothing is dropped silently, and nothing stops the run.",
            "**The field count is checked before any field is read.** A decimal comma, a missing column or a stray quote is a message, not shifted data.",
            "**No `unwrap` and no indexing on unchecked input.** `fields[2]` is only read after `fields.len() == 4` is known.",
            "**Integers for quantities.** Grams and đồng are `u32`/`u64`, sums are exact, and kilograms exist only in the printed text.",
            "**Sorted, reproducible output.** `BTreeMap` gives the same report for the same file, which makes the output easy to compare and to test.",
            "**Types do the validation.** `u32` rejects negative weights, `Result` forces every caller to handle a bad row, and the `Row` struct means the rest of the program never sees raw text again.",
        ]),

        h2("12. Pitfalls"),
        bullets([
            "**`unwrap()` or `fields[i]` on input data.** One bad line kills the whole run, and the message points at your code instead of the file.",
            "**Not checking the field count.** Extra or missing commas shift columns silently; reading the wrong column usually still parses.",
            "**`f64` for sums of money or weights.** Store the smallest unit (đồng, grams) in integers and format at the end.",
            "**Counting lines from 0.** Editors start at 1; `enumerate()` starts at 0.",
            "**Forgetting `trim()`.** `\" 3000 \"` does not parse as a number, and `\" HA-03 \"` becomes a different route key than `\"HA-03\"`.",
            "**`HashMap` for a report.** Its iteration order changes between runs; use `BTreeMap` (or sort the keys) for output people compare.",
            "**`split(',')` on real-world CSV.** Fine for a fixed internal export, wrong for files that can contain quoted fields. Use the csv crate there.",
            "**Rejecting rows without saying why.** A count of bad rows is not enough; print the line number and the field.",
        ]),

        h2("13. Checklist"),
        bullets([
            "Input is read once from stdin and processed line by line with 1-based line numbers.",
            "Header and blank lines are skipped explicitly.",
            "Each row is parsed by one function that returns `Result<Row, String>` and checks the field count first.",
            "Error messages name the line and quote the bad field.",
            "Bad rows are collected; the run never stops on input data.",
            "Totals use integer types wide enough for the busiest day, and are grouped in a `BTreeMap`.",
            "The report has a fixed format, so it can be compared and tested.",
            "The limits of the parser (no quoted fields) are written next to the code.",
        ]),
    ],
});
