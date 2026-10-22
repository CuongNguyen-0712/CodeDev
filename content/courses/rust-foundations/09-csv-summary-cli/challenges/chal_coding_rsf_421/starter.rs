// Song Han Logistics, Da Nang depot - end-of-day delivery summary.
//
// Every evening the drivers' handhelds export a CSV of the day's deliveries:
//
//   parcel_id,route,weight_g,cod_vnd,status
//   DN-07-0412,DN-07,1100,185000,delivered
//
// status is "delivered" or "failed". cod_vnd is the cash on delivery the driver must collect
// (0 for prepaid parcels). The CSV is simple: fields never contain commas or quotes.
// Write two functions:
//
//   fn parse_row(line: &str) -> Result<Delivery, String>
//     - split the line on ',' and trim spaces around every field, then check, in this order:
//         not exactly 5 fields          Err("expected 5 fields, found N")
//         parcel_id or route empty      Err("parcel_id and route must not be empty")
//         weight_g not a u32            Err("bad weight_g \"<field>\"")
//         cod_vnd not a u64             Err("bad cod_vnd \"<field>\"")
//         status not delivered/failed   Err("unknown status \"<field>\"")
//       (<field> is the trimmed field; format!("{:?}", field) prints it with the quotes.)
//
//   fn add(totals: &mut RouteTotals, delivery: &Delivery)
//     - count the parcel and its weight; count it as delivered or failed;
//       a delivered parcel's cod_vnd is collected, a failed parcel's cod_vnd stays open.
//
// The runner (do not change it) skips the header (line 1) and blank lines, numbers the lines
// from 1, groups the deliveries per route in a BTreeMap and prints, for each route in sorted order:
//   <route>: parcels <n>, weight <kg> kg, delivered <d>, failed <f>, COD collected <c> VND, COD open <o> VND
// then the same line for "total", "failed parcels: <ids in input order>" (or "none"),
// "errors: <count>" and one "line <n>: <message>" per rejected row.
//
// Example input:
//   parcel_id,route,weight_g,cod_vnd,status
//   DN-07-0412,DN-07,1100,185000,delivered
//   DN-12-0101,DN-12,1,5,120000,failed
//   DN-07-0413,DN-07,2200,90000,failed
// Example output:
//   DN-07: parcels 2, weight 3.300 kg, delivered 1, failed 1, COD collected 185000 VND, COD open 90000 VND
//   total: parcels 2, weight 3.300 kg, delivered 1, failed 1, COD collected 185000 VND, COD open 90000 VND
//   failed parcels: DN-07-0413
//   errors: 1
//   line 3: expected 5 fields, found 6
use std::collections::BTreeMap;
use std::io::Read;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Status {
    Delivered,
    Failed,
}

#[derive(Debug)]
struct Delivery {
    parcel_id: String,
    route: String,
    weight_g: u32,
    cod_vnd: u64,
    status: Status,
}

#[derive(Debug, Default)]
struct RouteTotals {
    parcels: u32,
    weight_g: u64,
    delivered: u32,
    failed: u32,
    cod_collected: u64,
    cod_open: u64,
}

fn parse_row(line: &str) -> Result<Delivery, String> {
    // TODO: split on commas, trim every field, check the field count, parse weight_g, cod_vnd
    // and status, and return Err(message) for the first problem found.
    let _ = line;
    Err(String::from("not implemented yet"))
}

fn add(totals: &mut RouteTotals, delivery: &Delivery) {
    // TODO: count the parcel, its weight, delivered or failed, and the COD collected or open.
    let _ = (totals, delivery);
}

// ---- test runner (do not change) ----
fn summary_line(name: &str, t: &RouteTotals) -> String {
    format!(
        "{name}: parcels {}, weight {}.{:03} kg, delivered {}, failed {}, COD collected {} VND, COD open {} VND",
        t.parcels, t.weight_g / 1000, t.weight_g % 1000, t.delivered, t.failed, t.cod_collected, t.cod_open
    )
}

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();

    let mut routes: BTreeMap<String, RouteTotals> = BTreeMap::new();
    let mut total = RouteTotals::default();
    let mut failed_ids: Vec<String> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    for (index, line) in input.lines().enumerate() {
        let line_no = index + 1;
        if line_no == 1 || line.trim().is_empty() {
            continue;
        }
        match parse_row(line) {
            Ok(delivery) => {
                add(routes.entry(delivery.route.clone()).or_default(), &delivery);
                add(&mut total, &delivery);
                if delivery.status == Status::Failed {
                    failed_ids.push(delivery.parcel_id.clone());
                }
            }
            Err(message) => errors.push(format!("line {line_no}: {message}")),
        }
    }

    for (route, totals) in &routes {
        println!("{}", summary_line(route, totals));
    }
    println!("{}", summary_line("total", &total));
    if failed_ids.is_empty() {
        println!("failed parcels: none");
    } else {
        println!("failed parcels: {}", failed_ids.join(", "));
    }
    println!("errors: {}", errors.len());
    for error in &errors {
        println!("{error}");
    }
}
