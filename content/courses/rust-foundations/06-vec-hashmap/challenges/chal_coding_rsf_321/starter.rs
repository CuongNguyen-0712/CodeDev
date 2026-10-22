// Song Han Logistics, Da Nang depot - the daily route report, in the same order every day.
//
// Each scan is (route, parcel id). A scanner sometimes reads the same parcel twice; a parcel
// counts once per route. Write three functions:
//
//   fn group_by_route(scans: &[(String, String)]) -> HashMap<String, Vec<String>>
//     - one entry per route, holding that route's parcel ids sorted A-Z, each id once.
//
//   fn ranking(groups: &HashMap<String, Vec<String>>) -> Vec<(String, usize)>
//     - (route, number of parcels) for every route, the busiest route first;
//       routes with the same number of parcels in A-Z order of the route name.
//       The result must never depend on the HashMap's iteration order.
//
//   fn top(ranking: &[(String, usize)], k: usize) -> &[(String, usize)]
//     - the first k entries, or all of them when there are fewer than k. Never panic.
//
// Input (stdin):  line 1 "top <k>", then one scan per line: "<route> <parcel id>".
// Output:         "top <k> of <n> routes:", then one line per route of top():
//                 "<route>: <count> parcels (<ids separated by spaces>)", then
//                 "parcels: <sum of the counts of ALL routes>, double reads: <scans - parcels>".
//
// Example input:
//   top 2
//   DN-07 SH1003
//   DN-03 SH1001
//   DN-07 SH1002
//   DN-07 SH1003
//   DN-11 SH1004
// Example output:
//   top 2 of 3 routes:
//   DN-07: 2 parcels (SH1002 SH1003)
//   DN-03: 1 parcels (SH1001)
//   parcels: 4, double reads: 1
use std::collections::HashMap;
use std::io::Read;

fn group_by_route(scans: &[(String, String)]) -> HashMap<String, Vec<String>> {
    // TODO: route -> its parcel ids, sorted, each id once.
    let _ = scans;
    HashMap::new()
}

fn ranking(groups: &HashMap<String, Vec<String>>) -> Vec<(String, usize)> {
    // TODO: (route, count), busiest first, ties in A-Z order of the route.
    let _ = groups;
    Vec::new()
}

fn top(ranking: &[(String, usize)], k: usize) -> &[(String, usize)] {
    // TODO: the first k entries, or all of them when there are fewer.
    let _ = k;
    ranking
}

// ---- test runner (do not change) ----
fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();
    let mut lines = input.lines();
    let k: usize = lines.next().unwrap().trim().trim_start_matches("top").trim().parse().unwrap();
    let mut scans: Vec<(String, String)> = Vec::new();
    for line in lines {
        let mut parts = line.split_whitespace();
        if let (Some(route), Some(parcel)) = (parts.next(), parts.next()) {
            scans.push((route.to_string(), parcel.to_string()));
        }
    }

    let groups = group_by_route(&scans);
    let list = ranking(&groups);
    println!("top {k} of {} routes:", list.len());
    for (route, count) in top(&list, k) {
        let ids = groups.get(route).map(|ids| ids.join(" ")).unwrap_or_default();
        println!("{route}: {count} parcels ({ids})");
    }
    let parcels: usize = list.iter().map(|(_, count)| count).sum();
    println!("parcels: {parcels}, double reads: {}", scans.len() - parcels.min(scans.len()));
}
