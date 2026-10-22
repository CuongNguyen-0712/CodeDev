// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-gof-2-3",
    title: "Methods & interfaces",
    slug: { _type: "slug", current: "go-methods-interfaces" },
    description:
        "A one-character change - a String method moved to a pointer receiver - made Saigon Parcel's morning SMS say 'your {SP-2001 q3 1200} is out for delivery today' to 9,400 customers. Learn how Go interfaces are satisfied implicitly, why small interfaces like fmt.Stringer and io.Writer are so useful, what method sets are and why a value did not satisfy Stringer, how to check interface satisfaction at compile time, type assertions with comma-ok and type switches, what a nil interface is, and why Go code accepts interfaces and returns structs.",
    estimatedTime: 20,

    scenario: {
        role: "Junior Go developer on the platform team at Saigon Parcel, a delivery company in Ho Chi Minh City",
        problem:
            "Every morning at 07:30 the notification service sends each customer an SMS: 'Saigon Parcel: your parcel SP-2001 (q3) is out for delivery today.' One morning 9,400 customers got 'your {SP-2001 q3 1200} is out for delivery today' instead. The change that caused it was a refactor that 'made all Parcel methods use pointer receivers for consistency'. It compiled, the tests passed, and the SMS provider charged for every message.",
    },

    content: [
        h2("1. The incident"),
        p("The notification service builds the morning SMS with `fmt.Sprintf(\"Saigon Parcel: your %v is out for delivery today.\", p)`. `Parcel` has a `String` method, so `%v` prints the customer-friendly text `parcel SP-2001 (q3)` - until a refactor changed every `Parcel` method to a pointer receiver \"for consistency\", following the advice from the last lesson. That included `String`:"),
        code("go", String.raw`
// String is how a parcel appears in customer messages.
func (p *Parcel) String() string {
	return fmt.Sprintf("parcel %s (%s)", p.ID, p.District)
}`, "parcel.go"),
        p("The next morning 9,400 customers received `Saigon Parcel: your {SP-2001 q3 1200} is out for delivery today.` Some replied asking what 1200 meant (it is the weight in grams). The support team found the message within minutes; the cause took longer, because the program had no error, `go vet` was silent, and the unit test for `String` itself still passed."),
        bullets([
            "**The `String` method still worked** when it was called directly, so its unit test passed.",
            "**`fmt` decides at run time** whether an argument has a `String` method, through an interface. A `Parcel` value no longer qualified, and `fmt` silently fell back to printing the fields.",
            "**To understand why**, you need two ideas: how Go interfaces are satisfied, and which methods a value has (its method set).",
        ]),

        h2("2. Reproduce it"),
        code("go", String.raw`
package main

import "fmt"

type Parcel struct {
	ID       string
	District string
	WeightG  int
}

// String is how a parcel appears in customer messages.
func (p *Parcel) String() string {
	return fmt.Sprintf("parcel %s (%s)", p.ID, p.District)
}

func main() {
	parcels := []Parcel{{"SP-2001", "q3", 1200}, {"SP-2002", "thu-duc", 450}}
	for _, p := range parcels {
		fmt.Printf("Saigon Parcel: your %v is out for delivery today.\n", p)
	}
	p := parcels[0]
	fmt.Println(&p)
	fmt.Println(p.String())
}`, "sms.go"),
        code("text", String.raw`
$ go vet sms.go && go run sms.go
Saigon Parcel: your {SP-2001 q3 1200} is out for delivery today.
Saigon Parcel: your {SP-2002 thu-duc 450} is out for delivery today.
parcel SP-2001 (q3)
parcel SP-2001 (q3)`),
        p("The loop passes a `Parcel` **value** and gets the raw fields. `&p` (a `*Parcel`) gets the right text, and so does calling `p.String()` directly, because Go takes `&p` for you when you call a pointer method on a variable. Only the interface check inside `fmt` sees the difference."),

        h2("3. Interfaces are satisfied implicitly"),
        p("An **interface type** lists method signatures. Any type that has those methods **satisfies** the interface, automatically: there is no `implements` keyword, and the type does not even need to know the interface exists. `fmt.Stringer` from the standard library is one method:"),
        code("go", String.raw`
type Stringer interface {
	String() string
}`),
        p("A variable of interface type holds two things: a concrete value and its type (the **dynamic type**). Calling a method on the interface calls the method of whatever concrete type is inside. That is how one function works with many types:"),
        code("go", String.raw`
package main

import (
	"fmt"
	"io"
	"os"
	"strings"
)

type Parcel struct {
	ID       string
	District string
	WeightG  int
}

func (p Parcel) String() string { return fmt.Sprintf("parcel %s (%s)", p.ID, p.District) }

// Notifier sends a message to a customer.
type Notifier interface {
	Notify(phone, msg string) error
}

type SMS struct{ Sent int }

func (s *SMS) Notify(phone, msg string) error {
	s.Sent++
	fmt.Printf("SMS to %s: %s\n", phone, msg)
	return nil
}

type Zalo struct{ OA string }

func (z Zalo) Notify(phone, msg string) error {
	fmt.Printf("Zalo %s -> %s: %s\n", z.OA, phone, msg)
	return nil
}

func announce(n Notifier, phone string, p Parcel) error {
	return n.Notify(phone, fmt.Sprintf("your %v is out for delivery today", p))
}

// writeManifest works with any io.Writer: a file, os.Stdout, a network connection, a buffer.
func writeManifest(w io.Writer, parcels []Parcel) {
	for i, p := range parcels {
		fmt.Fprintf(w, "%d. %v %dg\n", i+1, p, p.WeightG)
	}
}

func main() {
	p := Parcel{"SP-2001", "q3", 1200}
	sms := &SMS{}
	_ = announce(sms, "0901234567", p)
	_ = announce(Zalo{OA: "SaigonParcel"}, "0907654321", p)
	fmt.Println("sms sent:", sms.Sent)

	parcels := []Parcel{p, {"SP-2002", "thu-duc", 450}}
	writeManifest(os.Stdout, parcels)
	var b strings.Builder
	writeManifest(&b, parcels)
	fmt.Printf("%q\n", b.String())

	var s fmt.Stringer = p
	fmt.Println(s)
}`, "notify.go"),
        code("text", String.raw`
$ go run notify.go
SMS to 0901234567: your parcel SP-2001 (q3) is out for delivery today
Zalo SaigonParcel -> 0907654321: your parcel SP-2001 (q3) is out for delivery today
sms sent: 1
1. parcel SP-2001 (q3) 1200g
2. parcel SP-2002 (thu-duc) 450g
"1. parcel SP-2001 (q3) 1200g\n2. parcel SP-2002 (thu-duc) 450g\n"`),
        bullets([
            "**`announce` does not know about SMS or Zalo.** It needs something with a `Notify` method, nothing more. Adding email later changes no existing code.",
            "**`io.Writer` is one method, `Write(p []byte) (n int, err error)`.** `os.Stdout`, files, HTTP responses, `strings.Builder` and `bytes.Buffer` all have it, so `writeManifest` can print to the terminal in production and to a buffer in a test.",
            "**Small interfaces are the Go style.** One or two methods, named after what they do (`Stringer`, `Writer`, `Reader`, `Notifier`). The bigger an interface, the fewer types satisfy it.",
        ]),

        h2("4. Method sets: why the value was not a Stringer"),
        p("Which methods does a type have, as far as interfaces are concerned? Go's rule is the **method set**:"),
        bullets([
            "**The method set of `T`** contains the methods declared with a value receiver, `func (p T) ...`.",
            "**The method set of `*T`** contains those **and** the methods declared with a pointer receiver, `func (p *T) ...`.",
        ]),
        p("A pointer can always reach the value, so `*T` gets everything. A value stored inside an interface is a copy that has no address the method could use, so `T` does not get the pointer methods. After the refactor, `Parcel` had no `String` in its method set, `*Parcel` did. When you assign the value yourself, the compiler tells you exactly that:"),
        code("go", String.raw`
var _ fmt.Stringer = Parcel{}`),
        code("text", String.raw`
./parcel.go:12:22: cannot use Parcel{} (value of struct type Parcel) as fmt.Stringer value in variable declaration: Parcel does not implement fmt.Stringer (method String has pointer receiver)`),
        p("`fmt.Printf` takes its arguments as `any` (the empty interface, which every type satisfies), so the compiler has nothing to complain about; `fmt` checks for `Stringer` at run time and quietly prints the fields when the check fails."),
        image("stringer-method-sets", {
            alt: "Two panels and a table. Left, red panel, titled func (p *Parcel) String() string, pointer receiver: only *Parcel has the method. Step 1: the argument is a Parcel value - for _, p := range parcels gives Parcel, not *Parcel. Step 2: the method set of Parcel has no String, so the value does not satisfy fmt.Stringer. Step 3, highlighted red: fmt prints the fields, your {SP-2001 q3 1200} is out..., no error, no warning, it reaches the customer. Right, green panel, titled func (p Parcel) String() string, value receiver: Parcel and *Parcel both have it. Step 1: the argument is a Parcel value, the same loop and call. Step 2: the method set of Parcel contains String, so the value satisfies fmt.Stringer. Step 3, highlighted green: fmt calls p.String(), your parcel SP-2001 (q3) is out..., and var _ fmt.Stringer = Parcel{} keeps it that way. Bottom table, Method sets: T has only the methods with a value receiver; *T has the value-receiver and the pointer-receiver methods. Note: calling p.String() directly still works on a variable because Go takes &p for you; interfaces get no such help.",
            caption: "fmt asks the interface question at run time. A pointer-receiver String makes the value fail it, silently.",
        }),
        p("The same rule gives a compile error when you pass a value where an interface needs a pointer method - here with the `SMS` notifier from section 3:"),
        code("go", String.raw`
var n Notifier = SMS{}`),
        code("text", String.raw`
./notify.go:12:19: cannot use SMS{} (value of struct type SMS) as Notifier value in variable declaration: SMS does not implement Notifier (method Notify has pointer receiver)`),
        p("Here the fix is `&SMS{}`: `SMS` counts the messages it sends, so it must be shared, not copied. For `String` the right fix is the opposite: a `String` method only reads, so give it a **value receiver**, and both `Parcel` and `*Parcel` satisfy `Stringer`. The \"one receiver kind per type\" advice from the last lesson has this one well-known exception: `String` (and `Error`) methods of small types usually have value receivers so that values print correctly."),
        h3("Check it at compile time"),
        p("When a type must satisfy an interface, say so in the code. A blank variable declaration costs nothing at run time and breaks the build the moment someone changes a receiver:"),
        code("go", String.raw`
// Compile-time checks: the build fails if a type stops satisfying the interface.
var (
	_ fmt.Stringer = Parcel{}
	_ fmt.Stringer = (*Parcel)(nil)
)`),
        challenge("chal_quiz_gof_231", "For each value, list its method set first: value receivers only for T, everything for *T. fmt.Println takes any, so a missing method never fails to compile there - it only changes what is printed. For type assertions, remember which form can panic."),

        h2("5. Getting the concrete type back"),
        h3("Type assertions"),
        p("`x.(T)` asks an interface value whether its dynamic type is `T` (or, if `T` is an interface, whether it satisfies `T`). The one-value form panics when the answer is no; the two-value **comma-ok** form never panics:"),
        code("go", String.raw`
var v any = Parcel{"SP-2001"}
s, ok := v.(fmt.Stringer)
fmt.Println(s, ok) // parcel SP-2001 true
n, ok := v.(int)
fmt.Println(n, ok) // 0 false
_ = v.(int)
// panic: interface conversion: interface {} is main.Parcel, not int`),
        h3("Type switches"),
        p("A type switch tests several types in order and gives you `x` with the matching type in each branch. `case nil` matches an interface that holds nothing:"),
        code("go", String.raw`
func describe(v any) string {
	switch x := v.(type) {
	case nil:
		return "nothing"
	case int:
		return "int " + strconv.Itoa(x)
	case string:
		return "string " + strconv.Quote(x)
	case fmt.Stringer:
		return "stringer " + x.String()
	case error:
		return "error " + x.Error()
	default:
		return fmt.Sprintf("other %T", x)
	}
}

for _, x := range []any{nil, 42, "q3", Parcel{"SP-2002"}, fmt.Errorf("timeout"), 4.5} {
	fmt.Println(describe(x))
}
// nothing
// int 42
// string "q3"
// stringer parcel SP-2002
// error timeout
// other float64`),
        p("This is exactly what `fmt` does inside: it checks for `Stringer` and `error` before falling back to the fields. Use assertions and type switches at the edges (decoding input, printing, error handling); if you find yourself switching on types all over the code, a method on the interface is usually the better design."),
        h3("The nil interface"),
        p("The zero value of an interface is `nil`: no type and no value. Comparing it with `nil` is true, printing it shows `<nil>`, and calling a method on it panics, because there is no concrete method to call:"),
        code("go", String.raw`
var n Notifier
fmt.Println(n == nil)    // true
fmt.Printf("%v %T\n", n, n) // <nil> <nil>
n.Notify("0901234567", "hello")
// panic: runtime error: invalid memory address or nil pointer dereference`),
        p("An interface is only nil when **both** parts are empty. An interface that holds a nil pointer of some type is **not** nil - that surprise has its own section in the lesson on errors."),

        h2("6. Accept interfaces, return structs"),
        p("Two habits make interfaces pay off:"),
        numbered([
            "**Functions take the smallest interface they need.** `announce(n Notifier, ...)` and `writeManifest(w io.Writer, ...)` can be called with real services in production and with fakes in tests.",
            "**Constructors return concrete types**, like `func NewSMS(apiKey string) *SMS`. The caller gets every method and field; whoever uses it decides which interface they need. Define interfaces where they are **used**, not next to the type that implements them.",
        ]),
        callout("tip", "Do not start with an interface",
            "Write the concrete type first. Add an interface when a second implementation appears, or when a test needs a fake. An interface with one implementation and ten methods is just extra code to keep in sync."),

        h2("7. The fix"),
        p("`String` got its value receiver back, compile-time checks pin both `Parcel` and `*Parcel` to `fmt.Stringer`, and the SMS builder got a test that uses a fake notifier and fails if a message contains a `{`:"),
        code("go", String.raw`
package main

import (
	"fmt"
	"strings"
)

type Parcel struct {
	ID       string
	District string
	WeightG  int
}

// String is how a parcel appears in customer messages. A value receiver, so both
// Parcel and *Parcel satisfy fmt.Stringer.
func (p Parcel) String() string {
	return fmt.Sprintf("parcel %s (%s)", p.ID, p.District)
}

// Compile-time checks: the build fails if a type stops satisfying the interface.
var (
	_ fmt.Stringer = Parcel{}
	_ fmt.Stringer = (*Parcel)(nil)
)

type Notifier interface {
	Notify(phone, msg string) error
}

// outForDelivery builds the morning SMS; it depends only on the Notifier interface.
func outForDelivery(n Notifier, phone string, p Parcel) error {
	return n.Notify(phone, fmt.Sprintf("Saigon Parcel: your %v is out for delivery today.", p))
}

// fakeNotifier records messages instead of sending them - for tests.
type fakeNotifier struct{ sent []string }

func (f *fakeNotifier) Notify(phone, msg string) error {
	f.sent = append(f.sent, phone+": "+msg)
	return nil
}

func main() {
	fake := &fakeNotifier{}
	for _, p := range []Parcel{{"SP-2001", "q3", 1200}, {"SP-2002", "thu-duc", 450}} {
		if err := outForDelivery(fake, "0901234567", p); err != nil {
			panic(err)
		}
	}
	for _, m := range fake.sent {
		if strings.Contains(m, "{") {
			panic("raw struct in SMS: " + m)
		}
		fmt.Println(m)
	}
}
// 0901234567: Saigon Parcel: your parcel SP-2001 (q3) is out for delivery today.
// 0901234567: Saigon Parcel: your parcel SP-2002 (thu-duc) is out for delivery today.`, "sms.go"),
        numbered([
            "**Value receiver for `String`**, so values and pointers print the same way.",
            "**`var _ Interface = Type{}`** for every interface a type is meant to satisfy. The refactor would have failed to build.",
            "**The test checks the text the customer gets**, through the same interface the service uses, not the `String` method alone.",
        ]),

        h2("8. Your turn"),
        p("The delivery fee is the sum of small fee rules - a flat fee, a fee per started kilogram, a district surcharge, and a cap that limits another rule. Each rule type satisfies a two-method interface. The test runner builds the rules as values and stores them in a `[]FeeRule`."),
        challenge("chal_coding_gof_232", "Give each rule type value receivers: the runner stores values like Flat{...} in a []FeeRule. A started kilogram rounds up, so 1001 g is 2 kg - integer division rounds down, so add something before dividing. Capped holds a FeeRule, not a concrete type: call its Fee and use the built-in min. Its String can print the inner rule with %v, because the inner rule is a Stringer too."),

        h2("9. Pitfalls"),
        bullets([
            "**A pointer-receiver `String` or `Error` method**: values print as raw fields. Use a value receiver for read-only methods of small types.",
            "**Expecting a compile error from `fmt`**: `Printf` takes `any`, so a missing method only changes the output. Add `var _ fmt.Stringer = T{}`.",
            "**Passing `T` where the interface needs a pointer method**: `T does not implement I (method M has pointer receiver)`. Pass `&value`, or change the receiver if the method does not modify anything.",
            "**`v.(T)` without ok** on data you do not control: it panics on the wrong type. Use `x, ok := v.(T)` or a type switch.",
            "**Calling a method on a nil interface**: it panics. Check for nil where an interface may be unset, or give it a default.",
            "**Big interfaces declared next to the implementation**: every fake must implement every method. Declare small interfaces where they are used.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Every interface a type is meant to satisfy has a `var _ I = T{}` (or `(*T)(nil)`) check.",
            "`String` and `Error` methods of small types have value receivers.",
            "Functions accept the smallest interface they need; constructors return concrete types.",
            "Type assertions on outside data use the comma-ok form or a type switch.",
            "Tests that check printed output go through the same interface as production code (`io.Writer`, a fake notifier).",
        ]),
        p("Next lesson: errors are values too - and an `error` built with the wrong verb turned every \"parcel not found\" into an HTTP 500."),
    ],
});
