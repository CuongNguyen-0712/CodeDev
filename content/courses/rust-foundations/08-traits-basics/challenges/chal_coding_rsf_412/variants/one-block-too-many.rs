// Song Han Logistics, Da Nang depot - labels and prices for the evening route sheet.
//
// The route sheet lists documents and packages. Both are priced through the Priced trait, and
// both are printed on the sheet with {} (Display). Today the sheet prints the Debug form, such as
// Package { id: "DN-07-0412", weight_g: 1250 }, and every price is 0. Write:
//
//   impl Priced for Document
//     - 15000 VND, or 25000 VND when express is true.
//
//   impl Priced for Package
//     - 20000 VND for the first 1000 g (1000 g included), plus 5000 VND for every started
//       500 g above 1000 g: 1001 g to 1500 g costs 25000, 1501 g to 2000 g costs 30000, ...
//
//   impl fmt::Display for Document
//     - "<id> document", followed by " (express)" when express is true:
//       "DN-07-0413 document (express)", "DN-07-0414 document"
//
//   impl fmt::Display for Package
//     - "<id> package <weight in kg with 2 decimals> kg": "DN-07-0412 package 1.25 kg"
//
//   fn total<T: Priced>(items: &[T]) -> u64
//     - the sum of price_vnd() over all items (0 for an empty slice).
//
// Input (stdin):  one item per line: "doc <id> express", "doc <id> standard" or "pkg <id> <grams>".
// Output:         one line per item, "<item>: <price text>" (price_text is the trait's default
//                 method), then "documents: <count>, total <sum> VND" and
//                 "packages: <count>, total <sum> VND".
//
// Example input:
//   pkg DN-07-0412 1250
//   doc DN-07-0413 express
//   pkg DN-07-0415 800
// Example output:
//   DN-07-0412 package 1.25 kg: 25000 VND
//   DN-07-0413 document (express): 25000 VND
//   DN-07-0415 package 0.80 kg: 20000 VND
//   documents: 1, total 25000 VND
//   packages: 2, total 45000 VND
use std::fmt;
use std::io::Read;

trait Priced {
    fn price_vnd(&self) -> u64;

    fn price_text(&self) -> String {
        format!("{} VND", self.price_vnd())
    }
}

#[derive(Debug)]
struct Document {
    id: String,
    express: bool,
}

#[derive(Debug)]
struct Package {
    id: String,
    weight_g: u32,
}

impl Priced for Document {
    fn price_vnd(&self) -> u64 {
        if self.express { 25_000 } else { 15_000 }
    }
}

impl Priced for Package {
    fn price_vnd(&self) -> u64 {
        if self.weight_g <= 1000 {
            20_000
        } else {
            20_000 + u64::from((self.weight_g - 1000) / 500 + 1) * 5_000
        }
    }
}

impl fmt::Display for Document {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{} document", self.id)?;
        if self.express {
            write!(f, " (express)")?;
        }
        Ok(())
    }
}

impl fmt::Display for Package {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let kg = f64::from(self.weight_g) / 1000.0;
        write!(f, "{} package {kg:.2} kg", self.id)
    }
}

fn total<T: Priced>(items: &[T]) -> u64 {
    let mut sum = 0;
    for item in items {
        sum += item.price_vnd();
    }
    sum
}

// ---- test runner (do not change) ----
fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).unwrap();

    let mut documents: Vec<Document> = Vec::new();
    let mut packages: Vec<Package> = Vec::new();
    for line in input.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        match parts.as_slice() {
            ["doc", id, kind] => {
                let doc = Document { id: id.to_string(), express: *kind == "express" };
                println!("{doc}: {}", doc.price_text());
                documents.push(doc);
            }
            ["pkg", id, grams] => {
                let pkg = Package { id: id.to_string(), weight_g: grams.parse().unwrap() };
                println!("{pkg}: {}", pkg.price_text());
                packages.push(pkg);
            }
            _ => {}
        }
    }
    println!("documents: {}, total {} VND", documents.len(), total(&documents));
    println!("packages: {}, total {} VND", packages.len(), total(&packages));
}
