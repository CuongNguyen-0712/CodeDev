// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-gof-1-2",
    title: "Slices: the append aliasing bug",
    slug: { _type: "slug", current: "go-slices-append-aliasing-bug" },
    description:
        "A performance pull request made the route planner pre-allocate its list of shared stops. The next morning, Nguyễn Văn An's route started with Trần Thị Bích's first stop, and he drove 14 km to the wrong district. Learn what a slice really is (a pointer, a length and a capacity over an array), how append decides between writing in place and copying, why two appends to the same slice can overwrite each other, how to give every slice its own array with slices.Concat, slices.Clone and full slice expressions, the difference between nil and empty slices, and how to remove elements without changing someone else's slice.",
    estimatedTime: 20,

    scenario: {
        role: "Junior Go developer on the platform team at Saigon Parcel, a delivery company in Ho Chi Minh City",
        problem:
            "The route planner builds every driver's route from the same two stops (the depot in Quận 7 and the sorting hub in Quận 4) followed by the driver's own parcels. After a small optimisation was merged, drivers started the day with other drivers' stops. An went to Thủ Đức instead of Quận 1, Bích reached the same address 20 minutes later, and An's customers in Quận 1 waited until the afternoon.",
    },

    content: [
        h2("1. The incident"),
        p("Every route at Saigon Parcel starts the same way: leave the depot in Quận 7, pick up the parcels at the sorting hub in Quận 4, then drive to the driver's own stops. The planner keeps those two shared stops in a slice called `prefix` and appends each driver's stops to it."),
        p("On Friday a colleague merged a small performance change. Profiling had shown the planner reallocating slices thousands of times per run, so the function that loads the prefix now reserves room for the 14 stops a driver usually has. The tests passed, the benchmark was 30% faster, and the change was two lines long."),
        p("On Monday at 07:30, Nguyễn Văn An's phone showed his first stop as `SP-2101@thu-duc`. That parcel belonged to Trần Thị Bích. An drove 14 km to Thủ Đức and found Bích arriving at the same address 20 minutes later. Meanwhile his own first customer in Quận 1, parcel `SP-2001`, was not on anyone's route. Six of the 42 drivers had the same problem: always the drivers planned **before** another driver, never the last one."),

        h2("2. Reproduce it"),
        p("The planner, cut down to two drivers. `loadPrefix` is the function from Friday's change:"),
        code("go", String.raw`
package main

import (
	"fmt"
	"strings"
)

// loadPrefix returns the stops every route starts with. It reserves room for
// the usual 14 stops per driver, so planning does not reallocate.
func loadPrefix() []string {
	prefix := make([]string, 0, 16)
	return append(prefix, "depot-q7", "hub-q4")
}

func main() {
	prefix := loadPrefix()
	an := append(prefix, "SP-2001@q1", "SP-2002@q3")
	bich := append(prefix, "SP-2101@thu-duc")

	fmt.Println("an:  ", strings.Join(an, " > "))
	fmt.Println("bich:", strings.Join(bich, " > "))
}`, "routes.go"),
        code("text", String.raw`
$ go run routes.go
an:   depot-q7 > hub-q4 > SP-2101@thu-duc > SP-2002@q3
bich: depot-q7 > hub-q4 > SP-2101@thu-duc`),
        p("Bích's route is right. An's route has Bích's stop in third place, and his own `SP-2001@q1` is gone. `go vet` has nothing to say, and the race detector would not help either: there is only one goroutine. Before Friday, `loadPrefix` returned `[]string{\"depot-q7\", \"hub-q4\"}`, and the same `main` printed two correct routes. The only difference is the `16` in `make`."),
        p("To see why one number changes the result, you need to know what a slice is."),

        h2("3. Arrays and slices"),
        p("An **array** has a fixed length that is part of its type: `[5]string` is five strings, and `[4]string` is a different type. Arrays are values: assigning one copies every element. You rarely use arrays directly in Go."),
        p("A **slice** is a small descriptor - Go calls it the slice header - with three fields:"),
        bullets([
            "**a pointer** to an element of an underlying array, the **backing array**;",
            "**the length**, `len(s)`: how many elements the slice shows;",
            "**the capacity**, `cap(s)`: how many elements there are from that pointer to the end of the backing array.",
        ]),
        p("Copying a slice, passing it to a function or slicing it with `s[low:high]` copies only the header. The elements stay where they are, in the one backing array that all those headers point to. Watch what that means:"),
        code("go", String.raw`
package main

import "fmt"

func main() {
	stops := [5]string{"depot-q7", "hub-q4", "SP-2001@q1", "SP-2002@q3", "SP-2003@q1"}
	copyOfArray := stops // arrays are values: this copies all 5 strings
	copyOfArray[0] = "depot-thu-duc"
	fmt.Println(stops[0], copyOfArray[0])

	all := stops[:]  // a slice of the whole array: len 5, cap 5
	q1 := stops[2:4] // elements 2 and 3: len 2, cap 3 (up to the end of the array)
	fmt.Println(len(all), cap(all), len(q1), cap(q1), q1)

	q1[0] = "SP-2001@q1-CANCELLED" // writes into the shared array
	fmt.Println(stops[2], all[2])

	q1 = append(q1, "SP-9999@q1") // len 2 < cap 3: written in place, into stops[4]
	fmt.Println(stops[4], len(q1), cap(q1))

	q1 = append(q1, "SP-9998@q1") // len 3 == cap 3: a new array, q1 no longer shares
	q1[0] = "changed"
	fmt.Println(stops[2], q1[0], len(q1), cap(q1))
}`, "header.go"),
        code("text", String.raw`
depot-q7 depot-thu-duc
5 5 2 3 [SP-2001@q1 SP-2002@q3]
SP-2001@q1-CANCELLED SP-2001@q1-CANCELLED
SP-9999@q1 3 3
SP-2001@q1-CANCELLED changed 4 6`),
        bullets([
            "**`stops[2:4]`** has length 4 - 2 = 2 and capacity 5 - 2 = 3: the capacity runs to the end of the array, not to `high`.",
            "**Writing `q1[0]`** changes `stops[2]`, and `all[2]` shows the change: three names, one element.",
            "**The first `append`** fits in the capacity, so it writes into `stops[4]` - an element that `q1` could not even see before. `SP-2003@q1` is overwritten.",
            "**The second `append`** does not fit: Go allocates a new, bigger array, copies the elements and returns a header pointing there. From then on `q1` and `stops` are independent.",
        ]),

        h2("4. How append decides"),
        p("`append(s, x...)` always returns a slice, and the rule for where it puts the new elements is short:"),
        numbered([
            "**If `len(s) + len(x) <= cap(s)`**, append writes the new elements into the backing array right after `s`'s last element, and returns a header with the same pointer and a bigger length. **Nothing is copied**, and whatever was in those slots before is overwritten.",
            "**Otherwise**, append allocates a new backing array (roughly double the size for small slices), copies `s` into it, adds the new elements and returns a header pointing to the new array.",
        ]),
        p("Now the incident is plain. `prefix` has length 2 and capacity 16. `an := append(prefix, ...)` fits, so it writes slots 2 and 3 of `prefix`'s array and returns a header with length 4. `prefix` itself is unchanged - it still has length 2 - so `bich := append(prefix, ...)` also fits, and writes slot 2 **again**. `an` and `bich` share the array, and the last append wins. With the old literal, capacity was 2: both appends had to copy, and each route got its own array."),
        image("shared-backing-array", {
            alt: "Three slice headers at the top: prefix with len 2 and cap 16, an with len 4 and cap 16, and bich with len 3 and cap 16. Arrows from all three point to slot 0 of the same backing array of 16 slots, with a note that all three ptr fields hold the same address. The array holds depot-q7 in slot 0, hub-q4 in slot 1, SP-2101@thu-duc in slot 2 with a note that it was SP-2001@q1 from an, SP-2002@q3 in slot 3, and empty slots 4 to 15. Coloured bars show that prefix sees slots 0 to 1, an sees slots 0 to 3 and bich sees slots 0 to 2. Step 1: an := append(prefix, 2 stops) has len 2 below cap 16, so it writes slots 2 and 3 in place without a copy. Step 2: bich := append(prefix, 1 stop) writes slot 2 again because prefix still has len 2, so an's first stop is now bich's stop. A green box at the bottom gives the fix: slices.Concat(prefix, stops) always allocates, and so does slices.Clone(prefix) before append; prefix[:n:n] is a full slice expression that sets cap to len, so the next append must copy.",
            caption: "append never asks who else uses the array. While there is capacity, it writes.",
        }),
        h3("Capacity is an implementation detail"),
        p("How much capacity append adds is not part of the language. This loop prints the capacity every time it changes (Go 1.26, `[]string`):"),
        code("go", String.raw`
var route []string
prevCap := -1
for i := range 40 {
	route = append(route, fmt.Sprint("SP-", i))
	if cap(route) != prevCap {
		fmt.Printf("len %2d cap %2d\n", len(route), cap(route))
		prevCap = cap(route)
	}
}
// len  1 cap  2
// len  3 cap  4
// len  5 cap  8
// len  9 cap 16
// len 17 cap 32
// len 33 cap 71`),
        p("The growth roughly doubles, but it is also rounded to the memory allocator's size classes, so you get odd numbers like 71. Other Go versions give other numbers. That is the real lesson of the incident: code that is only correct because append happens to copy is a bug waiting for a different capacity - a `make` with a size hint, a slice that was re-sliced, a new Go release."),
        h3("Passing slices to functions"),
        p("A function receives a copy of the header. It can change the **elements** the caller sees, but not the caller's **length**: if the function appends, the caller's header still has the old length. That is why `append` returns the slice, and why functions that grow a slice return it too:"),
        code("go", String.raw`
package main

import "fmt"

func addReturnLeg(route []string) {
	route = append(route, "depot-q7") // changes the local header only
}

func markFirstDone(route []string) {
	route[0] = route[0] + " (done)" // changes the shared element
}

func withReturnLeg(route []string) []string {
	return append(route, "depot-q7")
}

func main() {
	route := []string{"depot-q7", "SP-2001@q1"}
	addReturnLeg(route)
	markFirstDone(route)
	fmt.Println(len(route), route)
	route = withReturnLeg(route)
	fmt.Println(len(route), route)
}`, "fn.go"),
        code("text", String.raw`
2 [depot-q7 (done) SP-2001@q1]
3 [depot-q7 (done) SP-2001@q1 depot-q7]`),
        p("Always use the result of `append`: `s = append(s, x)`. Discarding it is a bug, and keeping it under another name (`t := append(s, x)`) is exactly the pattern that can make `s` and `t` share an array."),
        challenge("chal_quiz_gof_121", "For each append, write down len and cap of the slice it is called on and decide: in place or copy? For the second question, ask whether the slice that receives the append still has spare capacity in prefix's array, and whether the result really contains prefix's stops."),

        h2("5. Giving every slice its own array"),
        p("When a slice will be extended by more than one owner, give each owner its own backing array. Go has three idiomatic ways:"),
        code("go", String.raw`
package main

import (
	"fmt"
	"slices"
	"strings"
)

func loadPrefix() []string {
	prefix := make([]string, 0, 16)
	return append(prefix, "depot-q7", "hub-q4")
}

func main() {
	prefix := loadPrefix()

	// 1. slices.Concat always allocates a new backing array (Go 1.22).
	an := slices.Concat(prefix, []string{"SP-2001@q1", "SP-2002@q3"})
	bich := slices.Concat(prefix, []string{"SP-2101@thu-duc"})
	fmt.Println("an:  ", strings.Join(an, " > "))
	fmt.Println("bich:", strings.Join(bich, " > "))

	// 2. slices.Clone, then append to the clone.
	chau := append(slices.Clone(prefix), "SP-2201@go-vap")

	// 3. A full slice expression a[low:high:max] caps the capacity, so append must copy.
	capped := prefix[:len(prefix):len(prefix)]
	dung := append(capped, "SP-2301@binh-thanh")
	ha := append(capped, "SP-2401@q3")

	fmt.Println(chau[2], dung[2], ha[2], len(prefix), cap(prefix), cap(capped))
	fmt.Println(strings.Join(prefix[:cap(prefix)][:4], "|"))
}`, "fix.go"),
        code("text", String.raw`
an:   depot-q7 > hub-q4 > SP-2001@q1 > SP-2002@q3
bich: depot-q7 > hub-q4 > SP-2101@thu-duc
SP-2201@go-vap SP-2301@binh-thanh SP-2401@q3 2 16 2
depot-q7|hub-q4||`),
        bullets([
            "**`slices.Concat(a, b, ...)`** builds a new slice from several slices, sized exactly. It is the clearest way to say \"prefix followed by these stops\".",
            "**`slices.Clone(s)`** returns a copy with its own array. Use it when you hand a slice to code that may append to it or change it - or when you store a slice you received and do not want later changes by the caller to show up.",
            "**`s[low:high:max]`**, the full slice expression, sets the capacity to `max - low`. With `max == high`, the next append has no room and must copy. It is cheap, but easy to miss when reading; prefer `Concat` or `Clone` unless you are writing a library function that returns a view.",
            "**The last line** proves that `prefix`'s spare slots were never touched: reslicing up to `cap` shows slots 2 and 3 still empty.",
        ]),
        callout("tip", "A small sub-slice can keep a big array alive",
            "Slicing never copies, so a 3-element slice taken from a 10 MB array keeps the whole 10 MB in memory for as long as the small slice lives. When you keep a small part of a big slice (the first lines of a big file, a few rows of a large result), store slices.Clone(part) instead of the part itself."),

        h2("6. nil and empty slices"),
        p("The zero value of a slice is `nil`: no array, length 0, capacity 0. `len`, `range` and `append` all work on a nil slice, so you rarely need to tell the difference. One place where it shows is JSON:"),
        code("go", String.raw`
package main

import (
	"encoding/json"
	"fmt"
)

type Route struct {
	Driver string   ` + "`json:\"driver\"`" + String.raw`
	Stops  []string ` + "`json:\"stops\"`" + String.raw`
}

func main() {
	var none []string
	empty := []string{}
	fmt.Println(none == nil, empty == nil, len(none), len(empty))
	a, _ := json.Marshal(Route{Driver: "ha", Stops: none})
	b, _ := json.Marshal(Route{Driver: "ha", Stops: empty})
	fmt.Println(string(a))
	fmt.Println(string(b))
}`, "nil.go"),
        code("text", String.raw`
true false 0 0
{"driver":"ha","stops":null}
{"driver":"ha","stops":[]}`),
        p("A driver with no stops today is a nil slice in the planner, and the tracking API sends `\"stops\": null`. The driver app expected an array and crashed for Võ Thị Hà on her day off - a second ticket from the same week. When an API promises an array, return `[]string{}` (or make the client accept `null`); inside your own code, check `len(s) == 0`, never `s == nil`."),

        h2("7. Removing elements without surprises"),
        p("The classic way to remove element `i` is `append(s[:i], s[i+1:]...)`. Look at what it does to the original slice:"),
        code("go", String.raw`
package main

import (
	"fmt"
	"slices"
)

func main() {
	planned := []string{"depot-q7", "hub-q4", "SP-2001@q1", "SP-2002@q3"}
	today := append(planned[:2], planned[3:]...) // drop SP-2001@q1
	fmt.Println(today)
	fmt.Println(planned)

	planned = []string{"depot-q7", "hub-q4", "SP-2001@q1", "SP-2002@q3"}
	today = slices.Delete(planned, 2, 3)
	fmt.Println(today)
	fmt.Printf("%q\n", planned)
}`, "del.go"),
        code("text", String.raw`
[depot-q7 hub-q4 SP-2002@q3]
[depot-q7 hub-q4 SP-2002@q3 SP-2002@q3]
[depot-q7 hub-q4 SP-2002@q3]
["depot-q7" "hub-q4" "SP-2002@q3" ""]`),
        p("`planned[:2]` has capacity 4, so the append writes `SP-2002@q3` into slot 2 **of `planned`'s array**. `today` is right, but `planned` now shows `SP-2002@q3` twice. `slices.Delete(s, i, j)` (Go 1.21) is clearer about it: it removes `s[i:j]` **in place**, returns the shorter slice, and since Go 1.22 sets the now-unused slots at the end to the zero value, so the old header shows an empty string. Both are fine when nobody else holds the old slice. When someone does - a planned route kept for the evening report, a slice you received as an argument - removing in place changes their data."),
        p("The `slices` package has the other everyday operations too: `slices.Index(s, v)` and `slices.Contains(s, v)` to search, `slices.Insert(s, i, v...)`, `slices.Equal(a, b)`, `slices.Sort(s)` and `slices.Reverse(s)`. Read each one's documentation for one fact: does it return a new slice, or work in place?"),

        h2("8. The fix"),
        p("The planner now builds each route with `slices.Concat`, and the test that should have existed on Friday plans two drivers from a prefix with spare capacity, then checks both routes and the prefix:"),
        code("go", String.raw`
package main

import (
	"fmt"
	"slices"
)

// planRoute returns prefix followed by stops in a new backing array:
// it never writes into prefix's spare capacity.
func planRoute(prefix, stops []string) []string {
	return slices.Concat(prefix, stops)
}

func main() {
	prefix := make([]string, 0, 16) // spare capacity on purpose: this is what broke Monday
	prefix = append(prefix, "depot-q7", "hub-q4")

	an := planRoute(prefix, []string{"SP-2001@q1", "SP-2002@q3"})
	bich := planRoute(prefix, []string{"SP-2101@thu-duc"})

	check := func(name string, got, want []string) {
		if !slices.Equal(got, want) {
			panic(fmt.Sprintf("%s: got %q, want %q", name, got, want))
		}
	}
	check("an", an, []string{"depot-q7", "hub-q4", "SP-2001@q1", "SP-2002@q3"})
	check("bich", bich, []string{"depot-q7", "hub-q4", "SP-2101@thu-duc"})
	check("prefix", prefix, []string{"depot-q7", "hub-q4"})
	fmt.Println("ok: 2 routes, prefix unchanged")
}
// ok: 2 routes, prefix unchanged`, "planner.go"),
        numbered([
            "**`slices.Concat`** makes the independence explicit: every route owns its array, whatever the capacity of `prefix`.",
            "**The test uses a prefix with spare capacity on purpose.** A test with a literal `[]string{...}` (capacity == length) passes with the buggy code too - that is how Friday's change got through.",
            "**The test checks the input as well as the outputs.** \"My function did not change its arguments\" is a property worth asserting.",
            "**The performance win stays.** `Concat` allocates exactly once per route; the reallocations the profiler found came from appending one stop at a time.",
        ]),

        h2("9. Your turn"),
        p("The real planner has a second function with the same family of bug. When a customer cancels a stop during the day, `withoutStop` gives the driver a new route without it, and the planned route must stay unchanged for the evening report. The test runner reads the prefix, the drivers and the cancellations, then prints the current routes, the planned routes and the prefix."),
        challenge("chal_fix_gof_122", "There are two bugs. For buildRoutes, ask whether the slice you append to can have spare capacity. For withoutStop, ask who else holds route: the runner keeps the planned routes, and every removal that works in place shifts the stops inside the caller's slice."),

        h2("10. Pitfalls"),
        bullets([
            "**`b := append(a, x)` and later `c := append(a, y)`**: if `a` has spare capacity, `b` and `c` share an array and the second append overwrites the first. Use `slices.Concat` or `slices.Clone`.",
            "**Assuming append copies**: it copies only when the capacity is exhausted, and how much capacity there is depends on `make`, earlier appends and the Go version.",
            "**Ignoring append's result**: `append(s, x)` without `s = ` loses the element, and a function that appends must return the slice.",
            "**Sub-slices are views**: writing through `s[2:4]` changes the original, and appending to it can overwrite elements after `high`.",
            "**Removing in place from a slice someone else holds**: `append(s[:i], s[i+1:]...)` and `slices.Delete` shift the caller's elements. Clone first when the old slice must stay valid.",
            "**`s == nil` as \"empty\"**: use `len(s) == 0`. And remember that a nil slice encodes as `null` in JSON.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Every slice that more than one piece of code will append to has its own backing array (`slices.Concat`, `slices.Clone`, or `s[:n:n]`).",
            "The result of `append` is always assigned back, and functions that grow a slice return it.",
            "Functions that receive a slice either do not change it or say so in their doc comment.",
            "Removals use `slices.Delete` on a slice the code owns, or on a clone.",
            "Tests build their input slices with spare capacity (`make([]T, 0, n)`) and check that inputs are unchanged.",
            "APIs that promise a JSON array never send a nil slice.",
        ]),
        p("Next lesson: maps and structs. The tracking service panicked with \"assignment to entry in nil map\", and the daily report came out in a different order every day."),
    ],
});
