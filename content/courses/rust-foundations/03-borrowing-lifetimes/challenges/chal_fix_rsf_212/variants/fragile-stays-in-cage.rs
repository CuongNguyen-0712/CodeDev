// Song Han Logistics, Da Nang depot - unload a roll cage at the Hoi An hub.
//
// The cage is a Vec<String> of parcel ids, owned by the test runner. Two functions borrow it
// mutably and change it in place:
//
//   fn unload(cage: &mut Vec<String>, delivered: &[String]) -> usize
//     - removes every parcel of the cage that is in `delivered`, keeps the others in order,
//     - returns how many parcels were removed from the cage (a delivered id that is not in the
//       cage does not count).
//
//   fn take_fragile(cage: &mut Vec<String>) -> Vec<String>
//     - removes every fragile parcel (its id ends with "-F") from the cage and returns them,
//       in cage order; the other parcels stay in the cage, in order.
//
// The bug report: the tool panics with "index out of bounds" after a delivery, and the
// fragile parcels are listed on the fragile sheet AND stay in the cage. Fix both functions.
// Do not change the test runner.
//
// Input (stdin): one command per line.
//   load <parcel> <parcel> ...      put parcels into the cage
//   deliver <parcel> <parcel> ...   call unload, print "delivered: <n>"
//   fragile                         call take_fragile, print "fragile: [<parcel>, ...]"
// At the end the runner prints "cage: <n> [<parcel>, ...]".
//
// Example input:
//   load SH-1001 SH-1002 SH-1003 SH-1004
//   deliver SH-1002 SH-1003
// Expected output:
//   delivered: 2
//   cage: 2 [SH-1001, SH-1004]
use std::io::Read;

fn unload(cage: &mut Vec<String>, delivered: &[String]) -> usize {
    let before = cage.len();
    cage.retain(|parcel| !delivered.contains(parcel));
    before - cage.len()
}

fn take_fragile(cage: &mut Vec<String>) -> Vec<String> {
    let mut fragile = Vec::new();
    for parcel in cage.iter() {
        if parcel.ends_with("-F") {
            fragile.push(parcel.clone());
        }
    }
    fragile
}

// ---- test runner (do not change) ----
fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();

    let mut cage: Vec<String> = Vec::new();
    for line in input.lines() {
        let mut words = line.split_whitespace();
        let command = words.next().unwrap_or("");
        let ids: Vec<String> = words.map(|w| w.to_string()).collect();
        match command {
            "load" => cage.extend(ids),
            "deliver" => println!("delivered: {}", unload(&mut cage, &ids)),
            "fragile" => println!("fragile: [{}]", take_fragile(&mut cage).join(", ")),
            _ => {}
        }
    }
    println!("cage: {} [{}]", cage.len(), cage.join(", "));
}
