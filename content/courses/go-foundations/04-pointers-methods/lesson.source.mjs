// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-gof-2-2",
    title: "Pointers & methods: value vs pointer receivers",
    slug: { _type: "slug", current: "go-pointers-methods-receivers" },
    description:
        "Saigon Parcel's end-of-day job marked every scanned parcel as delivered - in a copy - and 214 customers got a 'your parcel is still on the way' SMS for parcels they already had. The same week, the route planner's AddStop method lost every stop it added. Learn when Go copies a value (assignment, calls, range variables, receivers), what & and * do, why a nil pointer panics, how to choose between value and pointer receivers, how to change slice elements in a loop, and what changed for loop variables in Go 1.22.",
    estimatedTime: 20,

    scenario: {
        role: "Junior Go developer on the platform team at Saigon Parcel, a delivery company in Ho Chi Minh City",
        problem:
            "At 21:00 the end-of-day job closes every parcel the drivers scanned at the door. One evening it closed nothing: 214 delivered parcels stayed 'out for delivery', the customers got a follow-up SMS saying their parcel was still on the way, and the support line rang until midnight. The job ran without an error, and its loop looked obviously right.",
    },

    content: [
        h2("1. The incident"),
        p("When a driver hands a parcel over, they scan it at the door. At 21:00 a small Go job, `close-day`, walks through the parcels that were out for delivery and marks every scanned one as delivered. Anything still `out_for_delivery` after that triggers a follow-up SMS the next morning: \"Your parcel is still on the way, we will try again today.\""),
        p("After a refactor that moved the loop into its own function, the job closed nothing. The next morning 214 customers who had their parcel in their hands got that SMS. Many called support to ask whether a second parcel was coming. The job's log said `close-day: done`, there was no error, and the code looked like this:"),
        code("go", String.raw`
// closeDay marks every scanned parcel as delivered.
func closeDay(parcels []Parcel) {
	for _, p := range parcels {
		if p.Scanned {
			p.Status = "delivered"
		}
	}
}`, "closeday.go"),
        p("The same week, the route planner team reported that drivers' routes were empty in the app. Their new method looked just as harmless:"),
        code("go", String.raw`
// AddStop appends a parcel to the driver's route.
func (r Route) AddStop(id string) {
	r.Stops = append(r.Stops, id)
}`, "route.go"),
        bullets([
            "**Both bugs change a copy.** `p` in the loop and `r` in the method are copies of the real data. The copy is changed, then thrown away.",
            "**The compiler and `go vet` are silent.** Assigning to a copy is legal Go, and sometimes it is exactly what you want.",
            "**One rule explains both:** Go copies values on every assignment, every function call, every range variable and every method call with a value receiver.",
        ]),

        h2("2. Reproduce it"),
        p("Save this as `closeday.go` and run it with `go run closeday.go`. `go vet closeday.go` reports nothing:"),
        code("go", String.raw`
package main

import "fmt"

type Parcel struct {
	ID      string
	Status  string // "out_for_delivery", "delivered", ...
	Scanned bool   // the driver scanned the parcel at the door
}

// closeDay marks every scanned parcel as delivered.
func closeDay(parcels []Parcel) {
	for _, p := range parcels {
		if p.Scanned {
			p.Status = "delivered"
		}
	}
}

type Route struct {
	Driver string
	Stops  []string
}

// AddStop appends a parcel to the driver's route.
func (r Route) AddStop(id string) {
	r.Stops = append(r.Stops, id)
}

func main() {
	parcels := []Parcel{
		{"SP-2001", "out_for_delivery", true},
		{"SP-2002", "out_for_delivery", false},
		{"SP-2003", "out_for_delivery", true},
	}
	closeDay(parcels)
	for _, p := range parcels {
		fmt.Println(p.ID, p.Status)
	}

	route := Route{Driver: "Trần Thị Bích"}
	route.AddStop("SP-2004")
	route.AddStop("SP-2005")
	fmt.Println(route.Driver, "has", len(route.Stops), "stops:", route.Stops)
}`, "closeday.go"),
        code("text", String.raw`
$ go run closeday.go
SP-2001 out_for_delivery
SP-2002 out_for_delivery
SP-2003 out_for_delivery
Trần Thị Bích has 0 stops: []`),
        p("SP-2001 and SP-2003 were scanned and should say `delivered`. In `for _, p := range parcels`, `p` is a new variable that receives a **copy** of each element. `p.Status = \"delivered\"` changes that copy, and the copy disappears at the end of the iteration. `AddStop` has the same problem one level up: `r` is a copy of `route`, so the appended stops land in the copy."),

        h2("3. Values are copied"),
        p("A Go variable holds its value directly. A struct variable holds all of its fields, an array variable holds all of its elements. Assigning, passing to a function and ranging all copy that value:"),
        code("go", String.raw`
package main

import "fmt"

type Parcel struct {
	ID     string
	Status string
}

func markDelivered(p Parcel) { p.Status = "delivered" }

func main() {
	a := Parcel{"SP-2001", "out_for_delivery"}
	b := a // b is a full copy of a
	b.Status = "returned"
	fmt.Println(a.Status, b.Status)

	markDelivered(a) // the function gets its own copy
	fmt.Println(a.Status)

	ids := [3]string{"SP-2001", "SP-2002", "SP-2003"}
	copyOfIDs := ids // arrays are values too
	copyOfIDs[0] = "XX"
	fmt.Println(ids[0], copyOfIDs[0])
}
// out_for_delivery returned
// out_for_delivery
// SP-2001 XX`, "copies.go"),
        p("This is a feature: a function that receives a `Parcel` cannot change yours by accident, and two goroutines holding their own copies cannot race on them. But it is not the whole story, because some values **contain references**. A slice is a small header (pointer, length, capacity) that points at a backing array, as you saw in the lesson on slices. Copying a struct copies the slice header, not the array behind it:"),
        code("go", String.raw`
type Shift struct {
	Driver string
	Stops  []string
	Cash   int64
}

a := Shift{Driver: "An", Stops: []string{"SP-2001"}}
b := a
b.Cash = 50_000
b.Stops[0] = "SP-9999" // the copy shares the slice's backing array
fmt.Println(a.Cash, a.Stops, b.Cash, b.Stops)
// 0 [SP-9999] 50000 [SP-9999]`),
        p("`Cash` was copied, so `a.Cash` is still 0. `Stops` was copied as a header that points at the same array, so writing `b.Stops[0]` is visible through `a`. Maps, channels, pointers and slices behave this way; numbers, strings, bools, arrays and structs without such fields are fully copied. This is called a **shallow copy**."),

        h2("4. Pointers: & and *"),
        p("A **pointer** holds the address of a value. `&x` gives the address of `x`; the type of `&x` is `*T` when `x` is a `T`. `*p` is the value the pointer points at. For a pointer to a struct, `p.Status` is short for `(*p).Status`:"),
        code("go", String.raw`
package main

import "fmt"

type Parcel struct {
	ID     string
	Status string
}

func markDelivered(p *Parcel) { p.Status = "delivered" } // p.Status is short for (*p).Status

func main() {
	a := Parcel{"SP-2001", "out_for_delivery"}
	ptr := &a // ptr holds the address of a
	fmt.Printf("%T %v\n", ptr, *ptr)
	markDelivered(ptr)
	fmt.Println(a.Status)

	n := 41
	q := &n
	*q++
	fmt.Println(n, q == &n)

	r := new(Parcel) // a pointer to a new zero Parcel
	r.ID = "SP-2002"
	fmt.Printf("%+v\n", *r)

	var missing *Parcel
	fmt.Println(missing == nil)
	markDelivered(missing)
}`, "pointers.go"),
        code("text", String.raw`
$ go run pointers.go
*main.Parcel {SP-2001 out_for_delivery}
delivered
42 true
{ID:SP-2002 Status:}
true
panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x1 addr=0x18 pc=0x49fd40]

goroutine 1 [running]:
main.markDelivered(...)
	./pointers.go:10
main.main()
	./pointers.go:30 +0x280
exit status 2`),
        bullets([
            "**The pointer is copied, the value is not.** `markDelivered(ptr)` copies the address into the parameter, and both addresses point at `a`.",
            "**The zero value of a pointer is `nil`.** Reading or writing through a nil pointer panics with `invalid memory address or nil pointer dereference`. A function that takes a pointer must either document that nil is not allowed or check for it.",
            "**Returning `&local` is safe.** Go has no dangling pointers: the compiler sees that the address escapes and keeps the value alive (on the heap) as long as something points at it. There is no pointer arithmetic either.",
        ]),

        h2("5. Changing slice elements in a loop"),
        p("Back to `closeDay`. The slice parameter shares its backing array with the caller, so the function can change the caller's parcels - but only through the slice, not through the range copy. Use the index:"),
        code("go", String.raw`
func closeDay(parcels []Parcel) (closed int) {
	for i := range parcels {
		if parcels[i].Scanned {
			parcels[i].Status = "delivered"
			closed++
		}
	}
	return closed
}`),
        p("or take a pointer to the element when the loop body is longer:"),
        code("go", String.raw`
for i := range parcels {
	p := &parcels[i] // a pointer into the slice's backing array, not a copy
	if p.Scanned {
		p.Status = "delivered"
	}
}`),
        p("Both print `SP-2001 delivered`, `SP-2002 out_for_delivery`, `SP-2003 delivered` for the incident data. A third option is a slice of pointers, `[]*Parcel`: then the range variable is a copy of a **pointer**, and it points at the shared `Parcel`:"),
        code("go", String.raw`
parcels := []*Parcel{{"SP-2001", "out_for_delivery"}, {"SP-2002", "out_for_delivery"}}
for _, p := range parcels {
	p.Status = "delivered" // p is a copy of the pointer, and it points at the shared Parcel
}
fmt.Println(parcels[0].Status, parcels[1].Status)
// delivered delivered`),
        image("copies-and-pointers", {
            alt: "Two panels and a table. Left, red panel, titled with the code for _, p := range parcels { p.Status = \"delivered\" }: the backing array holds SP-2001, SP-2002 and SP-2003, all out_for_delivery; a dashed red line labelled copied into p leads from SP-2001 to a red box p: SP-2001 delivered, with the note Only the copy changes, p is dropped after the iteration, the array still says out_for_delivery. Right, green panel, titled for i := range parcels { parcels[i].Status = \"delivered\" }: the array holds SP-2001 delivered, SP-2002 out_for_delivery, SP-2003 delivered, with an arrow up to SP-2001 and the note parcels[i] is the element itself; p := &parcels[i] works too, a pointer into the array, not a copy of the element. Bottom table, Methods follow the same rule, the receiver is just the first parameter: func (r Route) AddStop(id string) - r is a copy of the route, appended stops are lost; func (r *Route) AddStop(id string) - r is the route's address, changes are kept; route.AddStop(\"SP-2004\") - Go passes &route for you when route is addressable (a variable, a slice element, a field of one - not a map value).",
            caption: "A range variable, a parameter and a value receiver are all copies. To change the original, go through the index or a pointer.",
        }),
        h3("Loop variables since Go 1.22"),
        p("Before Go 1.22, a `for` loop had **one** variable `p` that was reused in every iteration, so code that saved `&p` ended up with many pointers to the same variable holding the last element - a famous bug. Since Go 1.22 (with `go 1.22` or newer in `go.mod`), every iteration gets a **new** variable:"),
        code("go", String.raw`
parcels := []Parcel{{"SP-2001"}, {"SP-2002"}, {"SP-2003"}}
var copies []*Parcel
for _, p := range parcels {
	copies = append(copies, &p) // Go 1.22+: a new p in every iteration
}
copies[0].ID = "CHANGED"
fmt.Println(copies[0].ID, copies[1].ID, copies[2].ID, "|", parcels[0].ID)
// CHANGED SP-2002 SP-2003 | SP-2001

var inSlice []*Parcel
for i := range parcels {
	inSlice = append(inSlice, &parcels[i])
}
inSlice[0].ID = "CHANGED"
fmt.Println(parcels[0].ID)
// CHANGED`),
        p("The pointers are now distinct, but they still point at **copies**: changing `copies[0]` does not change `parcels[0]`. Go 1.22 fixed the shared-variable bug, not the copy. When you want pointers to the elements, take `&parcels[i]`."),

        h2("6. Methods and receivers"),
        p("A method is a function with a **receiver**, the parameter written before the name. The receiver follows exactly the same copy rule as any other parameter:"),
        bullets([
            "**Value receiver** `func (r Route) Len() int`: the method gets a copy of the route. Good for small values and methods that only read.",
            "**Pointer receiver** `func (r *Route) AddStop(id string)`: the method gets the address, so it can change the route, and nothing big is copied.",
        ]),
        code("go", String.raw`
package main

import "fmt"

type Route struct {
	Driver string
	Stops  []string
}

// AddStop changes the route, so it needs a pointer receiver.
func (r *Route) AddStop(id string) {
	r.Stops = append(r.Stops, id)
}

// Len only reads the route; a value receiver is fine.
func (r Route) Len() int { return len(r.Stops) }

func main() {
	route := Route{Driver: "Trần Thị Bích"}
	route.AddStop("SP-2004") // Go takes &route for you
	route.AddStop("SP-2005")
	fmt.Println(route.Driver, "has", route.Len(), "stops:", route.Stops)

	p := &route
	fmt.Println(p.Len()) // and *p for you here

	routes := map[string]Route{"bich": route}
	fmt.Println(routes["bich"].Len())
}
// Trần Thị Bích has 2 stops: [SP-2004 SP-2005]
// 2
// 2`, "route.go"),
        p("You do not write `(&route).AddStop(...)`: when the variable is **addressable**, Go takes the address for you, and on a pointer it dereferences for a value method. A map element is not addressable (the map may move its entries when it grows), and neither is a value returned from a function or a literal, so calling a pointer method on them is a compile error:"),
        code("go", String.raw`
routes := map[string]Route{"bich": {}}
routes["bich"].AddStop("SP-2006")
Route{}.AddStop("SP-2007")`),
        code("text", String.raw`
$ go build
./routes.go:9:17: cannot call pointer method AddStop on Route
./routes.go:10:10: cannot call pointer method AddStop on Route`),
        p("For the map, read the value, change it and store it back (`r := routes[\"bich\"]; r.AddStop(id); routes[\"bich\"] = r`), or keep pointers in the map: `map[string]*Route`."),
        h3("Choosing a receiver"),
        numbered([
            "**The method changes the receiver:** pointer receiver. There is no other way.",
            "**The struct is large, or must not be copied** (it holds a `sync.Mutex`, a buffer, a big array): pointer receiver.",
            "**Small, read-only value types** (an amount of money, a point, a date): value receiver; copies are cheap and safe.",
            "**Be consistent.** If any method of a type needs a pointer receiver, give all its methods pointer receivers. Mixed receivers work, but they make it easy to call a value method on a copy and wonder where the change went, and they change which interfaces a value satisfies - the next lesson shows how that breaks `fmt` output.",
        ]),
        callout("info", "Method sets in one sentence",
            "A value of type T has the methods with value receivers; a pointer *T has both the value-receiver and the pointer-receiver methods. That only matters for interfaces: when a method has a pointer receiver, only *T satisfies an interface that needs it. The next lesson is about exactly that."),

        h2("7. The fix"),
        p("The close-day job now walks the slice by index, counts what it closed so the log line means something, and is safe to run twice. The route planner's `AddStop` got a pointer receiver. A small self-check runs the incident data:"),
        code("go", String.raw`
package main

import (
	"fmt"
	"slices"
)

type Parcel struct {
	ID      string
	Status  string
	Scanned bool
}

// closeDay marks every scanned parcel as delivered and returns how many it closed.
func closeDay(parcels []Parcel) (closed int) {
	for i := range parcels {
		p := &parcels[i] // the element in the slice, not a copy
		if p.Scanned && p.Status != "delivered" {
			p.Status = "delivered"
			closed++
		}
	}
	return closed
}

type Route struct {
	Driver string
	Stops  []string
}

func (r *Route) AddStop(id string) { r.Stops = append(r.Stops, id) }

func (r Route) Len() int { return len(r.Stops) }

func check(ok bool, msg string) {
	if !ok {
		panic("check failed: " + msg)
	}
}

func main() {
	parcels := []Parcel{
		{"SP-2001", "out_for_delivery", true},
		{"SP-2002", "out_for_delivery", false},
		{"SP-2003", "out_for_delivery", true},
	}
	check(closeDay(parcels) == 2, "two parcels closed")
	check(parcels[0].Status == "delivered" && parcels[2].Status == "delivered", "scanned parcels delivered")
	check(parcels[1].Status == "out_for_delivery", "unscanned parcel untouched")
	check(closeDay(parcels) == 0, "running it twice changes nothing")

	route := Route{Driver: "Trần Thị Bích"}
	route.AddStop("SP-2004")
	route.AddStop("SP-2005")
	check(slices.Equal(route.Stops, []string{"SP-2004", "SP-2005"}), "stops kept")
	fmt.Println("ok:", parcels[0].Status, route.Len(), "stops")
}
// ok: delivered 2 stops`, "closeday.go"),
        numbered([
            "**Change elements through the slice:** `parcels[i]` or `p := &parcels[i]`, never through the range value.",
            "**Return a count** (`closed`), so the log says `close-day: closed 214` instead of `done`, and a 0 on a busy evening is visible.",
            "**Pointer receivers for methods that change their receiver**, and the same receiver kind for every method of the type.",
            "**A test that checks the data afterwards**, not only that the function returned. The old job had a test that called `closeDay` and checked that it did not panic.",
        ]),

        h2("8. Your turn"),
        p("The driver shift ledger was rewritten with methods and has every bug from this lesson: value receivers on methods that change the driver, a `Find` that returns a pointer to a range copy, and an end-of-shift loop over copies. The test runner reads `driver`, `pickup`, `deliver`, `fail` and `end` commands and prints one line per driver."),
        challenge("chal_fix_gof_221", "Follow one pickup through the code: which Driver does the runner get from Find, and which Driver does Pickup change? Every method that changes the driver needs a pointer receiver - including the small helper they call. Find must return the address of the element in f.drivers (use the index), and EndShift must change the drivers in the slice, not range copies."),

        h2("9. Pitfalls"),
        bullets([
            "**Assigning to the range variable** in `for _, v := range s`: `v` is a copy. Use `s[i]` or `p := &s[i]`.",
            "**A value receiver on a method that changes the receiver**: it compiles, runs and changes a copy. Use a pointer receiver.",
            "**Returning `&v` from a range loop** to give the caller \"the element\": it is the address of a copy. Return `&s[i]`.",
            "**Thinking Go 1.22 made range variables aliases**: it gave each iteration its own variable; it is still a copy.",
            "**Assuming a struct copy is a deep copy**: slices, maps and pointers inside are shared. Use `slices.Clone` or `maps.Clone` when the copy must be independent.",
            "**Calling a method through a nil pointer** that reads a field: `invalid memory address or nil pointer dereference`. Check for nil at the boundary, or make the zero value useful.",
            "**Holding `&s[i]` across an `append` to `s`**: if append reallocates, the pointer points at the old array, as in the slices lesson.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Loops that change elements use the index (`s[i]`) or `&s[i]`.",
            "Every method that changes its receiver has a pointer receiver; a type does not mix receiver kinds without a reason.",
            "Functions that return \"the element\" return a pointer into the collection, or the index, never `&rangeVar`.",
            "Struct copies that must be independent clone their slices and maps.",
            "Pointer parameters are either checked for nil or documented as non-nil.",
            "Tests check the data after the call, not only the return value.",
        ]),
        p("Next lesson: methods and interfaces - and why `fmt.Println(parcel)` printed a raw struct into a customer SMS."),
    ],
});
