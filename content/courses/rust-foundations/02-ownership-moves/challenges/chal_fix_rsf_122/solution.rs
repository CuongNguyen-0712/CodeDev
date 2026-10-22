// Song Han Logistics, Da Nang depot - roll cage manifests.
//
// Each roll cage holds a list of parcel ids. Two functions keep the cages up to date, and the
// test runner below calls them and prints every cage at the end:
//
//   fn add_bag(cage: Vec<String>, bag: Vec<String>) -> Vec<String>
//     - returns the cage with every parcel of the bag added at the end, in bag order,
//     - skips a parcel that is already in the cage, including one that appears twice in the
//       same bag (the scanner beeps twice when a parcel is held too long).
//
//   fn merge(from: Vec<String>, to: Vec<String>) -> (Vec<String>, Vec<String>)
//     - moves every parcel of `from` into `to`, with the same rule as add_bag (no duplicates),
//     - returns (from, to) AFTER the move: `from` is empty, `to` holds the parcels.
//
// The bug report: bags never show up on the manifest, a parcel scanned twice in one bag is
// listed twice, and after a merge the parcels are listed in both cages. The functions were written by
// adding .clone() until the compiler stopped complaining. Fix them. Do not change the test runner.
//
// Input (stdin): one command per line.
//   bag <cage> <parcel> <parcel> ...   add a bag of parcels to a cage (created on first use)
//   merge <from> <to>                  move every parcel of cage <from> into cage <to>
// Output: one line per cage, in the order the cages first appeared:
//   <cage>: <n> parcels [<parcel>, <parcel>, ...]
//
// Example input:
//   bag DN-07 SH-1001 SH-1002
//   bag DN-07 SH-1003 SH-1003
//   bag DN-08 SH-2001
//   merge DN-08 DN-07
// Expected output:
//   DN-07: 4 parcels [SH-1001, SH-1002, SH-1003, SH-2001]
//   DN-08: 0 parcels []
use std::io::Read;

fn add_bag(mut cage: Vec<String>, bag: Vec<String>) -> Vec<String> {
    for parcel in bag {
        if !cage.contains(&parcel) {
            cage.push(parcel);
        }
    }
    cage
}

fn merge(from: Vec<String>, to: Vec<String>) -> (Vec<String>, Vec<String>) {
    let to = add_bag(to, from);
    (Vec::new(), to)
}

// ---- test runner (do not change) ----
fn cage_index(cages: &mut Vec<(String, Vec<String>)>, name: &str) -> usize {
    match cages.iter().position(|(n, _)| n == name) {
        Some(i) => i,
        None => {
            cages.push((name.to_string(), Vec::new()));
            cages.len() - 1
        }
    }
}

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();

    let mut cages: Vec<(String, Vec<String>)> = Vec::new();
    for line in input.lines() {
        let words: Vec<&str> = line.split_whitespace().collect();
        match words.as_slice() {
            ["bag", cage, parcels @ ..] => {
                let i = cage_index(&mut cages, cage);
                let bag: Vec<String> = parcels.iter().map(|p| p.to_string()).collect();
                let current = std::mem::take(&mut cages[i].1);
                cages[i].1 = add_bag(current, bag);
            }
            ["merge", from, to] => {
                let f = cage_index(&mut cages, from);
                let t = cage_index(&mut cages, to);
                if f == t {
                    continue;
                }
                let from_cage = std::mem::take(&mut cages[f].1);
                let to_cage = std::mem::take(&mut cages[t].1);
                let (from_cage, to_cage) = merge(from_cage, to_cage);
                cages[f].1 = from_cage;
                cages[t].1 = to_cage;
            }
            _ => {}
        }
    }

    for (name, parcels) in &cages {
        println!("{name}: {} parcels [{}]", parcels.len(), parcels.join(", "));
    }
}
