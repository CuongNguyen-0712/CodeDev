// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-gof-3-1",
    title: "Errors as values: wrapping, errors.Is & errors.As",
    slug: { _type: "slug", current: "go-errors-wrapping-is-as" },
    description:
        "A refactor added the parcel id to an error message in Saigon Parcel's tracking API, and every 'parcel not found' became an HTTP 500: the customer app showed 'Something went wrong' and the on-call engineer was paged all night. Learn how errors work as ordinary values in Go, sentinel errors, wrapping with %w instead of %v, errors.Is and errors.As, your own error types, errors.Join, the typed-nil trap that makes a nil error not nil, and when panic is the wrong tool.",
    estimatedTime: 22,

    scenario: {
        role: "Junior Go developer on the platform team at Saigon Parcel, a delivery company in Ho Chi Minh City",
        problem:
            "Customers type a parcel id into the app, and trackd, the tracking API, answers 404 when the id does not exist, so the app can say 'We cannot find this parcel - check the id'. After a small refactor that made the error messages more helpful, every unknown id answered 500. The app showed 'Something went wrong, please try again', customers retried, the 5xx alert paged the on-call engineer 31 times in one night, and nothing was actually broken.",
    },

    content: [
        h2("1. The incident"),
        p("trackd's handlers call a service layer, which calls the store. When the store has no parcel with that id it returns a sentinel error, `ErrNotFound`, and the handler maps it to a status code: 404 for not found, 500 for anything unexpected. A 500 counts against the API's error budget and pages whoever is on call."),
        p("A support engineer asked for better log lines: \"parcel not found\" did not say which parcel. The fix was one line in the service layer:"),
        code("go", String.raw`
	status, err := s.Get(id)
	if err != nil {
		return "", fmt.Errorf("lookup %s: %v", id, err)
	}`, "service.go"),
        p("The log lines became `lookup SP-9999: parcel not found`, the review was approved, and from that evening every request for an unknown parcel answered **500**. Customers who mistyped an id saw \"Something went wrong, please try again\" instead of \"check the id\", tried again, and the alert fired 31 times before morning."),
        bullets([
            "**The message was perfect.** It still said `parcel not found`, now with the id.",
            "**The error was a different value.** The handler compared `err == ErrNotFound`, and the new error is not `ErrNotFound`: it is a new error whose text contains the old one.",
            "**One letter fixes the wrapping, one function fixes the comparison:** `%w` instead of `%v`, and `errors.Is` instead of `==`.",
        ]),

        h2("2. Reproduce it"),
        code("go", String.raw`
package main

import (
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("parcel not found")

type Store struct{ parcels map[string]string } // id -> status

func (s *Store) Get(id string) (string, error) {
	status, ok := s.parcels[id]
	if !ok {
		return "", ErrNotFound
	}
	return status, nil
}

// lookup is the service layer: it adds the parcel id to the error message.
func lookup(s *Store, id string) (string, error) {
	status, err := s.Get(id)
	if err != nil {
		return "", fmt.Errorf("lookup %s: %v", id, err)
	}
	return status, nil
}

// statusCode maps an error to the HTTP status the API returns.
func statusCode(err error) int {
	switch {
	case err == nil:
		return 200
	case err == ErrNotFound:
		return 404
	default:
		return 500
	}
}

func main() {
	store := &Store{parcels: map[string]string{"SP-2001": "out_for_delivery"}}
	for _, id := range []string{"SP-2001", "SP-9999"} {
		status, err := lookup(store, id)
		fmt.Println("GET /parcels/"+id, statusCode(err), status, err)
	}
}`, "trackd.go"),
        code("text", String.raw`
$ go vet trackd.go && go run trackd.go
GET /parcels/SP-2001 200 out_for_delivery <nil>
GET /parcels/SP-9999 500  lookup SP-9999: parcel not found`),

        h2("3. Errors are values"),
        p("Go has no exceptions for ordinary failures. A function that can fail returns an `error` as its last result, and the caller checks it right away. `error` is a tiny built-in interface:"),
        code("go", String.raw`
type error interface {
	Error() string
}`),
        p("Any type with an `Error() string` method is an error, and `nil` means \"no error\". Because errors are values, you can store them, compare them, wrap them and inspect them like any other value - which is exactly what went wrong in the incident."),
        bullets([
            "**`errors.New(\"parcel not found\")`** creates a new error value. Every call creates a **different** value, even with the same text.",
            "**A sentinel error** is such a value stored in a package-level variable, like `ErrNotFound` or the standard library's `io.EOF`. Callers check for it by identity, so it must be created once.",
            "**`fmt.Errorf`** builds an error from a format string. What it returns depends on the verbs you use: that is the next section.",
        ]),

        h2("4. Wrapping: %w versus %v"),
        p("Adding context to an error as it travels up is good practice: \"parcel not found\" alone does not say which parcel or which operation. The question is whether the new error still **contains** the old one."),
        code("go", String.raw`
package main

import (
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("parcel not found")

func main() {
	v := fmt.Errorf("lookup SP-9999: %v", ErrNotFound)
	w := fmt.Errorf("lookup SP-9999: %w", ErrNotFound)
	fmt.Println(v)
	fmt.Println(w)
	fmt.Println(v == ErrNotFound, errors.Is(v, ErrNotFound), errors.Unwrap(v))
	fmt.Println(w == ErrNotFound, errors.Is(w, ErrNotFound), errors.Unwrap(w) == ErrNotFound)

	h := fmt.Errorf("GET /parcels/SP-9999: %w", w)
	fmt.Println(h)
	fmt.Println(errors.Is(h, ErrNotFound))
	fmt.Printf("%T %T\n", v, w)
}`, "wrap.go"),
        code("text", String.raw`
$ go run wrap.go
lookup SP-9999: parcel not found
lookup SP-9999: parcel not found
false false <nil>
false true true
GET /parcels/SP-9999: lookup SP-9999: parcel not found
true
*errors.errorString *fmt.wrapError`),
        bullets([
            "**`%v` formats the error as text.** The result is a plain `*errors.errorString` with the same message and no link to `ErrNotFound`: `errors.Unwrap(v)` is `nil`.",
            "**`%w` wraps the error.** The result is a `*fmt.wrapError` whose `Unwrap()` method returns `ErrNotFound`. The printed text is identical.",
            "**`==` is false for both.** A wrapper is a new value. Only the original error equals the sentinel.",
            "**`errors.Is(err, target)` walks the chain**: it compares `err`, then `Unwrap(err)`, then the next one, until it finds `target` or runs out. Wrapping twice (`h`) still works.",
        ]),
        image("error-chain", {
            alt: "Two panels and a table. Left, green panel, titled fmt.Errorf(\"lookup %s: %w\", id, err): three stacked boxes joined by green arrows. Top: handler, GET /parcels/SP-9999: ..., a *fmt.wrapError whose Unwrap() returns the error below. Middle: service, lookup SP-9999: ..., also a *fmt.wrapError. Bottom, highlighted: store, ErrNotFound, parcel not found. Below: errors.Is(err, ErrNotFound) walks down: true, 404. Right, red panel, titled fmt.Errorf(\"lookup %s: %v\", id, err): one box, service, lookup SP-9999: parcel not found, a *errors.errorString - just text, no Unwrap method; below it a greyed dashed box ErrNotFound, only its message was copied, the value is gone; then a red box err == ErrNotFound: false, errors.Is: false, and the note statusCode falls through to the default: 500. Bottom table, Inspecting an error: err == ErrNotFound compares the outermost error only and breaks as soon as someone wraps; err.(*ValidationError) checks the outermost error only; errors.Is(err, ErrNotFound) searches the whole %w chain and errors.Join for this value; errors.As(err, &verr) searches the whole chain for an error of this type and sets verr.",
            caption: "Same message, different value. errors.Is and errors.As follow %w links; == and type assertions only see the outermost error.",
        }),
        callout("tip", "When to use %w and when %v",
            "Use %w when callers may need to react to the underlying error (not found, timeout, permission denied) - that is almost always the case inside your own program. Use %v on purpose at a boundary where you do not want callers to depend on an implementation detail, for example a database driver's error type leaking out of your public API."),

        h2("5. Your own error types and errors.As"),
        p("A sentinel says **what** happened. When the caller also needs details - which field is invalid, which limit was exceeded - define an error type. `errors.As` finds the first error of that type anywhere in the chain and gives it to you:"),
        code("go", String.raw`
package main

import (
	"errors"
	"fmt"
	"strings"
)

// ValidationError says which field of a request is wrong and why.
type ValidationError struct {
	Field  string
	Reason string
}

func (e *ValidationError) Error() string {
	return e.Field + ": " + e.Reason
}

func validateID(id string) error {
	if !strings.HasPrefix(id, "SP-") {
		return &ValidationError{Field: "id", Reason: "must start with SP-"}
	}
	return nil
}

func main() {
	err := fmt.Errorf("lookup %s: %w", "2001", validateID("2001"))
	fmt.Println(err)

	var ve *ValidationError
	if errors.As(err, &ve) {
		fmt.Println("400 bad request, field", ve.Field, "-", ve.Reason)
	}
	_, ok := err.(*ValidationError)
	fmt.Println("type assertion on the wrapped error:", ok)

	joined := errors.Join(
		&ValidationError{"weight", "must be positive"},
		&ValidationError{"district", "unknown district q13"},
	)
	fmt.Println(joined)
	fmt.Println(errors.As(joined, &ve), ve.Field)
}`, "validate.go"),
        code("text", String.raw`
$ go run validate.go
lookup 2001: id: must start with SP-
400 bad request, field id - must start with SP-
type assertion on the wrapped error: false
weight: must be positive
district: unknown district q13
true weight`),
        bullets([
            "**Pass a pointer to a variable of the type you want**: `errors.As(err, &ve)` with `ve` a `*ValidationError`. It returns true and sets `ve` when it finds one.",
            "**A type assertion has the same problem as `==`**: `err.(*ValidationError)` only looks at the outermost error, which here is the `fmt` wrapper.",
            "**`errors.Join(errs...)`** combines several errors into one (validation often finds more than one problem). Its message is the messages on separate lines, and `errors.Is` / `errors.As` search every joined error.",
        ]),
        challenge("chal_quiz_gof_311", "Separate the two questions every time: what does the error print (the text), and which error values are inside it (the chain)? Only %w adds a link. == and type assertions see the outermost error; errors.Is and errors.As follow the links."),

        h2("6. The typed-nil trap"),
        p("While fixing the incident, the team found a second bug in the request validator. It collected a problem in a pointer variable and returned it at the end:"),
        code("go", String.raw`
// validateID collects a problem in verr and returns it at the end.
func validateID(id string) error {
	var verr *ValidationError
	if !strings.HasPrefix(id, "SP-") {
		verr = &ValidationError{Field: "id", Reason: "must start with SP-"}
	}
	return verr
}

func main() {
	err := validateID("SP-2001")
	fmt.Println(err == nil)
	fmt.Printf("%v %T\n", err, err)
	if err != nil {
		fmt.Println("rejected:", err.Error())
	}
}`, "typednil.go"),
        code("text", String.raw`
$ go vet typednil.go && go run typednil.go
false
<nil> *main.ValidationError
panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x1 addr=0x0 pc=0x49fbc7]

goroutine 1 [running]:
main.(*ValidationError).Error(...)
	./typednil.go:13
main.main()
	./typednil.go:29 +0xa7
exit status 2`),
        p("`SP-2001` is valid, yet `err == nil` is **false**. Remember from the last lesson that an interface value has two parts, a type and a value, and it is only nil when **both** are empty. `return verr` puts the type `*ValidationError` and the nil pointer into the `error` interface: the value is nil, the type is not, so the interface is not nil. `%v` even prints `<nil>`, which makes it very confusing in logs, and calling `Error()` reads a field through the nil pointer and panics. `go vet` does not catch it."),
        p("The rule: **in a function that returns `error`, return the literal `nil` on success**, never a typed pointer variable that might be nil:"),
        code("go", String.raw`
func validateID(id string) error {
	if !strings.HasPrefix(id, "SP-") {
		return &ValidationError{Field: "id", Reason: "must start with SP-"}
	}
	return nil // a literal nil: no type, no value
}
// validateID("SP-2001") == nil is true; validateID("2001") prints "id: must start with SP-"`),

        h2("7. Handling errors well"),
        numbered([
            "**Check every error right away**, with `if err != nil` directly after the call. Do not use the other results when `err` is not nil.",
            "**Add context once per layer** with `fmt.Errorf(\"what you were doing: %w\", err)`: the operation and the input (`lookup SP-9999`), not \"error:\" or \"failed:\".",
            "**Handle or return, not both.** Logging an error and then returning it means it is logged at every layer. The layer that decides (usually the handler) logs it once.",
            "**Decide by value or type, never by message.** `strings.Contains(err.Error(), \"not found\")` breaks the day someone rewords a message. Use `errors.Is` and `errors.As`.",
            "**Do not panic for expected failures.** Not found, invalid input, a timeout - those are errors. `panic` is for bugs that should never happen (an impossible state, a broken invariant); a panic in an HTTP handler is a 500 at best and a crashed process at worst.",
        ]),

        h2("8. The fix"),
        p("One letter in the service layer, `errors.Is` in the handler, and a table of cases that runs in CI:"),
        code("go", String.raw`
package main

import (
	"errors"
	"fmt"
	"net/http"
)

var ErrNotFound = errors.New("parcel not found")

type Store struct{ parcels map[string]string } // id -> status

func (s *Store) Get(id string) (string, error) {
	status, ok := s.parcels[id]
	if !ok {
		return "", ErrNotFound
	}
	return status, nil
}

func lookup(s *Store, id string) (string, error) {
	status, err := s.Get(id)
	if err != nil {
		return "", fmt.Errorf("lookup %s: %w", id, err) // %w keeps ErrNotFound in the chain
	}
	return status, nil
}

func statusCode(err error) int {
	switch {
	case err == nil:
		return http.StatusOK
	case errors.Is(err, ErrNotFound):
		return http.StatusNotFound
	default:
		return http.StatusInternalServerError
	}
}

func main() {
	store := &Store{parcels: map[string]string{"SP-2001": "out_for_delivery"}}
	cases := []struct {
		id   string
		want int
	}{
		{"SP-2001", 200},
		{"SP-9999", 404},
	}
	for _, c := range cases {
		_, err := lookup(store, c.id)
		if got := statusCode(err); got != c.want {
			panic(fmt.Sprintf("%s: got %d, want %d (%v)", c.id, got, c.want, err))
		}
		fmt.Println("GET /parcels/"+c.id, statusCode(err), err)
	}
}
// GET /parcels/SP-2001 200 <nil>
// GET /parcels/SP-9999 404 lookup SP-9999: parcel not found`, "trackd.go"),
        numbered([
            "**`%w` wherever an error is passed on.** The log line keeps its helpful text, and the chain keeps `ErrNotFound`.",
            "**`errors.Is` / `errors.As` wherever an error is inspected**, so the next person who adds context cannot break the status codes.",
            "**Validators return a literal `nil`.** No typed pointer travels through an `error` result.",
            "**A test per status code**, including the not-found path. The original suite only tested the happy path, which never changed.",
        ]),

        h2("9. Your turn"),
        p("A cut-down trackd answers 500 for almost every request: for parcels that exist, for unknown parcels and for invalid ids. It has every bug from this lesson. The test runner sends `get` and `reschedule` requests against a small store and prints the status code with the result or the error message."),
        challenge("chal_fix_gof_312", "Start with a request for a parcel that exists and ask why its error is not nil - look at what validateID returns. Then follow an unknown id: which verb wraps the store's error, and how does statusFor compare it? A *ValidationError is found with errors.As, a sentinel with errors.Is. Keep the message texts exactly as they are."),

        h2("10. Pitfalls"),
        bullets([
            "**`%v` (or `%s`) when wrapping an error**: the text survives, the error value does not. Use `%w`.",
            "**`err == ErrX` or `err.(*MyErr)` on an error that may be wrapped**: false as soon as anyone adds context. Use `errors.Is` and `errors.As`.",
            "**Returning a typed nil pointer as an `error`**: the interface is not nil, prints `<nil>`, and `Error()` may panic. Return a literal `nil`.",
            "**Creating the sentinel inside a function** (`return errors.New(\"not found\")` each time): every call is a new value and `errors.Is` never matches. Create sentinels once, at package level.",
            "**Matching on `err.Error()` text**: a reworded message silently changes behaviour.",
            "**Logging and returning the same error at every layer**: the log shows one failure five times.",
            "**`panic` for expected failures** such as not found or invalid input: return an error.",
        ]),

        h2("11. Checklist"),
        bullets([
            "Every error is checked right after the call that returned it.",
            "Every `fmt.Errorf` that passes an error on uses `%w` (or `%v` on purpose at an API boundary).",
            "Errors are inspected with `errors.Is` and `errors.As`, never `==`, a type assertion or the message text.",
            "Sentinel errors are package-level variables; error types have an `Error` method and are returned as pointers.",
            "Functions that return `error` return the literal `nil` on success.",
            "Tests cover each error path and the status code or behaviour it should produce.",
        ]),
        p("Next lesson: generics - one function instead of three copies that drifted apart."),
    ],
});
