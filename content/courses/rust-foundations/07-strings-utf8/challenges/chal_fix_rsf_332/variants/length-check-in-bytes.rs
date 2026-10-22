// Song Han Logistics, Da Nang depot - the label printer's text line.
//
// Every parcel label has one line of text: "<route> | <NAME> | <address>".
//   - the route is printed as it is (trimmed);
//   - the name is trimmed, uppercased and padded with spaces to NAME_WIDTH characters, so the
//     address column lines up; a name longer than NAME_WIDTH is printed whole, without padding;
//   - the address is trimmed; when it is longer than ADDRESS_MAX characters it is cut to its
//     first ADDRESS_MAX - 1 characters followed by "…" (one character, U+2026), so the label
//     never shows more than ADDRESS_MAX characters of address.
// "Characters" means what you see: "Hội" is 3 characters (but 5 bytes in UTF-8).
//
// The bug: labels for English test addresses look fine, but the printer crashes with
// "byte index 23 is not a char boundary" on some Vietnamese addresses, cuts others that would
// have fitted, and the address column is misaligned for names with diacritics.
// Fix name_column and short_address. Do not change the test runner.
//
// Input (stdin):  one parcel per line, "<route>;<name>;<address>".
// Output:         one label line per parcel.
//
// Example input:
//   DN-07;Tran Van Binh;45 Bach Dang, Hai Chau, Da Nang
//   DN-12;Phạm Thị Lan;3 Ông Ích Khiêm, Hải Châu
// Example output:
//   DN-07 | TRAN VAN BINH    | 45 Bach Dang, Hai Chau,…
//   DN-12 | PHẠM THỊ LAN     | 3 Ông Ích Khiêm, Hải Ch…
use std::io::Read;

const NAME_WIDTH: usize = 16;
const ADDRESS_MAX: usize = 24;

fn name_column(name: &str) -> String {
    let upper = name.trim().to_uppercase();
    format!("{upper:<NAME_WIDTH$}")
}

fn short_address(address: &str) -> String {
    let address = address.trim();
    if address.len() <= ADDRESS_MAX {
        address.to_string()
    } else {
        let mut cut: String = address.chars().take(ADDRESS_MAX - 1).collect();
        cut.push('…');
        cut
    }
}

fn label(route: &str, name: &str, address: &str) -> String {
    format!("{} | {} | {}", route.trim(), name_column(name), short_address(address))
}

// ---- test runner (do not change) ----
fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();
    for line in input.lines() {
        let parts: Vec<&str> = line.splitn(3, ';').collect();
        if parts.len() == 3 {
            println!("{}", label(parts[0], parts[1], parts[2]));
        }
    }
}
