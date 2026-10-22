// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-gof-3-2",
    title: "Generics basics",
    slug: { _type: "slug", current: "go-generics-basics" },
    description:
        "Saigon Parcel's quote page told every customer that the cheapest delivery option cost 0 VND. The int64 copy of a helper had been copy-pasted from the float64 one before that one was fixed, and nobody fixed it twice. Learn Go generics from the ground up: type parameters and type inference, constraints (any, comparable, cmp.Ordered and your own unions with ~), generic types such as Set[T], the generic slices, maps and cmp packages you should reach for first, and when a plain function or an interface is the better choice.",
    estimatedTime: 20,

    scenario: {
        role: "Junior Go developer on the platform team at Saigon Parcel, a delivery company in Ho Chi Minh City",
        problem:
            "The quote page shows the cheapest delivery option for a parcel. After a Monday release it said 'Cheapest option: 0 VND' for every parcel. Customers chose it, the checkout charged the real fee, and support received 312 complaints before lunch. The function behind it was a copy of another helper that had been fixed two months earlier, in the other copy only.",
    },

    content: [
        h2("1. The incident"),
        p("The route planner has a helper `shortestKm` that picks the shortest of several route options. In January, when the quote page needed \"the cheapest fee\", a developer copied it, renamed it `cheapestFee`, and changed `float64` to `int64`. In March a bug was found in `shortestKm`: it started its search from 0 instead of from the first option. It was fixed there, with a test. Nobody remembered the copy."),
        p("The copy was not used until the Monday release, when the quote page switched to it. From then on, every quote showed `Cheapest option: 0 VND`. The checkout, which uses another service, charged the real fee - 18,000 VND or more - and support spent the day apologising."),
        bullets([
            "**The bug had already been fixed once.** Copy-paste turned one bug into two, and the fix reached only one of them.",
            "**The two functions are the same algorithm.** Only the element type differs: `float64` kilometres in one, `int64` VND in the other.",
            "**Go has had a tool for exactly this since Go 1.18:** generics, one function that works for many types.",
        ]),

        h2("2. Reproduce it"),
        p("Both helpers, side by side. Save as `quote.go` and run it with `go run quote.go`:"),
        code("go", String.raw`
package main

import "fmt"

// shortestKm returns the shortest route option in km.
// Fixed in March: start from the first option, not from 0.
func shortestKm(km []float64) float64 {
	if len(km) == 0 {
		return 0
	}
	best := km[0]
	for _, d := range km[1:] {
		if d < best {
			best = d
		}
	}
	return best
}

// cheapestFee returns the cheapest delivery fee in VND.
// Copied from shortestKm in January, before the March fix.
func cheapestFee(fees []int64) int64 {
	var best int64
	for _, f := range fees {
		if f < best {
			best = f
		}
	}
	return best
}

func main() {
	fmt.Println("shortest route:", shortestKm([]float64{7.4, 3.2, 5.9}), "km")
	fmt.Println("cheapest option:", cheapestFee([]int64{32_000, 18_000, 25_000}), "VND")
}`, "quote.go"),
        code("text", String.raw`
$ go run quote.go
shortest route: 3.2 km
cheapest option: 0 VND`),
        p("`var best int64` starts at the zero value 0, and no fee is below 0, so `best` never changes. With an empty list, the January copy also returns 0 instead of saying \"no quotes\". The fixed copy handles both. The real fix is not to repair the copy a second time: it is to have **one** function, so there is nothing to forget."),

        h2("3. Type parameters"),
        p("A generic function has a list of **type parameters** in square brackets before its normal parameters. Each type parameter has a name (by convention a capital letter such as `T`) and a **constraint** that says which types it may stand for:"),
        code("go", String.raw`
package main

import (
	"cmp"
	"fmt"
)

// Min returns the smallest element of xs. ok is false when xs is empty.
func Min[T cmp.Ordered](xs []T) (best T, ok bool) {
	if len(xs) == 0 {
		return best, false // best is still T's zero value
	}
	best = xs[0]
	for _, x := range xs[1:] {
		best = min(best, x)
	}
	return best, true
}

type VND int64

func main() {
	km, _ := Min([]float64{7.4, 3.2, 5.9})
	fee, _ := Min([]int64{32_000, 18_000, 25_000})
	quote, _ := Min([]VND{32_000, 18_000, 25_000})
	first, _ := Min([]string{"thu-duc", "binh-thanh", "q3"})
	none, ok := Min[int64](nil)
	fmt.Println(km, fee, quote, first)
	fmt.Println(none, ok)
	fmt.Printf("%T %T\n", fee, quote)
}`, "min.go"),
        code("text", String.raw`
$ go run min.go
3.2 18000 18000 binh-thanh
0 false
int64 main.VND`),
        bullets([
            "**`T` is used like a type** inside the function: `xs []T`, `best T`, `var zero T`. When you call `Min` with a `[]int64`, `T` is `int64` for that call, and `fee` really is an `int64` - no `interface{}`, no conversion, no type assertion.",
            "**Type inference:** the compiler works out `T` from the arguments, so `Min([]float64{...})` needs no `[float64]`. When there is nothing to infer from (here `nil`), write the type yourself: `Min[int64](nil)`.",
            "**The zero value of `T`** is what a named result or `var x T` starts with: 0 for numbers, \"\" for strings. Returning it together with `ok` is how `Min` says \"there is no smallest element\" without inventing a fake one.",
            "**`min` and `max` are built in** since Go 1.21 and work on any ordered type, which keeps the loop body short.",
        ]),
        p("If the compiler cannot infer a type parameter, it tells you which one. A function `Zero[T any]() T` called as `Zero()` gives:"),
        code("text", String.raw`
./main.go:11:18: in call to Zero, cannot infer T (declared at ./main.go:5:11)`),
        p("The compiler checks the body **once**, against the constraint, and then produces code for the types you use. A mistake in the body is reported when you write it, not when someone first calls the function with a new type."),

        h2("4. Constraints: what T is allowed to be"),
        p("The constraint decides two things: which types a caller may use for `T`, and which operations the body may use on values of type `T`. Try to write `Min` with the loosest constraint, `any`:"),
        code("go", String.raw`
func Min[T any](xs []T) T {
	best := xs[0]
	for _, x := range xs[1:] {
		if x < best {
			best = x
		}
	}
	return best
}`),
        code("text", String.raw`
./main.go:8:6: invalid operation: x < best (type parameter T cannot use operator <)`),
        p("`any` admits every type, including structs, slices and functions, and most of those have no `<`. So with `any` you may only do what every type supports: assign, pass, return, put into slices and maps as values. The constraints you will use most:"),
        bullets([
            "**`any`** (an alias for `interface{}`): every type. Good for containers and helpers that only move values around, such as a `Map` function.",
            "**`comparable`**: types that support `==` and `!=` - numbers, strings, booleans, pointers, and structs and arrays made of those. Map keys must be comparable. Slices, maps and functions are not: calling an `Index[T comparable]` function with a `[][]string` gives `[]string does not satisfy comparable`.",
            "**`cmp.Ordered`** from the `cmp` package: every integer, float and string type, so `<`, `<=`, `>`, `>=` work. This is the right constraint for `Min`, `Max` and sort keys.",
            "**Your own union**, written as an interface with a list of types, for operations such as `+` that no predefined constraint covers.",
        ]),
        h3("Unions and the ~ token"),
        p("Saigon Parcel stores money in a named type, `type VND int64`, so that a fee cannot be mixed up with a weight by accident. A `Sum` with a plain union does not accept it:"),
        code("go", String.raw`
type Number interface {
	int | int64 | float64
}

func Sum[T Number](xs []T) T {
	var total T
	for _, x := range xs {
		total += x
	}
	return total
}

type VND int64

func main() {
	fmt.Println(Sum([]int64{350_000, 89_000}))
	fmt.Println(Sum([]VND{350_000, 89_000}))
}`),
        code("text", String.raw`
./main.go:21:17: VND does not satisfy Number (possibly missing ~ for int64 in Number)`),
        p("`int64` in a union means exactly `int64`. `~int64` means **every type whose underlying type is `int64`** - `int64` itself, `VND`, and any other named type defined as `int64`. The compiler even suggests the fix. With `~`, the result keeps the caller's type, methods included:"),
        code("go", String.raw`
// Number is every type whose underlying type is int, int64 or float64.
type Number interface {
	~int | ~int64 | ~float64
}

type VND int64

func (v VND) String() string { return fmt.Sprintf("%d VND", int64(v)) }

func main() {
	fmt.Println(Sum([]int64{350_000, 89_000}))
	fmt.Println(Sum([]VND{350_000, 89_000}))
	fmt.Println(Sum([]float64{1.5, 0.25, 2}))
	fmt.Println(Sum([]int{}))
}
// 439000
// 439000 VND
// 3.75
// 0`),
        p("`Sum([]VND{...})` returns a `VND`, so `fmt.Println` calls its `String` method. `cmp.Ordered` is defined the same way, as a union of `~int | ~int8 | ... | ~float64 | ~string`, which is why `Min([]VND{...})` worked in section 3. An interface with a type list like `Number` can only be used as a constraint, not as the type of a variable."),
        image("copies-vs-generic", {
            alt: "Three panels. Top left, a red panel titled Before: one copy per type, every fix has to be made again in every copy. It holds a box shortestKm(km []float64), fixed in March: starts from km[0], handles empty; a box cheapestFee(fees []int64), copied in January: starts from 0, so the result is 0; and a highlighted box Quote page: cheapest option 0 VND, fees 32,000 / 18,000 / 25,000 VND: no fee is below 0. Top right, a green panel titled After: one function, many types, with the signature func Min[T cmp.Ordered](xs []T) (T, bool) and the note the compiler makes a version for each T you call it with. It lists calls and results: Min of a float64 slice 7.4, 3.2, 5.9 gives 3.2 true; Min of an int64 slice 32000, 18000 gives 18000 true; Min of a VND slice gives 18000 true; Min of the strings q3 and go-vap gives go-vap true; Min[int64](nil) gives 0 false; T is inferred from the argument, with nil write it yourself. The bottom panel, A constraint says which types T may be, and so which operators the body may use, lists: any, every type, only what all types support (assign, pass, return); comparable, == and !=, so T can be a map key; cmp.Ordered, the less-than and greater-than operators on integers, floats and strings, named types included; ~int | ~int64 | ~float64, your own union, ~ also admits named types such as type VND int64.",
            caption: "Two copies of one algorithm need two fixes. A generic function is one body that the compiler checks once against its constraint and then uses for every type.",
        }),

        h2("5. Generic types"),
        p("Types can have type parameters too. Go has no built-in set; the usual way to write one is a map whose values carry no data (`struct{}` takes zero bytes). As a generic type, it works for any comparable element:"),
        code("go", String.raw`
package main

import (
	"fmt"
	"maps"
	"slices"
)

// Set is a set of comparable values.
type Set[T comparable] map[T]struct{}

func (s Set[T]) Add(v T) { s[v] = struct{}{} }

func (s Set[T]) Has(v T) bool {
	_, ok := s[v]
	return ok
}

func (s Set[T]) Len() int { return len(s) }

func main() {
	served := Set[string]{}
	for _, d := range []string{"q1", "q3", "binh-thanh", "q1"} {
		served.Add(d)
	}
	fmt.Println(served.Len(), served.Has("q3"), served.Has("go-vap"))
	fmt.Println(slices.Sorted(maps.Keys(served)))

	seen := Set[int]{}
	seen.Add(2001)
	fmt.Println(seen.Has(2001))
}`, "set.go"),
        code("text", String.raw`
$ go run set.go
3 true false
[binh-thanh q1 q3]
true`),
        bullets([
            "**A generic type must be instantiated before use:** `Set[string]{}`, `Set[int]{}`. In a composite literal there is nothing to infer from, so the type argument is always written.",
            "**Methods use the type's parameters** (`func (s Set[T]) Add(v T)`), but a method cannot declare new type parameters of its own. Write a generic function instead when you need one.",
            "**`slices.Sorted(maps.Keys(served))`** turns the set into a sorted slice: `maps.Keys` returns an iterator over the keys and `slices.Sorted` collects and sorts it. A map's own iteration order is random, so sort before printing anything a person or a test compares.",
        ]),

        h2("6. Reach for the standard library first"),
        p("Most generic helpers you might write already exist, tested, in three standard packages: `slices` (functions on any slice), `maps` (functions on any map) and `cmp` (`Ordered`, `Compare`, `Or`). Before writing a generic function, look there:"),
        code("go", String.raw`
package main

import (
	"cmp"
	"fmt"
	"slices"
)

type Parcel struct {
	ID  string
	COD int64
}

func main() {
	fees := []int64{32_000, 18_000, 25_000}
	fmt.Println(slices.Min(fees), slices.Max(fees), slices.Contains(fees, 25_000), slices.Index(fees, 18_000))

	parcels := []Parcel{{"SP-2003", 89_000}, {"SP-2001", 350_000}, {"SP-2002", 89_000}}
	slices.SortFunc(parcels, func(a, b Parcel) int {
		return cmp.Or(
			cmp.Compare(b.COD, a.COD), // largest COD first
			cmp.Compare(a.ID, b.ID),   // then by id
		)
	})
	fmt.Println(parcels)
	i := slices.IndexFunc(parcels, func(p Parcel) bool { return p.COD < 100_000 })
	fmt.Println(i, parcels[i].ID)
	big := slices.MaxFunc(parcels, func(a, b Parcel) int { return cmp.Compare(a.COD, b.COD) })
	fmt.Println(big)

	var none []int64
	fmt.Println(slices.Max(none))
}`, "stdlib.go"),
        code("text", String.raw`
$ go run stdlib.go
18000 32000 true 1
[{SP-2001 350000} {SP-2002 89000} {SP-2003 89000}]
1 SP-2002
{SP-2001 350000}
panic: slices.Max: empty list

goroutine 1 [running]:
slices.Max[...](...)
	slices/sort.go:97
main.main()
	./main.go:32 +0x42a
exit status 2`),
        bullets([
            "**`slices.SortFunc`** takes a comparison that returns a negative number, 0 or a positive number. `cmp.Compare(a, b)` gives exactly that for any ordered type; swap the arguments for descending order. `cmp.Or` returns the first non-zero result, which makes \"by COD, then by id\" one expression.",
            "**The `...Func` variants** (`IndexFunc`, `ContainsFunc`, `MaxFunc`, `SortFunc`) take a function, so they work on structs that have no `<` of their own.",
            "**`slices.Min` and `slices.Max` panic on an empty slice.** That is a documented choice, not a bug: there is no smallest element of nothing. Check `len` first, or use a function like our `Min` that returns `ok` - exactly the case the January copy got wrong.",
        ]),
        callout("tip", "Generic does not mean slow",
            "A generic function is compiled to real machine code, and the compiler shares one copy of that code between types with the same memory layout. For the small helpers in this lesson the cost is about the same as a hand-written loop. Do not avoid generics for speed, and do not reach for them for speed either: use them to remove duplicated code."),

        h2("7. When not to use generics"),
        p("Generics remove **duplicated algorithms over different types**. They are the wrong tool in other situations, and Go code that uses them everywhere is harder to read, not easier:"),
        bullets([
            "**Only one type uses the function.** Write `func cheapestFee(fees []int64)` and make it generic when a second type really needs it - not \"in case\".",
            "**The behaviour differs by type.** When each type needs its own code (a parcel prints a label, a driver prints a badge), that is a method on each type and an interface, the topic of the interfaces lesson. A `func printAll(items []Labeler)` needs no type parameter.",
            "**You only call methods.** A function that writes a report to any destination takes an `io.Writer`. A type parameter adds nothing an interface does not already do.",
            "**A one-line loop.** `for _, p := range parcels { total += p.COD }` is clearer than a call to a generic `SumBy` with a function literal - until the same loop appears in five places, which is what this lesson's challenge is about.",
        ]),
        p("A good rule from the Go team: write the concrete code first. When you find yourself writing the same code a second or third time with only the types changed, that is the moment to introduce a type parameter. Here is a function where generics clearly help, because the input and the output types differ and the caller chooses both:"),
        code("go", String.raw`
// Map returns f(x) for every x in xs, in order. T and U can be different types.
func Map[T, U any](xs []T, f func(T) U) []U {
	out := make([]U, 0, len(xs))
	for _, x := range xs {
		out = append(out, f(x))
	}
	return out
}

func main() {
	ids := []string{"sp-2001", "sp-2002"}
	fmt.Println(Map(ids, strings.ToUpper))
	fmt.Println(Map(ids, func(id string) int { return len(id) }))
	fmt.Println(Map([]int64{350_000, 89_000}, func(v int64) string { return fmt.Sprintf("%d VND", v) }))
}
// [SP-2001 SP-2002]
// [7 7]
// [350000 VND 89000 VND]`),

        h2("8. The fix"),
        p("Both copies are deleted. The route planner and the quote page now call the same `Min`, and its checks cover what broke: the zero start, an empty list, and negative values (which the January copy also got wrong):"),
        code("go", String.raw`
package main

import (
	"cmp"
	"fmt"
)

// Min returns the smallest element of xs; ok is false when xs is empty.
// One function for route lengths, fees, durations and anything else that has <.
func Min[T cmp.Ordered](xs []T) (best T, ok bool) {
	if len(xs) == 0 {
		return best, false
	}
	best = xs[0]
	for _, x := range xs[1:] {
		best = min(best, x)
	}
	return best, true
}

// check stops the program when a case is wrong: a tiny stand-in for a test.
func check[T comparable](name string, got, want T) {
	if got != want {
		panic(fmt.Sprintf("%s: got %v, want %v", name, got, want))
	}
}

func main() {
	km, _ := Min([]float64{7.4, 3.2, 5.9})
	check("shortest km", km, 3.2)

	fee, ok := Min([]int64{32_000, 18_000, 25_000})
	check("cheapest fee", fee, 18_000)
	check("cheapest fee ok", ok, true)

	_, ok = Min([]int64{})
	check("no quotes", ok, false)

	neg, _ := Min([]int{-3, -7, -1}) // the January copy returned 0 here too
	check("negative", neg, -7)

	fmt.Println("ok: cheapest option", fee, "VND")
}
// ok: cheapest option 18000 VND`, "quote.go"),
        numbered([
            "**One body for every type.** A fix to `Min` reaches the route planner, the quote page and every future caller at the same time.",
            "**The empty case is part of the signature.** `(T, bool)` forces the quote page to decide what to show when there are no quotes, instead of showing a made-up 0.",
            "**The constraint documents the requirement.** `cmp.Ordered` says \"anything with `<`\"; a reader knows what `T` can be without reading the body.",
            "**`check` is generic too.** It works for `float64`, `int64` and `bool` because its constraint is `comparable`. In the next lesson these checks move into a real `_test.go` file and run with `go test`.",
        ]),

        h2("9. Your turn"),
        p("The reports team has the same problem in bulk: `groupParcelsByDistrict`, `groupDriversByShift`, `sumCOD`, `sumWeight`, `sumStops`, each copy-pasted and each slightly different. Replace them with three generic functions. The test runner uses the same three functions on two different types: parcels grouped by district (summing `int64` VND and `float64` kg) and drivers grouped by shift (summing `int` stops)."),
        challenge("chal_coding_gof_321", "GroupBy needs two type parameters: the item type and the key type, and the key must be comparable because it is a map key. Make the map with make before you add to it, and append to the group that is already there so the input order is kept. SumBy starts from the zero value of N. For SortedKeys, collect the keys, then sort them; the slices package has a function for that."),

        h2("10. Pitfalls"),
        bullets([
            "**Copy-pasting a function to change its type**: every later fix has to find every copy. When the algorithm is the same, make it generic.",
            "**Starting a min or max from the zero value**: 0 is smaller than every positive fee and larger than every negative number. Start from the first element, and handle the empty case explicitly.",
            "**`slices.Min` / `slices.Max` on an empty slice** panic with `empty list`. Check `len` first.",
            "**Using `any` and then needing an operator**: `type parameter T cannot use operator <`. Pick the constraint that provides what the body needs: `comparable` for `==`, `cmp.Ordered` for `<`, a union for `+`.",
            "**A union without `~`** rejects named types such as `type VND int64`. Write `~int64` unless you really want only the exact type.",
            "**Generics for one type, or for behaviour that differs per type**: write the concrete function, or use an interface.",
            "**Printing a map, or the keys of a map, directly**: the order changes between runs. Sort the keys (`slices.Sorted(maps.Keys(m))`) before output.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Before writing a generic helper, check `slices`, `maps` and `cmp`.",
            "A type parameter appears only when two or more types really share the same algorithm.",
            "The constraint is the loosest one the body needs: `any`, `comparable`, `cmp.Ordered`, or a `~` union.",
            "Functions that can have no result return `(T, bool)` or an error, not a zero value that looks real.",
            "Generic types are instantiated explicitly: `Set[string]{}`.",
            "Every sort with ties has a tie-breaker (`cmp.Or(cmp.Compare(...), cmp.Compare(...))`) so the output is the same on every run.",
        ]),
        p("Next lesson: packages and `go test` - how to split code into packages, what a capital letter means, and how to turn checks like the ones above into table-driven tests that run on every commit."),
    ],
});
