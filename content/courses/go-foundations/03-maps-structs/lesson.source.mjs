// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-gof-2-1",
    title: "Maps & structs",
    slug: { _type: "slug", current: "go-maps-structs" },
    description:
        "The morning Saigon Parcel opened its Thủ Đức depot, the first parcel scanned there crashed the tracking service with \"panic: assignment to entry in nil map\". The same week, finance complained that the district report came out in a different order every day. Learn how Go maps work (make, literals, the comma-ok lookup, delete, counting with the zero value), why a nil map can be read but not written, why iteration order is random and how to sort keys with slices.Sorted(maps.Keys(m)), how structs are declared, compared and used as map keys, and why m[k].Field++ does not compile when the map holds struct values.",
    estimatedTime: 20,

    scenario: {
        role: "Junior Go developer on the platform team at Saigon Parcel, a delivery company in Ho Chi Minh City",
        problem:
            "trackd, the tracking service, counts parcels per district and status for the live dashboard. At 08:02 on the day the Thủ Đức depot opened, the first Thủ Đức scan made trackd panic. It restarted, replayed the scan and panicked again, for four minutes, until someone removed the district from the config. No customer could track a parcel during that time.",
    },

    content: [
        h2("1. The incident"),
        p("`trackd` is the service behind the \"Where is my parcel?\" page. It also keeps live counters for the operations dashboard: how many parcels each district has delivered, failed or returned today. The counters are kept in memory, grouped by district, and the code that adds a district on its first parcel was written a year ago, when the five districts were created on start-up from the config file."),
        p("On Monday Saigon Parcel opened a depot in Thủ Đức. The operations team added `thu-duc` to the delivery zones, but not to trackd's config. At 08:02 a driver scanned the first Thủ Đức parcel as delivered, and trackd's log filled with the same lines, every few seconds:"),
        code("text", String.raw`
panic: assignment to entry in nil map

goroutine 1 [running]:
main.record(...)
	./main.go:21
main.main()
	./main.go:28 +0x29f`),
        p("The service restarted, replayed the scan from its queue, and crashed again. For four minutes no customer could track a parcel. Then someone added `thu-duc` to the config and restarted it by hand."),
        p("The same week, the finance team asked why the evening district report \"changes every day\". It did not change: the numbers were right. Only the **order** of the lines was different every run, and their reconciliation script compared the report line by line with the previous version."),

        h2("2. Reproduce it"),
        p("The counter code, cut down to its core. Each district has a `DistrictStats` with a map from status to count:"),
        code("go", String.raw`
package main

import "fmt"

type DistrictStats struct {
	Name     string
	ByStatus map[string]int // status -> number of parcels
}

var stats = map[string]DistrictStats{
	"q1": {Name: "q1", ByStatus: map[string]int{}},
	"q3": {Name: "q3", ByStatus: map[string]int{}},
}

func record(district, status string) {
	s, ok := stats[district]
	if !ok {
		s = DistrictStats{Name: district} // first parcel in a new district
		stats[district] = s
	}
	s.ByStatus[status]++
}

func main() {
	record("q1", "delivered")
	record("q3", "failed")
	fmt.Println("q1:", stats["q1"].ByStatus, "q3:", stats["q3"].ByStatus)
	record("thu-duc", "delivered")
	fmt.Println("never printed")
}`, "trackd.go"),
        code("text", String.raw`
$ go run trackd.go
q1: map[delivered:1] q3: map[failed:1]
panic: assignment to entry in nil map

goroutine 1 [running]:
main.record(...)
	./trackd.go:21
main.main()
	./trackd.go:28 +0x29f
exit status 2`),
        p("Line 21 is `s.ByStatus[status]++`. For `q1` it works; for `thu-duc` it panics. The branch for a new district builds `DistrictStats{Name: district}` and leaves `ByStatus` out, so `ByStatus` has its zero value - and the zero value of a map is `nil`. Before Monday, that branch had never run: every district came from the config, where the map was created."),
        p("There is a second, quieter surprise in this code: `s` is a **copy** of the struct in the map, yet the counts for `q1` do show up in `stats`. To see why both things happen, start with how maps work."),

        h2("3. Maps"),
        p("A map stores values by key: `map[string]int` maps strings to ints. The key type must be **comparable** with `==` (strings, numbers, booleans, pointers, and structs or arrays made of those); slices, maps and functions cannot be keys. The everyday operations:"),
        code("go", String.raw`
package main

import (
	"fmt"
	"maps"
	"slices"
)

func main() {
	parcels := map[string]int{"q1": 412, "q3": 268} // a map literal
	parcels["binh-thanh"] = 305                     // add or replace
	parcels["q1"]++                                 // read, add 1, write back

	fmt.Println(parcels["q1"], parcels["go-vap"], len(parcels)) // missing key: zero value

	n, ok := parcels["go-vap"] // comma-ok: was the key there?
	fmt.Println(n, ok)
	if n, ok := parcels["q3"]; ok {
		fmt.Println("q3 has", n)
	}

	delete(parcels, "q3") // no error if the key is missing
	delete(parcels, "nowhere")
	for _, d := range slices.Sorted(maps.Keys(parcels)) {
		fmt.Println(d, parcels[d])
	}

	byDriver := make(map[string][]string)              // make with an element type
	byDriver["an"] = append(byDriver["an"], "SP-2001") // nil slice + append works
	byDriver["an"] = append(byDriver["an"], "SP-2002")
	fmt.Println(byDriver, len(byDriver["bich"]))
}`, "maps.go"),
        code("text", String.raw`
413 0 3
0 false
q3 has 268
binh-thanh 305
q1 413
map[an:[SP-2001 SP-2002]] 0`),
        bullets([
            "**A missing key reads as the zero value.** That makes `counts[k]++` and `m[k] = append(m[k], v)` work without a \"first time\" check - the most common Go idioms with maps.",
            "**Use comma-ok when 0 is a real value.** `parcels[\"go-vap\"]` is 0 whether go-vap has no parcels or is not in the map; `n, ok := parcels[\"go-vap\"]` tells the two apart.",
            "**`delete(m, k)`** removes a key; deleting a missing key does nothing. **`clear(m)`** (Go 1.21) removes every key.",
            "**`len(m)`** is the number of keys.",
        ]),
        h3("A nil map can be read, not written"),
        p("`var m map[string]int` declares a map variable without creating a map: `m` is `nil`. Reading from it, `len` and `range` all behave like an empty map. Writing to it panics with `assignment to entry in nil map`. A map must be created with `make(map[K]V)` or a literal `map[K]V{}` before the first write - and a map that is a struct field, like `ByStatus`, is `nil` until someone creates it."),
        h3("Iteration order is random"),
        p("`for k, v := range m` visits every key once, in an order the language deliberately leaves unspecified. The runtime even picks a random starting point on every loop, so code cannot come to depend on one order by accident. Three loops over the same map, in one run:"),
        code("go", String.raw`
parcels := map[string]int{"q1": 412, "q3": 268, "binh-thanh": 305, "go-vap": 190, "thu-duc": 57}
for range 3 {
	for d, n := range parcels {
		fmt.Print(d, "=", n, " ")
	}
	fmt.Println()
}
// q1=412 q3=268 binh-thanh=305 go-vap=190 thu-duc=57
// binh-thanh=305 go-vap=190 thu-duc=57 q1=412 q3=268
// q1=412 q3=268 binh-thanh=305 go-vap=190 thu-duc=57`),
        p("That is the finance report's \"changing\" order. Whenever order matters - a report, a file, a test's expected output, an API response - sort the keys first: `slices.Sorted(maps.Keys(m))` (Go 1.23) returns the keys as a sorted slice. Note that `fmt.Println(m)` prints maps with sorted keys, which is why a quick debug print looks stable while a `range` loop is not."),
        h3("Maps are references"),
        p("A map value is a small handle to the data. Assigning a map or passing it to a function does not copy the entries: both names see every change. Use `maps.Clone(m)` when you need an independent copy:"),
        code("go", String.raw`
package main

import (
	"fmt"
	"maps"
)

func resetFailed(counts map[string]int) {
	counts["failed"] = 0
}

func main() {
	today := map[string]int{"delivered": 38, "failed": 4}
	snapshot := today
	backup := maps.Clone(today)
	resetFailed(today)
	fmt.Println(today["failed"], snapshot["failed"], backup["failed"])
	clear(today)
	fmt.Println(len(today), len(snapshot), len(backup))
}`, "ref.go"),
        code("text", String.raw`
0 0 4
0 0 2`),
        callout("warning", "Maps are not safe for concurrent writes",
            "A map may be read by many goroutines at once, but if one goroutine writes while another reads or writes, the program is incorrect, and the runtime often stops it with fatal error: concurrent map writes - which, unlike a panic, cannot be recovered. A service like trackd that updates counters from several request handlers needs a sync.Mutex around the map (or sync.Map). The concurrency course covers this; until then, keep each map owned by one goroutine."),

        h2("4. Structs"),
        p("A struct groups named fields into one type. You create one with a **composite literal**; name the fields, so adding a field later does not break the literal, and every field you leave out gets its zero value:"),
        code("go", String.raw`
type Parcel struct {
	ID       string
	District string
	COD      int64 // VND
	Fragile  bool
}

p := Parcel{ID: "SP-3001", District: "q1", COD: 250_000} // Fragile is false
p.Fragile = true
q := p                 // structs are values: q is a full copy
q.District = "thu-duc" // p.District is still "q1"`),
        p("Structs whose fields are all comparable can be compared with `==` (field by field) and used as map keys. That gives a clean alternative to a map of maps: one flat map whose key holds both parts:"),
        code("go", String.raw`
package main

import "fmt"

type Stats struct {
	Parcels   int
	Delivered int
}

type Key struct {
	District string
	Status   string
}

func main() {
	// 1. Read, change the copy, write back.
	stats := map[string]Stats{}
	s := stats["q1"] // zero Stats if missing
	s.Parcels++
	s.Delivered++
	stats["q1"] = s
	fmt.Printf("%+v\n", stats["q1"])

	// 2. Store pointers: the map holds addresses, the struct can be changed in place.
	byPtr := map[string]*Stats{}
	if byPtr["q3"] == nil {
		byPtr["q3"] = &Stats{}
	}
	byPtr["q3"].Parcels++
	fmt.Printf("%+v\n", *byPtr["q3"])

	// 3. A struct key instead of a map inside a map.
	counts := map[Key]int{}
	counts[Key{"q1", "delivered"}]++
	counts[Key{"q1", "delivered"}]++
	counts[Key{"q1", "failed"}]++
	fmt.Println(counts[Key{"q1", "delivered"}], counts[Key{"q1", "failed"}], len(counts))

	a := Key{"q1", "delivered"}
	b := Key{District: "q1", Status: "delivered"}
	fmt.Println(a == b)
}`, "structs.go"),
        code("text", String.raw`
{Parcels:1 Delivered:1}
{Parcels:1 Delivered:0}
2 1 2
true`),
        h3("m[k].Field++ does not compile"),
        p("Why the detour in variant 1? Because the obvious line is rejected:"),
        code("go", String.raw`
stats := map[string]Stats{"q1": {}}
stats["q1"].Delivered++`),
        code("text", String.raw`
./main.go:10:2: cannot assign to struct field stats["q1"].Delivered in map`),
        p("`stats[\"q1\"]` is not a variable you can change in place: the map may move its entries around as it grows, so it only hands out copies. You either read the struct, change the copy and store it back, or store pointers (`map[string]*Stats`) so the map holds addresses and the structs stay put. Variant 1 is the default for small structs. With pointers, remember that a missing key gives a `nil` pointer, and `byPtr[\"q9\"].Parcels++` panics with `invalid memory address or nil pointer dereference`."),
        h3("Back to trackd: the copy that shared a map"),
        p("Now both observations from section 2 make sense. `s, ok := stats[district]` copies the `DistrictStats` out of the map. For `q1`, the copy's `ByStatus` field holds the same map handle as the original, so `s.ByStatus[status]++` writes into the one inner map that both share - it worked by luck, not by design. For `thu-duc`, the new struct's `ByStatus` is `nil`, and writing to it panics."),
        image("struct-copy-nil-map", {
            alt: "A diagram in three parts. The top, green part is titled d = \"q1\": the district already exists. A box for the struct in the map, stats[\"q1\"], shows Name \"q1\" and ByStatus: ptr, and a dashed box for the copy s shows Name \"q1\" and ByStatus: same ptr; arrows from both point to one inner map holding delivered: 1, written through the copy and seen by both, with the note: works, by luck of sharing, a map value is a reference. The middle, red part is titled d = \"thu-duc\": a new district, s = DistrictStats{Name: d}. A box for the new s and its copy in the map shows Name \"thu-duc\" and ByStatus: nil, with an arrow to a dashed box saying no map at all (zero value), reading gives 0, writing panics, and the label panic: assignment to entry in nil map. The bottom box lists the rules: m[k] returns a copy of a struct value, so changing s.Parcels does not change the map until you write stats[d] = s; fields that are maps, slices or pointers are copied as references and the copy and the original share what they point to; the zero value of a map field is nil, so make the map in a constructor or use one flat map[Key]int instead.",
            caption: "Copying a struct copies its fields. A map field is a handle, so the copy shares the map - unless there is no map yet.",
        }),
        challenge("chal_quiz_gof_211", "For the first question, separate reading from writing: which of the two does a nil map allow? For the second, ask for each line whether m[k] is something you can assign to, and what a missing key gives you for each element type."),

        h2("5. The fix"),
        p("The fix removes the struct with a map inside it: one flat map keyed by a `Key{District, Status}` struct, created once at start-up. A new district needs no special case, because a missing key starts at 0. The report sorts its keys, so it prints in the same order every run:"),
        code("go", String.raw`
package main

import (
	"cmp"
	"fmt"
	"maps"
	"slices"
)

// Key identifies one counter: the parcels in a district with a status.
type Key struct {
	District string
	Status   string
}

// stats is made once, at start-up. There is no struct with a map inside
// that could be left nil, and no "new district" branch at all.
var stats = make(map[Key]int)

func record(district, status string) {
	stats[Key{district, status}]++ // a missing key starts at 0
}

// reportLines returns the counters sorted by district, then status: the same order every run.
func reportLines() []string {
	keys := slices.SortedFunc(maps.Keys(stats), func(a, b Key) int {
		return cmp.Or(cmp.Compare(a.District, b.District), cmp.Compare(a.Status, b.Status))
	})
	lines := make([]string, 0, len(keys))
	for _, k := range keys {
		lines = append(lines, fmt.Sprintf("%s %s %d", k.District, k.Status, stats[k]))
	}
	return lines
}

func main() {
	record("q1", "delivered")
	record("q3", "failed")
	record("thu-duc", "delivered") // the new district: no panic
	record("q1", "delivered")
	record("q1", "failed")
	for _, line := range reportLines() {
		fmt.Println(line)
	}
}
// q1 delivered 2
// q1 failed 1
// q3 failed 1
// thu-duc delivered 1`, "trackd.go"),
        numbered([
            "**One flat map with a struct key** replaces a map of structs that each held a map: fewer places where a nil map can hide, and no copy-and-write-back.",
            "**`make` at start-up**: the map exists before the first request, whatever the config says.",
            "**`slices.SortedFunc` with `cmp.Compare`** sorts by district, then status. `cmp.Or` (Go 1.22) returns its first non-zero argument, which is exactly \"compare by the first field, and by the second only on a tie\".",
            "**When a struct really needs a map field**, give it a constructor (`func NewDistrictStats(name string) DistrictStats`) that makes the map, and never build the struct with a literal elsewhere.",
        ]),

        h2("6. Your turn"),
        p("The evening district report is built from the tracking events of the day. A parcel has several events (out for delivery, failed, out again, delivered), and only its **last** event counts. The test runner reads the events in time order and prints one line per district, sorted by name, then the busiest district."),
        challenge("chal_coding_gof_212", "Two maps do the job: one from parcel id to its last event (a later event simply overwrites an earlier one), then one from district to its DistrictReport. A struct read from a map is a copy, so write it back after changing it. The order comes from sorting the district names, never from ranging over the map."),

        h2("7. Pitfalls"),
        bullets([
            "**Writing to a nil map**: `var m map[K]V` and a map field in a struct literal are `nil`. Create maps with `make` or a literal before the first write.",
            "**Depending on iteration order**: `range` over a map is random on purpose. Sort the keys for anything a person or a test will compare.",
            "**`m[k].Field = v` on a map of structs** does not compile. Read, modify, write back - or store pointers and handle the `nil` for a missing key.",
            "**Assuming a struct copy is independent**: map, slice and pointer fields still share their data with the original.",
            "**Using the zero value when absence matters**: use `v, ok := m[k]` to tell \"missing\" from \"present with value 0\".",
            "**Concurrent writes**: a map shared between goroutines needs a mutex.",
        ]),

        h2("8. Checklist"),
        bullets([
            "Every map is created with `make` or a literal before it is written; struct types with map fields have a constructor.",
            "Output, files and tests never depend on map iteration order: keys are sorted with `slices.Sorted(maps.Keys(m))` or `slices.SortedFunc`.",
            "Counting uses `m[k]++` and grouping uses `m[k] = append(m[k], v)` on a non-nil map.",
            "Composite keys are structs (`map[Key]int`), not maps of maps.",
            "Struct values read from a map are written back after a change.",
            "Struct literals name their fields.",
        ]),
        p("Next lesson: pointers and methods. The end-of-day job marked every parcel as delivered - and not a single parcel changed."),
    ],
});
