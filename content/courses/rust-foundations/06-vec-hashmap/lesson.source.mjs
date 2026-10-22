// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-rsf-3-2",
    title: "Vec & HashMap",
    slug: { _type: "slug", current: "rust-vec-hashmap" },
    description:
        "The Da Nang depot's daily route report listed the same routes with the same counts, but in a different order on every run, so the audit script that compares today's report with yesterday's flagged every single line as changed. Learn how a Vec grows, how to read it safely with get instead of an index that panics, how to change it in place with iter_mut, sort, dedup and retain, how a HashMap counts and groups with the entry API, why its iteration order is random, and when to use a BTreeMap or a sorted Vec to get output that is the same every day.",
    estimatedTime: 23,

    scenario: {
        role: "Junior developer at Song Han Logistics, maintaining the depot's daily reports",
        problem:
            "Every evening the depot prints the number of parcels per delivery route, and an audit script compares it line by line with the day before to spot unusual routes. Since the report was ported to Rust, the audit has flagged every line as changed every day. The counts were right. Only the order of the lines kept changing, from one run to the next, on the same data.",
    },

    content: [
        h2("1. The incident"),
        p("The report reads the scan log (one line per parcel: parcel id, route, weight) and counts the parcels per route in a `HashMap`, a table from a key (the route) to a value (the count):"),
        code("rust", `
use std::collections::HashMap;
use std::io::Read;

fn main() {
    let mut log = String::new();
    std::io::stdin().read_to_string(&mut log).unwrap();

    let mut per_route: HashMap<String, u32> = HashMap::new();
    for line in log.lines() {
        let route = line.split(',').nth(1).unwrap_or("?").to_string();
        *per_route.entry(route).or_insert(0) += 1;
    }
    for (route, count) in &per_route {
        println!("{route}: {count}");
    }
}`, "src/main.rs"),
        p("Run it twice on the same seven-line log, one second apart:"),
        code("text", `
$ ./route-report < scans.csv
DN-01: 1
DN-03: 2
DN-07: 3
DN-11: 1

$ ./route-report < scans.csv
DN-03: 2
DN-11: 1
DN-07: 3
DN-01: 1`),
        bullets([
            "**The numbers are identical; the order is not.** The audit compares lines in order, so to it, every route had changed.",
            "**It is not a bug in `HashMap`.** A `HashMap` promises fast lookups by key, not any order. Rust even picks a fresh random hashing key for every run, on purpose, so that an attacker cannot predict where keys land and slow the table down. The Python version had printed in insertion order, and nobody had written that requirement down.",
        ]),
        p("The same week, a second report crashed: it picked \"the 6th busiest route\" with `ranking[5]` on a quiet Sunday when only three routes ran:"),
        code("text", `
thread 'main' (30181) panicked at src/main.rs:5:25:
index out of bounds: the len is 3 but the index is 5`),
        p("The number after `'main'` is the thread id and changes on every run. Both bugs come from not knowing what a collection promises. This lesson goes through the two you will use most."),

        h2("2. Vec: a growable list"),
        p("A `Vec<T>` holds any number of values of one type `T`, next to each other in memory, in the order you put them in. `vec![...]` creates one with values; `Vec::new()` creates an empty one:"),
        code("rust", `
fn main() {
    let mut cages: Vec<u32> = Vec::new();
    cages.push(200);
    cages.push(140);
    cages.push(95);
    let mut routes = vec!["DN-07", "DN-03", "DN-11", "DN-03"];

    println!("{} cages, first {:?}, last {:?}", cages.len(), cages.first(), cages.last());
    println!("{}", cages[1]);                  // panics if out of range
    println!("{:?} {:?}", cages.get(1), cages.get(9));
    println!("{:?}", cages.pop());              // Some(95), removes it
    println!("{cages:?}");

    for c in cages.iter_mut() {
        *c += 10;                              // change each element in place
    }
    let total: u32 = cages.iter().sum();
    println!("{cages:?} total {total}");

    routes.sort();
    println!("{routes:?}");
    routes.dedup();                            // removes ADJACENT duplicates
    println!("{routes:?}");
    routes.retain(|r| *r != "DN-11");          // keep only what passes the test
    println!("{routes:?} contains DN-07: {}", routes.contains(&"DN-07"));
}`, "src/main.rs"),
        code("text", `
3 cages, first Some(200), last Some(95)
140
Some(140) None
Some(95)
[200, 140]
[210, 150] total 360
["DN-03", "DN-03", "DN-07", "DN-11"]
["DN-03", "DN-07", "DN-11"]
["DN-03", "DN-07"] contains DN-07: true`),
        bullets([
            "**Indexes start at 0** and are `usize`. `cages[1]` is the second element.",
            "**`v[i]` panics** when `i >= v.len()`; **`v.get(i)`** returns `Option<&T>`, `None` when out of range. Use `[i]` only when the index is correct by construction (for example `0..v.len()`), and `get` whenever it comes from data, a user or a calculation.",
            "**`first()`, `last()` and `pop()`** return `Option` too: an empty `Vec` has no first element.",
            "**`iter()`** lends you each element to read, **`iter_mut()`** lends each one to change (`*c` is the element behind the reference, lesson 2-1), and **`into_iter()`** (what `for x in v` uses) gives the elements away and consumes the `Vec` (lesson 1-2).",
            "**`sort()`** orders the elements; **`retain(|r| ...)`** keeps the elements for which the closure returns `true`, in place.",
        ]),
        h3("dedup only removes neighbours"),
        p("`dedup` is cheap because it only compares each element with the one right before it. On unsorted data it misses duplicates that are far apart:"),
        code("rust", `
fn main() {
    let mut scans = vec!["SH3", "SH1", "SH3", "SH2", "SH1"];
    let mut copy = scans.clone();
    copy.dedup();
    println!("{copy:?}");
    scans.sort();
    scans.dedup();
    println!("{scans:?}");
}`, "src/main.rs"),
        code("text", `
["SH3", "SH1", "SH3", "SH2", "SH1"]
["SH1", "SH2", "SH3"]`),
        p("Sort first, then `dedup`, and every duplicate is next to its twin."),

        h2("3. HashMap: look things up by key"),
        p("A `HashMap<K, V>` stores pairs of a key and a value and finds a value by its key in about the same time, whether it holds ten entries or ten million. It lives in `std::collections`, so it needs a `use`:"),
        code("rust", `
use std::collections::{BTreeMap, HashMap};

fn main() {
    let mut stock: HashMap<String, u32> = HashMap::new();
    stock.insert("DN-07".to_string(), 3);
    stock.insert("DN-03".to_string(), 2);
    let old = stock.insert("DN-07".to_string(), 5);   // replaces, returns the old value
    println!("{old:?} {:?} {:?}", stock.get("DN-07"), stock.get("DN-99"));
    println!("{}", stock.contains_key("DN-03"));

    *stock.entry("DN-11".to_string()).or_insert(0) += 1;   // new key: start at 0
    *stock.entry("DN-07".to_string()).or_insert(0) += 1;   // existing key: 5 -> 6
    stock.entry("DN-03".to_string()).and_modify(|n| *n *= 10).or_insert(1);
    println!("{:?} {:?} {:?}", stock.get("DN-11"), stock.get("DN-07"), stock.get("DN-03"));
    println!("{:?}", stock.remove("DN-11"));

    let mut by_route: HashMap<&str, Vec<&str>> = HashMap::new();
    for (route, parcel) in [("DN-07", "SH1"), ("DN-03", "SH2"), ("DN-07", "SH3")] {
        by_route.entry(route).or_default().push(parcel);
    }
    println!("{:?}", by_route["DN-07"]);

    let sorted: BTreeMap<&String, &u32> = stock.iter().collect();
    println!("{sorted:?}");
}`, "src/main.rs"),
        code("text", `
Some(3) Some(5) None
true
Some(1) Some(6) Some(20)
Some(1)
["SH1", "SH3"]
{"DN-03": 20, "DN-07": 6}`),
        bullets([
            "**`insert`** adds or replaces, and returns the old value as an `Option`. **`get`** returns `Option<&V>`: a key that is not there is `None`, not a crash. `map[key]` exists too and panics on a missing key, like `v[i]`.",
            "**`entry(key)`** looks the key up once and gives you its slot. **`.or_insert(0)`** puts `0` there if the key is new, and returns a mutable reference to the value either way, so `*... += 1` counts. That one line replaces \"if the key exists add 1, else insert 1\".",
            "**`.and_modify(|n| ...)`** changes an existing value; chained with `or_insert`, it covers both cases explicitly.",
            "**`.or_default()`** inserts the type's default value (`0` for numbers, an empty `Vec` for vectors). `entry(route).or_default().push(parcel)` is the standard way to **group** things by a key.",
            "**Keys are owned `String`s** in `stock`, so `entry` needs a `String` (`.to_string()`), while `get` accepts a plain `\"DN-07\"`.",
        ]),
        h3("Iteration order is not a feature"),
        p("`for (k, v) in &map` visits the entries in the order the hash table stores them. That order depends on the hash of every key and on a random seed chosen when the program starts, so it differs between runs and changes when entries are added. Anything that **leaves** your program, a report, a file, a JSON response, test output, needs an order you chose. There are two standard ways."),
        image("map-order", {
            alt: "Diagram: same data, three containers, which order do you get? Counts per route from one scan log: DN-07 = 3, DN-03 = 2, DN-01 = 1, DN-11 = 1. Left, red, HashMap<String, u32>, where the order is where the hashes land: run 1 prints DN-01: 1, DN-03: 2, DN-07: 3, DN-11: 1; run 2 prints DN-03: 2, DN-11: 1, DN-07: 3, DN-01: 1. Fast lookups by key, iteration order is random per run, never print it as is. Middle, green, BTreeMap<String, u32>, where the order is the keys sorted: every run prints DN-01: 1, DN-03: 2, DN-07: 3, DN-11: 1. Same API as HashMap (insert, get, entry), use it when the output should be A-Z by key. Right, blue, a Vec of (&str, u32) pairs plus sort_by, where the order is the rule you write: every run prints DN-07: 3, DN-03: 2, DN-01: 1, DN-11: 1. Count first, then copy into a Vec and sort by count, with the name as the tie-breaker. Bottom, the sort rule for the report: report.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0))). b.1.cmp(&a.1) compares counts, largest first, because b before a reverses the order; .then(a.0.cmp(&b.0)) orders equal counts by route A-Z.",
            caption: "A HashMap is for finding things. For output, pick an order: a BTreeMap for A-Z by key, or a sorted Vec for any rule you like.",
        }),

        h2("4. BTreeMap: sorted by key"),
        p("`BTreeMap` has the same methods as `HashMap` (`insert`, `get`, `entry`, `remove`), but it keeps its keys sorted, so iterating it always goes from the smallest key to the largest. Lookups are a little slower (it compares keys instead of hashing them), which almost never matters for a report:"),
        code("rust", `
use std::collections::BTreeMap;

fn main() {
    let mut counts: BTreeMap<&str, u32> = BTreeMap::new();
    for r in ["DN-07", "DN-03", "DN-07", "DN-11", "DN-01"] {
        *counts.entry(r).or_insert(0) += 1;
    }
    for (route, n) in &counts {
        println!("{route}: {n}");
    }
}`, "src/main.rs"),
        code("text", `
DN-01: 1
DN-03: 1
DN-07: 2
DN-11: 1`),
        p("Keys sort with their type's natural order: numbers by value, strings character by character. `\"DN-10\"` therefore comes before `\"DN-9\"`, which is one reason the depot pads route numbers to two digits."),

        h2("5. Sorting by your own rule"),
        p("The audit wants the busiest routes first. That is not an order of the keys, so count in a map, copy the pairs into a `Vec`, and sort it with `sort_by`, which takes a closure that compares two elements:"),
        code("rust", `
use std::collections::HashMap;

fn main() {
    let mut counts: HashMap<&str, u32> = HashMap::new();
    for r in ["DN-07", "DN-03", "DN-07", "DN-11", "DN-03", "DN-01", "DN-07"] {
        *counts.entry(r).or_insert(0) += 1;
    }
    let mut ranking: Vec<(&str, u32)> = counts.into_iter().collect();
    ranking.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
    println!("{ranking:?}");
    let mut by_name = ranking.clone();
    by_name.sort_by_key(|&(route, _)| route);
    println!("{by_name:?}");
}`, "src/main.rs"),
        code("text", `
[("DN-07", 3), ("DN-03", 2), ("DN-01", 1), ("DN-11", 1)]
[("DN-01", 1), ("DN-03", 2), ("DN-07", 3), ("DN-11", 1)]`),
        bullets([
            "**`a.cmp(&b)`** returns an `Ordering`: `Less`, `Equal` or `Greater`. `sort_by` puts `a` first when the closure returns `Less`.",
            "**`b.1.cmp(&a.1)`** swaps the sides, which reverses the order: largest count first. `.1` is the second element of the tuple, `.0` the first.",
            "**`.then(...)`** is only used when the first comparison says `Equal`. Without a tie-breaker, DN-01 and DN-11 (both 1) would come out in whatever order the `HashMap` handed them over, and the random order is back.",
            "**`counts.into_iter().collect()`** turns the map into a `Vec` of `(key, value)` pairs and consumes the map. **`sort_by_key`** is the short form when you sort by one field.",
        ]),
        callout("tip", "Every sort that feeds output needs a total order",
            "Ask: if two elements are equal on everything I compare, can they still be different? If yes, add another comparison with .then(...), usually the name or id, until the answer is no. Then the output is the same on every run and every machine."),

        h2("6. Practice"),
        p("Build the report the audit can trust: group the scans by route without double reads, rank the routes, and take the top `k` without panicking on a quiet day."),
        challenge("chal_coding_rsf_321", "group_by_route: groups.entry(route.clone()).or_default().push(parcel.clone()), then sort and dedup every Vec with values_mut(). ranking: map each (route, ids) to (route.clone(), ids.len()), collect, then sort_by count descending with the route as tie-breaker. top: slice up to k.min(ranking.len())."),

        h2("7. The fix"),
        p("The report keeps the `HashMap` for counting, which is what it is good at, and sorts before printing:"),
        code("rust", `
use std::collections::HashMap;
use std::io::Read;

fn main() {
    let mut log = String::new();
    std::io::stdin().read_to_string(&mut log).unwrap();

    let mut per_route: HashMap<String, u32> = HashMap::new();
    for line in log.lines() {
        let Some(route) = line.split(',').nth(1) else { continue };
        *per_route.entry(route.to_string()).or_insert(0) += 1;
    }

    let mut report: Vec<(&String, &u32)> = per_route.iter().collect();
    report.sort_by(|a, b| b.1.cmp(a.1).then(a.0.cmp(b.0))); // busiest first, then A-Z
    for (route, count) in &report {
        println!("{route}: {count}");
    }
}`, "src/main.rs"),
        code("text", `
DN-07: 3
DN-03: 2
DN-01: 1
DN-11: 1`),
        numbered([
            "**Count in a `HashMap`, present from a sorted `Vec`.** Each container does the job it is designed for.",
            "**The sort has a tie-breaker**, so the output is identical on every run, which is what the audit compares.",
            "**`per_route.iter()`** lends the entries (`&String`, `&u32`) to the `Vec` instead of copying them; the map still owns the data.",
            "**A line without a route is skipped** with let-else (lesson 3-1) instead of being counted under a `\"?\"` route.",
            "**The \"6th busiest route\" report** now uses `ranking.get(5)` and prints \"fewer than 6 routes today\" on `None`.",
        ]),
        p("The audit also got a regression test: run the report twice on the same input and compare the outputs byte for byte."),

        h2("8. Pitfalls"),
        bullets([
            "**Printing a `HashMap` (or `HashSet`) directly.** The order changes between runs. Sort, or use `BTreeMap`.",
            "**Sorting without a tie-breaker.** Equal elements keep the order they arrived in, which may be the random map order.",
            "**`v[i]` with an index from data.** Use `v.get(i)`; slice with `&v[..k.min(v.len())]` instead of `&v[..k]`.",
            "**`dedup` on unsorted data.** It only removes adjacent duplicates.",
            "**`get` then `insert` to count.** Two lookups and more code than `*map.entry(k).or_insert(0) += 1`.",
            "**`map[key]` for a key that may be missing.** It panics; use `get`.",
            "**Expecting `\"DN-10\" < \"DN-9\"` to be false.** Strings compare character by character, so `'1' < '9'` decides. Pad numbers or sort by the parsed number.",
            "**Sorting the map instead of the output.** A `HashMap` cannot be sorted; copy its entries into a `Vec` first.",
        ]),

        h2("9. Checklist"),
        bullets([
            "Lists are `Vec`s; lookups by key are `HashMap`s; output sorted by key comes from a `BTreeMap` or a sorted `Vec`.",
            "Every index that comes from data goes through `get` and handles `None`.",
            "Counting and grouping use `entry(...).or_insert(...)` / `or_default()`.",
            "Every sort that feeds output compares enough fields to be a total order.",
            "Duplicates are removed with `sort` then `dedup` (or by a set).",
            "Reports are tested by running them twice and comparing the output.",
        ]),
    ],
});
