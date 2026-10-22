// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-rsf-3-3",
    title: "Strings: String, &str & UTF-8",
    slug: { _type: "slug", current: "rust-strings-utf8" },
    description:
        "The depot's new label printer service passed every test with addresses like 45 Bach Dang, then crashed on its first real morning with \"byte index 20 is not a char boundary\" on 15 Lý Thường Kiệt, Hội An. Learn the difference between String and &str, why len() counts bytes and a Vietnamese letter can take 2 or 3 of them, why you cannot index a string by position, how to count, take and pad by characters with chars(), char_indices() and format!, and the everyday string tools: trim, split, contains, replace, to_uppercase, push_str, + and format!, and parse.",
    estimatedTime: 22,

    scenario: {
        role: "Junior developer at Song Han Logistics, porting the label printer service to Rust",
        problem:
            "Each parcel label has room for 20 characters of street address. The Rust port cut longer addresses to 20 and passed all tests, which used addresses without diacritics. On the first morning in production the service crashed on the 31st parcel, a delivery to 15 Lý Thường Kiệt in Hội An, and the printer queue stopped for the whole depot until someone restarted it.",
    },

    content: [
        h2("1. The incident"),
        p("A shipping label has a fixed-width line for the street address, so the label service shortens long addresses. The Rust version looked like this:"),
        code("rust", `
fn label_address(address: &str) -> &str {
    if address.len() > 20 { &address[..20] } else { address }
}

fn main() {
    for address in ["45 Bach Dang, Hai Chau, Da Nang", "7 Tran Phu", "15 Lý Thường Kiệt, Hội An"] {
        println!("[{}]", label_address(address));
    }
}`, "src/main.rs"),
        code("text", `
[45 Bach Dang, Hai Ch]
[7 Tran Phu]

thread 'main' (42507) panicked at src/main.rs:2:37:
byte index 20 is not a char boundary; it is inside 'ệ' (bytes 19..22) of \`15 Lý Thường Kiệt, Hội An\`
note: run with \`RUST_BACKTRACE=1\` environment variable to display a backtrace`),
        bullets([
            "**The tests used ASCII addresses** (no diacritics), where every character is one byte, so the code was right by accident.",
            "**`address.len()` is a number of bytes**, and `&address[..20]` cuts after byte 20. In `Kiệt`, the letter `ệ` takes three bytes, 19, 20 and 21, and cutting after byte 20 would leave half a letter. Rust refuses to make a string that is not valid UTF-8, so it panics instead.",
            "**The panic message is precise**: the byte index, the character it fell into, that character's byte range, and the whole string. The number after `'main'` is the thread id and changes on every run.",
        ]),
        p("In Python 3, `address[:20]` counts characters, which is why the old script never had the problem. Rust makes you choose between bytes and characters, and this lesson is about making that choice on purpose."),

        h2("2. String and &str"),
        p("Rust has two main string types, and you have been using both since lesson 1-1:"),
        bullets([
            "**`String`** owns its text, on the heap, and can grow: `String::from(\"...\")`, `\"...\".to_string()`, `format!(...)`, and everything read from a file or stdin. When the `String` goes out of scope, the text is freed (lesson 1-2).",
            "**`&str`** (a \"string slice\") borrows text that someone else owns: a string literal built into the program, or a part of a `String` (lesson 2-1). It cannot grow.",
        ]),
        code("rust", `
fn main() {
    let route: &str = "DN-07";                   // &str: borrowed text, here built into the program
    let mut label = String::from("Hội An hub");  // String: owned, growable text
    label.push_str(" / ");
    label.push_str(route);
    label.push('!');
    println!("{label} ({} bytes)", label.len());

    let name = "Nguyễn Văn An";
    println!("{} bytes, {} chars", name.len(), name.chars().count());
    println!("{}", name.to_uppercase());
    println!("{:?}", name.chars().next());
    for (i, c) in "Hội".char_indices() {
        println!("byte {i}: {c}");
    }
    let first_six: String = name.chars().take(6).collect();
    println!("{first_six}");
    println!("{}", name.is_char_boundary(6));
}`, "src/main.rs"),
        code("text", `
Hội An hub / DN-07! (21 bytes)
16 bytes, 13 chars
NGUYỄN VĂN AN
Some('N')
byte 0: H
byte 1: ộ
byte 4: i
Nguyễn
false`),
        bullets([
            "**`push_str(&str)`** appends text, **`push(char)`** appends one character. Both need a `mut String`.",
            "**Functions should take `&str`** when they only read text, as `label_address` does. A `&String` turns into a `&str` automatically, so the function accepts both.",
            "**`to_uppercase()`** knows Unicode, so `ễ` becomes `Ễ`; it returns a new `String`.",
            "**`chars()`** walks the text one character (one Unicode scalar value, a `char`) at a time; **`char_indices()`** also gives the byte where each character starts. `ộ` starts at byte 1 and `i` at byte 4, so `ộ` is bytes 1, 2 and 3.",
            "**`is_char_boundary(i)`** says whether byte `i` is the start of a character (or the end of the string). Byte 6 of `Nguyễn` is inside `ễ`.",
        ]),

        h2("3. UTF-8: why one letter can be three bytes"),
        p("Rust strings are always **UTF-8**, the encoding used by almost every file, web page and API today. UTF-8 stores each character in 1 to 4 bytes: the 128 ASCII characters (English letters, digits, punctuation) take one byte, `à`, `Đ` or `ă` take two, most Vietnamese letters with two marks, such as `ộ`, `ễ` or `ẵ`, take three, and many emoji take four. So for text in Vietnamese, the number of bytes and the number of characters are different, and a byte position can land in the middle of a letter:"),
        image("utf8-bytes", {
            alt: "Diagram of the string Hội An in memory: 6 characters, 8 bytes. A Rust string is UTF-8; ASCII letters take 1 byte, Vietnamese letters with diacritics take 2 or 3. The characters H, ộ, i, space, A, n sit above their bytes: H is 48, ộ is the three bytes E1 BB 99, i is 69, space is 20, A is 41, n is 6E. Byte indexes run from 0 to 8; 0, 1, 4, 5, 6, 7 and 8 are char boundaries, while 2 and 3 are inside ộ. chars().count() is 6 and len() is 8. A slice may only start or end on a boundary. Left, red, tools that count or cut bytes: &s[0..4] gives Hộ, fine because 4 is a boundary; &s[0..2] panics with byte index 2 is not a char boundary; s.len() is 8, right for buffers and limits in bytes, wrong for column widths; s[0] does not compile, error E0277. Every test passes on ASCII text, where bytes and characters happen to be the same. Right, green, tools that count or cut characters: s.chars().count() is 6; s.chars().take(2) gives Hộ after collect; s.char_indices() gives (0, H), (1, ộ), (4, i) and so on; format with {:<10} pads to 10 characters; format with {:.2} keeps at most 2 characters. Use these for anything a person reads: labels, columns, previews, first n letters.",
            caption: "len() and [a..b] work in bytes; chars(), char_indices() and format! widths work in characters.",
        }),
        p("That is also why Rust does not let you write `s[0]`. On a byte array, \"element 0\" is clear; on UTF-8 text it is not, so the compiler stops you and points to the alternatives:"),
        code("text", `
error[E0277]: the type \`str\` cannot be indexed by \`{integer}\`
 --> src/main.rs:3:15
  |
3 |     let c = s[0];
  |               ^ string indices are ranges of \`usize\`
  |
  = help: the trait \`SliceIndex<str>\` is not implemented for \`{integer}\`
  = note: you can use \`.chars().nth()\` or \`.bytes().nth()\``),
        p("Ranges such as `&s[a..b]` are allowed, because they are the cheap, byte-based way to take part of a string. They are safe whenever `a` and `b` come from the string itself: from `find`, `char_indices` or `split_once`. They are the incident whenever they come from a fixed number such as 20."),
        callout("info", "A character is not always one letter on screen",
            "chars() yields Unicode scalar values. Text typed on most keyboards stores ệ as one precomposed character, but some systems (macOS file names, some web forms) send the decomposed form: e followed by two combining marks, three chars for one visible letter. If your input can mix both forms, normalise it first; the unicode-normalization crate does that. For labels from the depot's own systems, chars() is the right unit."),

        h2("4. Everyday string tools"),
        p("Most text processing is trimming, splitting, checking and building. All of these work on `&str` and are safe for any UTF-8 text:"),
        code("rust", `
fn main() {
    let raw = "  sh10231 ; DN-07 ; Lê Thị Hoa  ";
    let fields: Vec<&str> = raw.split(';').map(|f| f.trim()).collect();
    println!("{fields:?}");
    println!("{}", fields[0].to_uppercase());
    println!("{} {}", fields[1].starts_with("DN-"), fields[2].contains("Thị"));
    println!("{}", fields[2].replace("Thị", "T."));
    println!("{:?}", "DN-07".split_once('-'));
    let n: u32 = "07".parse().unwrap();
    println!("{n}");

    let city = String::from("Hội An");
    let hub = city + " hub";              // city is moved into hub
    let route = String::from("DN-07");
    let line = format!("{hub} <- {route} ({} chars)", route.chars().count());
    println!("{line}");

    println!("[{:<10}]", "Hội An");       // pad to 10 characters
    println!("[{:>10}]", "Da Nang");
    println!("[{:^9}]", "DN-07");
    println!("[{:.6}]", "Nguyễn Văn An"); // at most 6 characters
    let pad = 10 - "Hội An".len();
    println!("[Hội An{}]", " ".repeat(pad)); // len() counts bytes: one space short
}`, "src/main.rs"),
        code("text", `
["sh10231", "DN-07", "Lê Thị Hoa"]
SH10231
true true
Lê T. Hoa
Some(("DN", "07"))
7
Hội An hub <- DN-07 (5 chars)
[Hội An    ]
[   Da Nang]
[  DN-07  ]
[Nguyễn]
[Hội An  ]`),
        bullets([
            "**`trim()`** removes whitespace at both ends and returns a `&str` into the same text, no copy. `split(';')` gives the parts between separators; `split_whitespace()` splits on any run of spaces.",
            "**`starts_with`, `ends_with`, `contains`, `find`** check for text; **`replace`** returns a new `String`.",
            "**`parse::<T>()`** turns text into a number (lesson 3-1: it returns a `Result`).",
            "**`format!`** builds a `String` exactly like `println!` prints. The width `{:<10}` (left), `{:>10}` (right), `{:^9}` (centre) **counts characters**, and the precision `{:.6}` keeps **at most 6 characters**. Both are safe for Vietnamese text. A width can also come from a constant: `{name:<WIDTH$}`.",
            "**Manual padding with `len()`** is the classic bug: `10 - \"Hội An\".len()` is 2, because the text has 8 bytes, so the column is two spaces short (and with a longer name the subtraction underflows).",
        ]),
        h3("+ and format!"),
        p("`a + b` on strings takes the `String` on the left **by value**, appends a `&str`, and returns it. `city` above is moved into `hub` and cannot be used afterwards. The right side must be a `&str`, so two `String`s do not add:"),
        code("text", `
error[E0308]: mismatched types
 --> src/main.rs:4:17
  |
4 |     let c = a + b;
  |                 ^ expected \`&str\`, found \`String\`
  |
help: consider borrowing here
  |
4 |     let c = a + &b;
  |                 +`),
        p("`a + &b` works, but for anything with more than two pieces, `format!(\"{a}{b}\")` is easier to read, does not move anything, and handles numbers too."),

        h2("5. Practice"),
        p("First, check that you can tell bytes from characters and predict which string operations compile."),
        challenge("chal_quiz_rsf_331"),
        p("Then fix the label printer itself. Its tests include the English addresses it was written for and the Vietnamese ones it met in production."),
        challenge("chal_fix_rsf_332", "Every place that uses len() or a byte range to mean characters is a bug. Count with chars().count(), cut with chars().take(n).collect::<String>(), and let format! pad: format!(\"{upper:<NAME_WIDTH$}\") pads to NAME_WIDTH characters and leaves a longer name whole."),

        h2("6. The fix"),
        p("The label service now counts and cuts characters, and marks a shortened address with `…` so the courier knows to look at the full address in the app:"),
        code("rust", `
fn label_address(address: &str, max: usize) -> String {
    if address.chars().count() <= max {
        return address.to_string();
    }
    let mut cut: String = address.chars().take(max - 1).collect();
    cut.push('…');
    cut
}

fn first_chars(s: &str, n: usize) -> &str {
    match s.char_indices().nth(n) {
        Some((byte, _)) => &s[..byte], // byte where character n starts: always a boundary
        None => s,                     // fewer than n characters: the whole string
    }
}

fn main() {
    for address in ["45 Bach Dang, Hai Chau, Da Nang", "7 Tran Phu", "15 Lý Thường Kiệt, Hội An"] {
        println!("[{}]", label_address(address, 20));
    }
    println!("[{}] [{}]", first_chars("15 Lý Thường Kiệt, Hội An", 20), first_chars("Huế", 20));
}`, "src/main.rs"),
        code("text", `
[45 Bach Dang, Hai C…]
[7 Tran Phu]
[15 Lý Thường Kiệt, …]
[15 Lý Thường Kiệt, H] [Huế]`),
        numbered([
            "**Count characters to decide.** `chars().count()` answers \"does it fit on the label?\" for any text.",
            "**Cut characters, not bytes.** `chars().take(max - 1).collect()` builds a new `String` from whole characters, then `push('…')` adds the marker, so the result is never longer than `max` characters.",
            "**When you need a `&str` without copying,** `first_chars` finds the byte where character `n` starts with `char_indices().nth(n)` and slices there. Slicing at a position that came from the string itself is always safe.",
            "**The tests now include Vietnamese addresses**: one with a 3-byte letter right at the cut, one that fits in characters but not in bytes, and one shorter than the limit.",
        ]),
        p("`max - 1` assumes `max` is at least 1; the label service passes a constant, 20. A helper that takes `max` from a user would check it first (lesson 1-1)."),

        h2("7. Pitfalls"),
        bullets([
            "**`len()` for widths, limits or previews meant for people.** It counts bytes. Use `chars().count()`.",
            "**`&s[..n]` with a fixed `n`.** Panics as soon as `n` falls inside a multi-byte letter. Cut with `chars().take(n)`, `char_indices`, or `format!(\"{:.n$}\", s)`.",
            "**Tests with ASCII only.** Bytes and characters are the same there, so the bug hides. Every text test needs at least one Vietnamese string with diacritics.",
            "**Manual padding with `\" \".repeat(width - s.len())`.** Wrong width for non-ASCII text, and an underflow when the text is longer than the width. Use `format!(\"{s:<width$}\")`.",
            "**`String + String`.** Write `a + &b`, or better `format!(\"{a}{b}\")`.",
            "**Taking `&String` or `String` as a parameter just to read it.** Take `&str`; callers can pass either.",
            "**Forgetting that `+` moves the left `String`.** Use `format!` when you still need the parts afterwards.",
            "**Comparing user input without `trim()`.** `\"DN-07 \" == \"DN-07\"` is `false`.",
        ]),

        h2("8. Checklist"),
        bullets([
            "Functions that read text take `&str`; functions that build text return `String`.",
            "Anything shown to a person (labels, columns, previews) is measured and cut in characters.",
            "Byte slices `&s[a..b]` only use positions that come from the string itself (`find`, `char_indices`, `split_once`).",
            "Padding and truncation use `format!` widths and precisions, not `len()` arithmetic.",
            "Input is trimmed before it is compared or parsed.",
            "Strings are joined with `format!` (or `push_str`), not long chains of `+`.",
            "Tests include Vietnamese text with 2- and 3-byte letters at every cut and padding boundary.",
        ]),
    ],
});
