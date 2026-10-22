// Song Han Logistics, Da Nang depot - load scanned bags into roll cages.
//
// The scanner firmware stores parcel counts as u8 (0 to 255). A bag's count arrives as a u32
// from the scan log, and a roll cage's running count is a u8 too. Write three functions:
//
//   fn bag_count(raw: u32) -> Option<u8>
//     - Some(count) when raw fits in a u8, None when it does not (300 must NOT become 44).
//
//   fn load(cage: u8, bag: u8) -> Option<u8>
//     - the cage's new count after adding the bag, or None when the sum does not fit in a u8
//       (the runner then starts a new cage with that bag). Never wrap around, never stop at 255.
//
//   fn average(parcels: u32, cages: u32) -> f64
//     - parcels per cage as an f64, fraction included (301 parcels in 2 cages is 150.5).
//       cages is always at least 1.
//
// Input (stdin):  one bag per line, "<bag id> <count>", count is a whole number >= 0.
// Output:         "<bag id> rejected: <count> does not fit in a u8" for every bag that does not fit,
//                 then one line per cage "cage <n>: <count>", then
//                 "cages: <k>, parcels: <total>, average: <average with 2 decimals>".
//
// Example input:
//   DN-0412 200
//   DN-0413 100
//   DN-0414 40
//   DN-0415 300
// Example output:
//   DN-0415 rejected: 300 does not fit in a u8
//   cage 1: 200
//   cage 2: 140
//   cages: 2, parcels: 340, average: 170.00
use std::io::Read;

fn bag_count(raw: u32) -> Option<u8> {
    u8::try_from(raw).ok()
}

fn load(cage: u8, bag: u8) -> Option<u8> {
    cage.checked_add(bag)
}

fn average(parcels: u32, cages: u32) -> f64 {
    f64::from(parcels / cages)
}

// ---- test runner (do not change) ----
fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();

    let mut cages: Vec<u8> = vec![0];
    for line in input.lines() {
        let mut parts = line.split_whitespace();
        let (Some(id), Some(raw)) = (parts.next(), parts.next()) else { continue };
        let raw: u32 = raw.parse().unwrap();
        let Some(bag) = bag_count(raw) else {
            println!("{id} rejected: {raw} does not fit in a u8");
            continue;
        };
        let last = cages.len() - 1;
        match load(cages[last], bag) {
            Some(count) => cages[last] = count,
            None => cages.push(bag),
        }
    }

    let mut parcels: u32 = 0;
    for (i, count) in cages.iter().enumerate() {
        println!("cage {}: {}", i + 1, count);
        parcels += u32::from(*count);
    }
    let k = cages.len() as u32;
    println!("cages: {k}, parcels: {parcels}, average: {:.2}", average(parcels, k));
}
