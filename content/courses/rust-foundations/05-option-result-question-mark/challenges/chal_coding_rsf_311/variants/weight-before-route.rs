// Song Han Logistics, Da Nang depot - validate the nightly scan log line by line.
//
// Each line of the scan log is "<parcel id>,<route>,<weight in grams>". The old import tool
// called unwrap() and lost the whole night's batch on one bad line. Write
//
//   fn parse_line(line: &str) -> Result<Scan, ScanError>
//
// that never panics and returns the FIRST problem it finds, in this order:
//   1. split the line on ',' and trim every field; not exactly 3 fields -> ScanError::FieldCount(n)
//   2. the parcel id is empty                                   -> ScanError::MissingId
//   3. the route does not start with "DN-"                      -> ScanError::UnknownRoute(route)
//   4. the weight does not parse as a u32                       -> ScanError::BadWeight { raw, reason }
//      (raw = the trimmed field, reason = the parse error's message, e.g. e.to_string())
//   5. the weight is above MAX_GRAMS (30000 g is still fine)    -> ScanError::TooHeavy(grams)
// Otherwise return Ok(Scan { id, route, grams }) with the trimmed id and route.
// ScanError and its messages (Display) are already written. Use ?, map_err and early returns.
//
// Input (stdin):  the scan log. Blank lines are skipped by the runner, but still counted for
//                 the line numbers.
// Output:         one line per non-blank input line, in order:
//                 "line <n>: <id> <route> <grams> g" or "line <n>: rejected: <error message>",
//                 then "accepted: <a>, rejected: <r>, total: <sum of accepted grams> g".
//
// Example input:
//   SH10231,DN-07,1250
//   SH10232,DN-07,12O0
//
//   SH10233,HA-01,410
// Example output:
//   line 1: SH10231 DN-07 1250 g
//   line 2: rejected: bad weight '12O0': invalid digit found in string
//   line 4: rejected: unknown route 'HA-01'
//   accepted: 1, rejected: 2, total: 1250 g
use std::fmt;
use std::io::Read;

const MAX_GRAMS: u32 = 30_000;

#[derive(Debug)]
struct Scan {
    id: String,
    route: String,
    grams: u32,
}

#[derive(Debug)]
enum ScanError {
    FieldCount(usize),
    MissingId,
    UnknownRoute(String),
    BadWeight { raw: String, reason: String },
    TooHeavy(u32),
}

impl fmt::Display for ScanError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ScanError::FieldCount(n) => write!(f, "expected 3 fields, found {n}"),
            ScanError::MissingId => write!(f, "missing parcel id"),
            ScanError::UnknownRoute(r) => write!(f, "unknown route '{r}'"),
            ScanError::BadWeight { raw, reason } => write!(f, "bad weight '{raw}': {reason}"),
            ScanError::TooHeavy(g) => write!(f, "{g} g is over the {MAX_GRAMS} g limit"),
        }
    }
}

fn parse_line(line: &str) -> Result<Scan, ScanError> {
    let fields: Vec<&str> = line.split(',').map(|f| f.trim()).collect();
    if fields.len() != 3 {
        return Err(ScanError::FieldCount(fields.len()));
    }
    let (id, route, raw) = (fields[0], fields[1], fields[2]);
    if id.is_empty() {
        return Err(ScanError::MissingId);
    }
    let grams: u32 = raw.parse().map_err(|e: std::num::ParseIntError| ScanError::BadWeight {
        raw: raw.to_string(),
        reason: e.to_string(),
    })?;
    if !route.starts_with("DN-") {
        return Err(ScanError::UnknownRoute(route.to_string()));
    }
    if grams > MAX_GRAMS {
        return Err(ScanError::TooHeavy(grams));
    }
    Ok(Scan { id: id.to_string(), route: route.to_string(), grams })
}

// ---- test runner (do not change) ----
fn main() {
    let mut log = String::new();
    std::io::stdin().read_to_string(&mut log).unwrap();

    let (mut accepted, mut rejected, mut total) = (0, 0, 0u64);
    for (i, line) in log.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        match parse_line(line) {
            Ok(scan) => {
                accepted += 1;
                total += u64::from(scan.grams);
                println!("line {}: {} {} {} g", i + 1, scan.id, scan.route, scan.grams);
            }
            Err(e) => {
                rejected += 1;
                println!("line {}: rejected: {e}", i + 1);
            }
        }
    }
    println!("accepted: {accepted}, rejected: {rejected}, total: {total} g");
}
