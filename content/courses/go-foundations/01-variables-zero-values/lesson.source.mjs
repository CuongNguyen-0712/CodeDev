// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-gof-1-1",
    title: "Variables, types & zero values",
    slug: { _type: "slug", current: "go-variables-types-zero-values" },
    description:
        "On its first evening in production, Saigon Parcel's new end-of-day COD report told every driver to hand in 0 VND with a 0% delivery rate. One := in the wrong place had created a second cash variable, and an integer division had rounded 3/4 down to nothing. Learn how Go declares variables with var and :=, what zero values every type starts with, how block scope and shadowing work, why Go never converts numbers for you, how integer division and division by zero behave, and how constants and iota work.",
    estimatedTime: 18,

    scenario: {
        role: "Junior Go developer on the platform team at Saigon Parcel, a delivery company in Ho Chi Minh City",
        problem:
            "Drivers collect cash on delivery (COD) and hand it in every evening. The old spreadsheet was replaced by a small Go job that prints each driver's summary. On its first evening, every summary said 'delivered 3/4 (0%), cash to hand in: 0 VND'. The finance desk could not close the day, 42 drivers waited at the depot, and the job had passed code review that afternoon.",
    },

    content: [
        h2("1. The incident"),
        p("Every Saigon Parcel driver ends the day at the depot with a bag of cash: customers pay for many parcels on delivery (**COD**, cash on delivery). The finance desk counts the bag against a summary printed by a small Go job. The job is new: it replaced a spreadsheet, it is 60 lines long, and it was reviewed and merged the same afternoon."),
        p("At 18:40 the first driver, Nguyễn Văn An, came to the desk. His summary said `delivered 3/4 (0%), cash to hand in: 0 VND`. His bag held 439,000 VND. Every other summary looked the same: a correct parcel count, a 0% rate and no cash. Finance closed the day by hand, from the drivers' phones, and it took until 21:15."),
        bullets([
            "**Nothing crashed.** There was no error, no panic and no warning: the program compiled, ran and printed numbers that looked like numbers.",
            "**Two independent bugs** gave the two zeros. Both are among the first mistakes every Go developer makes, and both are invisible in a quick review.",
            "**The debug output looked fine at a glance.** The job printed a running total after the first parcel, and 350000 was correct. Nobody read the second line.",
        ]),

        h2("2. Reproduce it"),
        p("This is the core of the job, cut down to four parcels. `addVND` was added during review: it refuses negative amounts, so a typo in the scanner app cannot reduce a driver's cash. Save it as `cod.go` and run it with `go run cod.go` (Go 1.25 or newer):"),
        code("go", String.raw`
package main

import (
	"errors"
	"fmt"
	"log"
)

type Parcel struct {
	ID        string
	COD       int64 // cash to collect on delivery, in VND
	Delivered bool
}

var errNegative = errors.New("negative COD amount")

// addVND adds one COD amount to a running total and refuses negative amounts.
func addVND(total, amount int64) (int64, error) {
	if amount < 0 {
		return total, fmt.Errorf("%w: %d", errNegative, amount)
	}
	return total + amount, nil
}

func main() {
	parcels := []Parcel{
		{"SP-1021", 350_000, true},
		{"SP-1022", 120_000, false},
		{"SP-1023", 89_000, true},
		{"SP-1024", 0, true}, // paid online, nothing to collect
	}

	var cash int64
	delivered := 0
	for _, p := range parcels {
		if p.Delivered {
			cash, err := addVND(cash, p.COD)
			if err != nil {
				log.Fatal(err)
			}
			fmt.Printf("  %s delivered, cash so far %d VND\n", p.ID, cash)
			delivered++
		}
	}
	rate := delivered / len(parcels) * 100
	fmt.Printf("delivered %d/%d (%d%%), cash to hand in: %d VND\n", delivered, len(parcels), rate, cash)
}`, "cod.go"),
        code("text", String.raw`
$ go run cod.go
  SP-1021 delivered, cash so far 350000 VND
  SP-1023 delivered, cash so far 89000 VND
  SP-1024 delivered, cash so far 0 VND
delivered 3/4 (0%), cash to hand in: 0 VND`),
        p("`go vet cod.go` reports nothing either. Before the review, the loop body was `cash += p.COD`. To use `addVND`, the author needed a new variable `err`, wrote `cash, err := ...`, and the compiler accepted it - because `:=` inside the `if` block declared **two new variables**, a new `cash` and `err`, that only live until the closing brace. The outer `cash` stayed 0. The second zero has a different cause: `delivered / len(parcels)` is `3 / 4` with two `int` values, which is 0 in integer division, and 0 x 100 is still 0."),
        p("To understand both bugs, and avoid the next ones, you need three things: how Go declares variables, what value a variable has before you assign it, and how Go's numeric types behave."),

        h2("3. Declaring variables"),
        p("Go has two ways to declare a variable, and both always give it a value:"),
        bullets([
            "**`var name Type`** declares a variable with its type and gives it the type's **zero value**. `var name Type = value` or `var name = value` sets it right away; with a value, the type may be left out and is taken from the value.",
            "**`name := value`** is the short form, allowed only inside functions. The type comes from the value: `delivered := 0` is an `int`, `rate := 0.5` is a `float64`, `id := \"SP-1021\"` is a `string`.",
            "**Every variable has a type that never changes.** `delivered = \"three\"` is a compile error, not a conversion.",
        ]),
        h3("Zero values: nothing is ever uninitialised"),
        p("In C, a local variable you forget to set holds whatever was in memory. Go never does that: a variable declared without a value holds the **zero value** of its type. Run this to see the zero value of the types you will use most:"),
        code("go", String.raw`
package main

import "fmt"

type Parcel struct {
	ID        string
	COD       int64
	Delivered bool
	Tags      []string
	Driver    *string
}

func main() {
	var n int
	var price float64
	var id string
	var ok bool
	var p Parcel
	var tags []string
	var stock map[string]int
	fmt.Println(n, price, ok)
	fmt.Printf("%q %d\n", id, len(id))
	fmt.Printf("%+v\n", p)
	fmt.Println(tags == nil, len(tags), stock == nil, stock["SP-1021"])
	tags = append(tags, "fragile")
	fmt.Println(tags)
	fmt.Printf("%T %T %T\n", 42, 4.2, 'A')
}`, "zero.go"),
        code("text", String.raw`
0 0 false
"" 0
{ID: COD:0 Delivered:false Tags:[] Driver:<nil>}
true 0 true 0
[fragile]
int float64 int32`),
        bullets([
            "**Numbers** start at `0`, **`bool`** at `false`, **`string`** at `\"\"` (the empty string, length 0).",
            "**Pointers, slices, maps, channels, functions and interfaces** start at `nil`. A nil slice works with `len` and `append`; reading from a nil map gives the zero value; **writing** to a nil map panics (you will see that in the lesson on maps).",
            "**A struct's zero value** is a struct whose fields all hold their own zero values. `%+v` prints the field names, which makes it the best verb for debugging structs.",
            "**`'A'` is a `rune`**, Go's name for `int32`: a Unicode code point, not a one-byte `char`.",
        ]),
        p("Zero values are useful, and Go code relies on them on purpose: `var total int64` is a correct starting point for a sum, a zero `Summary{}` is a correct empty report, and `var b strings.Builder` is ready to use. The flip side is that a forgotten assignment does not crash. It quietly leaves a zero, which is exactly what the COD report printed."),
        h3("var or :="),
        p("Use `:=` for most local variables, and `var` when you want the zero value (`var cash int64`), when the type should differ from the default (`var limit int64 = 20_000_000`), or at package level, where `:=` is not allowed. One more rule matters a lot: `:=` must declare **at least one new variable on its left**, but it may also reuse variables that already exist **in the same block**:"),
        code("go", String.raw`
x, y := 10, "SP-1021"
x, z := 20, true     // z is new, so := is allowed; x is the same x, assigned 20
fmt.Println(x, y, z) // 20 SP-1021 true`),
        p("This is what makes `v, err := f()` so convenient in Go - and what makes it dangerous inside a nested block, as the next section shows."),
        h3("Unused variables and imports are compile errors"),
        p("Go refuses to compile a program with a local variable that is never used, or an import that is never used. It also rejects a division by a constant zero. All three in one file:"),
        code("go", String.raw`
package main

import (
	"fmt"
	"os"
)

func main() {
	var total int64
	for i := range 3 {
		total := total + int64(i)
	}
	fmt.Println(total / 0)
}`, "unused.go"),
        code("text", String.raw`
$ go build unused.go
# command-line-arguments
./unused.go:5:2: "os" imported and not used
./unused.go:11:3: declared and not used: total
./unused.go:13:22: invalid operation: division by zero`),
        p("Line 11 is a shadowing bug the compiler happens to catch: the inner `total` is assigned and never read. In `cod.go` the inner `cash` was read by the debug `Printf`, so it counted as used and the compiler had nothing to say. (`for i := range 3` loops with `i` = 0, 1, 2; ranging over an integer works since Go 1.22.)"),

        h2("4. Scope and shadowing"),
        p("Every pair of braces is a **block**, and a variable exists from its declaration to the end of the block it was declared in. `if`, `for` and `switch` statements also open an implicit block, so a variable declared in `if v, ok := m[k]; ok {` lives only inside that `if` and its `else`. An inner block can declare a variable with the same name as an outer one. Inside the inner block, the name then means the inner variable: the outer one is **shadowed** - still there, but unreachable by that name."),
        image("shadowed-cash", {
            alt: "Two panels and a rule box. The left, red panel is titled cash, err := addVND(cash, p.COD) and says it declares a new cash and err in the if block. Inside it, a box says main: cash = 0, never assigned again, and a dashed box for the if block lists pass 1: inner cash = 0 + 350000 = 350000, pass 2: inner cash = 0 + 89000 = 89000, pass 3: inner cash = 0 + 0 = 0, each thrown away at the closing brace; the result box says Report: cash to hand in: 0 VND. The right, green panel is titled var err error, cash, err = addVND(cash, p.COD): main has one cash updated on every pass, pass 1 gives 350000, pass 2 gives 439000, pass 3 gives 439000, only err is declared in the block; the result box says Report: cash to hand in: 439000 VND. The rule box at the bottom says a, b := f() declares every name that is not yet declared in this block and shadows outer names, while a, b = f() assigns existing variables and is rejected if a name does not exist.",
            caption: "The := in cod.go is legal, compiles and runs. It just talks about a different cash.",
        }),
        p("In `cod.go`, `cash, err := addVND(cash, p.COD)` sits in the `if` block. Neither `cash` nor `err` is declared in that block yet, so `:=` declares both. On the right-hand side, `cash` still means the outer variable - the new one only exists after the statement - so every pass computes `0 + p.COD`, prints it, and throws it away at `}`. The fix is to declare only what is new, and assign the rest:"),
        code("go", String.raw`
for _, p := range parcels {
	if !p.Delivered {
		continue
	}
	var err error
	cash, err = addVND(cash, p.COD) // = assigns the outer cash; only err is new
	if err != nil {
		log.Fatal(err)
	}
	delivered++
}`),
        callout("warning", "go vet does not report shadowing",
            "The standard go vet checks do not include shadowing, because a lot of correct Go code shadows on purpose (err in a nested block, a value re-declared to narrow its use). The shadow analyzer from golang.org/x/tools, and linters such as golangci-lint with govet shadow checking turned on, do report it. In review, read every := inside a nested block and ask: is each name on the left really meant to be new here?"),

        h2("5. Types and conversions"),
        p("Go is statically typed, and it never converts between numeric types for you, not even from a small integer type to a bigger one. The finance team's first attempt at an average shows the error you get:"),
        code("go", String.raw`
var cash int64 = 439_000
delivered := 3
fmt.Println(cash / delivered)`),
        code("text", String.raw`
./main.go:8:14: invalid operation: cash / delivered (mismatched types int64 and int)`),
        p("You convert explicitly, with the type name used like a function: `cash / int64(delivered)` gives `146333`. The types you will meet most:"),
        bullets([
            "**`int`** is the default integer type: 64 bits on every platform you will deploy to (32 bits on 32-bit systems). Use it for counts, indexes and lengths - `len` returns an `int`.",
            "**`int64`, `int32`, `uint8` (`byte`) ...** have a fixed size. Use `int64` for money stored in the smallest unit (VND has no cents, so 439,000 VND is `int64(439000)`), for ids and for anything stored in a database.",
            "**`float64`** for measurements and ratios: weights, distances, percentages. Never for money: with two `float64` variables holding 0.1 and 0.2, `a + b` prints `0.30000000000000004`, as binary floats do in every language.",
            "**`string`** is an immutable sequence of bytes, usually UTF-8 text. `len(\"Bích\")` is 5, not 4: `í` takes two bytes.",
        ]),
        h3("Integer division"),
        p("When both operands are integers, `/` is integer division: the result is truncated toward zero, and `%` gives the remainder. That is why the success rate was 0. Converting to `float64` **before** dividing fixes it; converting the result afterwards does not, because the 0 has already been computed:"),
        code("go", String.raw`
package main

import "fmt"

func main() {
	delivered, attempted := 3, 4
	fmt.Println(delivered / attempted * 100)
	fmt.Println(delivered * 100 / attempted)
	fmt.Println(float64(delivered) / float64(attempted) * 100)
	fmt.Printf("%.1f%%\n", float64(delivered)/float64(attempted)*100)
	fmt.Println(7/2, 7.0/2, -7/2, 7%3, -7%3)
	zero := 0
	fmt.Println(float64(3) / float64(zero))
	fmt.Println(10 / zero)
}`, "div.go"),
        code("text", String.raw`
$ go run div.go
0
75
75
75.0%
3 3.5 -3 1 -1
+Inf
panic: runtime error: integer divide by zero

goroutine 1 [running]:
main.main()
	./div.go:14 +0x23c
exit status 2`),
        bullets([
            "**`delivered * 100 / attempted`** gives 75 because the multiplication happens first. It still truncates: 2 of 3 gives 66, not 66.7.",
            "**`7.0/2` is 3.5**: `7.0` is a floating-point constant, so the division is done in floating point.",
            "**`-7/2` is -3 and `-7%3` is -1**: Go truncates toward zero, and the remainder has the sign of the left operand.",
            "**Dividing by a zero variable** panics for integers and gives `+Inf` (or `NaN` for 0/0) for floats. A report that divides by a count must decide what to print when the count is 0 - and check for it before dividing.",
        ]),
        challenge("chal_quiz_gof_111", "For the counter, ask which block each count belongs to and whether the right-hand side sees the new or the old variable. For the statements, remember which zero values are safe to read, which mistakes Go catches at compile time and which ones panic at run time."),

        h2("6. Constants and iota"),
        p("`const` declares a value fixed at compile time. Numeric constants without an explicit type are **untyped**: they have arbitrary precision and take the type the context needs, which is why the same constant can initialise an `int64` and take part in a `float64` expression. `iota` numbers the constants of a `const` block: 0, 1, 2 ..."),
        code("go", String.raw`
package main

import "fmt"

const maxCODPerParcel = 20_000_000 // VND, company policy
const feePercent = 1.5

type Status int

const (
	Pending Status = iota
	OutForDelivery
	Delivered
	Returned
)

func main() {
	var limit int64 = maxCODPerParcel
	var fee float64 = maxCODPerParcel * feePercent / 100
	fmt.Println(limit, fee, Delivered, Returned)
	fmt.Printf("%v|%d|%5d|%-8s|%q|%.2f|%x\n", 42, 42, 42, "SP", "Bích", 3.14159, 255)
}`, "consts.go"),
        code("text", String.raw`
20000000 300000 2 3
42|42|   42|SP      |"Bích"|3.14|ff`),
        p("The second line is a quick reference for the `fmt` verbs used in this course: `%v` the default format, `%d` an integer, `%5d` and `%-8s` padded to a width (right and left aligned), `%q` a quoted string, `%.2f` a float with two decimals, `%x` hexadecimal, `%T` the type, `%+v` a struct with field names, and `%%` a literal percent sign. Underscores in number literals (`20_000_000`) are only for readability."),

        h2("7. The fix"),
        p("The fixed job keeps the summary in a struct, so a zero `Summary{}` is a correct empty report, assigns with `=` where it updates, and handles the case the old code would have crashed on: a driver with no parcels. `successRate` returns a second value, `ok`, instead of dividing by zero or inventing a number:"),
        code("go", String.raw`
type Summary struct {
	Parcels   int
	Delivered int
	Cash      int64 // VND
}

// successRate returns delivered/attempted as a percentage; ok is false when nothing was attempted.
func successRate(delivered, attempted int) (rate float64, ok bool) {
	if attempted == 0 {
		return 0, false
	}
	return float64(delivered) / float64(attempted) * 100, true
}

func summarize(parcels []Parcel) (Summary, error) {
	s := Summary{Parcels: len(parcels)}
	for _, p := range parcels {
		if !p.Delivered {
			continue
		}
		var err error
		s.Cash, err = addVND(s.Cash, p.COD) // = assigns the outer variables, no new ones
		if err != nil {
			return Summary{}, fmt.Errorf("parcel %s: %w", p.ID, err)
		}
		s.Delivered++
	}
	return s, nil
}

func main() {
	parcels := []Parcel{
		{"SP-1021", 350_000, true},
		{"SP-1022", 120_000, false},
		{"SP-1023", 89_000, true},
		{"SP-1024", 0, true},
	}
	s, err := summarize(parcels)
	if err != nil {
		log.Fatal(err)
	}
	if rate, ok := successRate(s.Delivered, s.Parcels); ok {
		fmt.Printf("delivered %d/%d (%.1f%%), cash to hand in: %d VND\n", s.Delivered, s.Parcels, rate, s.Cash)
	} else {
		fmt.Println("no parcels today")
	}
	_, err = summarize([]Parcel{{"SP-1030", -5_000, true}})
	fmt.Println(err)
	var empty Summary
	fmt.Printf("%+v\n", empty)
}
// delivered 3/4 (75.0%), cash to hand in: 439000 VND
// parcel SP-1030: negative COD amount: -5000
// {Parcels:0 Delivered:0 Cash:0}`, "cod.go"),
        numbered([
            "**`s.Cash, err = addVND(...)`** with `var err error` above it: only `err` is new, so nothing can be shadowed.",
            "**`float64(...)` before the division**, and `%.1f` to print one decimal: 75.0%, and 66.7% for 2 of 3.",
            "**The zero count is a decision, not an accident.** `successRate` reports `ok == false`, and the caller prints a sentence instead of dividing by zero.",
            "**`if rate, ok := ...; ok {`** scopes `rate` and `ok` to the `if` and its `else`: here a short-lived variable in a block is exactly what you want.",
            "**`_, err = summarize(...)`** reuses the existing `err` with `=`; the blank identifier `_` throws away the summary you do not need.",
        ]),

        h2("8. Your turn"),
        p("The real summary also tells finance which delivered parcel had the most cash, because large amounts are double-checked. Statuses are `delivered`, `failed` and `returned`, and parcels paid online have COD 0. The test runner reads one parcel per line and prints the report; you write `summarize` and `successRate`."),
        challenge("chal_coding_gof_112", "Start from Summary{Parcels: len(parcels)} and only count cash for delivered parcels. For the largest parcel, think about what the zero Parcel looks like and which delivered parcel could be mistaken for 'nothing chosen yet'. Convert to float64 before you divide."),

        h2("9. Pitfalls"),
        bullets([
            "**`v, err := f()` inside a nested block** declares a new `v` that shadows the outer one. Use `=` with `var err error` when `v` already exists.",
            "**Integer division in a ratio**: `a / b * 100` with integers truncates first. Convert with `float64(a) / float64(b)` before dividing.",
            "**Dividing by a count that can be 0**: integers panic, floats give `+Inf` or `NaN`. Check the count first and decide what to report.",
            "**Mixing numeric types**: `int64 / int` does not compile. Convert explicitly, and keep money in one integer type (`int64` VND) everywhere.",
            "**Trusting a zero value as \"not set\"**: 0 is also a real COD amount, and `\"\"` can be a real empty string. Use a separate flag, an `ok` result, or a field you know is never empty (like an id).",
            "**Floats for money**: binary floats cannot store 0.1 exactly. Store the smallest currency unit in an integer.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every `:=` inside an `if`, `for` or `switch` body declares only names that are meant to be new in that block.",
            "Ratios convert to `float64` before the division, and the zero-denominator case has its own output.",
            "Money is an integer in the smallest unit; counts and indexes are `int`.",
            "Conversions between numeric types are explicit and happen where the meaning changes.",
            "Zero values are used on purpose (a sum starting at 0, an empty struct as an empty report), never as a silent fallback.",
            "Code compiles without unused variables or imports, and `go vet` is clean.",
        ]),
        p("Next lesson: slices. The route planner built two drivers' routes from one shared list of stops, and one driver drove the other's route."),
    ],
});
