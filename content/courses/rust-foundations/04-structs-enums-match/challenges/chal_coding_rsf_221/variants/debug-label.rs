// Song Han Logistics - parcel status tracker.
//
// A parcel's status is an enum, and every event moves it from one status to the next. Parcel::new
// is given: a new parcel is InDepot with 0 failed attempts, and cod_due is the cash on delivery
// (VND) the driver must collect (0 for prepaid parcels). Write the other three methods:
//
//   fn apply(&mut self, event: Event) -> bool
//     - applies the event when it is allowed in the current status and returns true; otherwise
//       leaves the parcel unchanged and returns false. The allowed moves:
//         InDepot          + Out { driver }   -> OutForDelivery { driver }
//         OutForDelivery   + Deliver { cod }  -> Delivered { cod }, only if cod == cod_due
//         OutForDelivery   + Fail { reason }  -> one more failed attempt; after the 3rd failed
//                                                attempt -> Returned { reason }, else InDepot
//         InDepot          + Recall           -> Returned { reason: "recalled by sender" }
//       Everything else is rejected (a delivered or returned parcel never changes again).
//
//   fn label(&self) -> String
//     InDepot                    "in depot"
//     OutForDelivery { driver }  "out with <driver>"
//     Delivered { cod }          "delivered, COD <cod> VND"
//     Returned { reason }        "returned: <reason>"
//
//   fn cod_collected(&self) -> u32
//     - the cash collected for this parcel: cod for a Delivered parcel, 0 for every other status.
//
// Input (stdin): one command per line.
//   new <id> <cod_due>          register a parcel
//   <id> out <driver>           <id> deliver <cod>
//   <id> fail <reason ...>      <id> recall
// The runner prints "<id>: rejected <event> (<label>)" for every rejected event, then
// "<id>: <label>" for every parcel in registration order and "COD collected: <total> VND".
//
// Example input:
//   new SH-1001 250000
//   SH-1001 out Minh
//   SH-1001 deliver 200000
//   SH-1001 deliver 250000
// Example output:
//   SH-1001: rejected deliver (out with Minh)
//   SH-1001: delivered, COD 250000 VND
//   COD collected: 250000 VND
use std::io::Read;

#[derive(Debug, Clone, PartialEq)]
enum Status {
    InDepot,
    OutForDelivery { driver: String },
    Delivered { cod: u32 },
    Returned { reason: String },
}

#[derive(Debug)]
enum Event {
    Out { driver: String },
    Deliver { cod: u32 },
    Fail { reason: String },
    Recall,
}

#[derive(Debug)]
struct Parcel {
    id: String,
    cod_due: u32,
    failed_attempts: u8,
    status: Status,
}

const MAX_ATTEMPTS: u8 = 3;

impl Parcel {
    fn new(id: &str, cod_due: u32) -> Parcel {
        Parcel { id: id.to_string(), cod_due, failed_attempts: 0, status: Status::InDepot }
    }

    fn apply(&mut self, event: Event) -> bool {
        let next = match (&self.status, event) {
            (Status::InDepot, Event::Out { driver }) => Status::OutForDelivery { driver },
            (Status::OutForDelivery { .. }, Event::Deliver { cod }) if cod == self.cod_due => {
                Status::Delivered { cod }
            }
            (Status::OutForDelivery { .. }, Event::Fail { reason }) => {
                self.failed_attempts += 1;
                if self.failed_attempts >= MAX_ATTEMPTS {
                    Status::Returned { reason }
                } else {
                    Status::InDepot
                }
            }
            (Status::InDepot, Event::Recall) => Status::Returned { reason: String::from("recalled by sender") },
            _ => return false,
        };
        self.status = next;
        true
    }

    fn label(&self) -> String {
        format!("{:?}", self.status)
    }

    fn cod_collected(&self) -> u32 {
        match self.status {
            Status::Delivered { cod } => cod,
            _ => 0,
        }
    }
}

// ---- test runner (do not change) ----
fn parse_event(words: &[&str]) -> Option<(String, Event)> {
    let event = match words {
        ["out", driver] => Event::Out { driver: driver.to_string() },
        ["deliver", cod] => Event::Deliver { cod: cod.parse().ok()? },
        ["fail", reason @ ..] if !reason.is_empty() => Event::Fail { reason: reason.join(" ") },
        ["recall"] => Event::Recall,
        _ => return None,
    };
    Some((words[0].to_string(), event))
}

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();

    let mut parcels: Vec<Parcel> = Vec::new();
    for line in input.lines() {
        let words: Vec<&str> = line.split_whitespace().collect();
        match words.as_slice() {
            ["new", id, cod] => parcels.push(Parcel::new(id, cod.parse().unwrap())),
            [id, rest @ ..] => {
                let Some(parcel) = parcels.iter_mut().find(|p| p.id == *id) else { continue };
                let Some((name, event)) = parse_event(rest) else { continue };
                if !parcel.apply(event) {
                    println!("{}: rejected {} ({})", parcel.id, name, parcel.label());
                }
            }
            _ => {}
        }
    }

    let mut total: u32 = 0;
    for parcel in &parcels {
        println!("{}: {}", parcel.id, parcel.label());
        total += parcel.cod_collected();
    }
    println!("COD collected: {total} VND");
}
