// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-gof-4-1",
    title: "Packages & go test",
    slug: { _type: "slug", current: "go-packages-and-go-test" },
    description:
        "A Friday change to Saigon Parcel's shared phone-number helper made it reject every number written +84..., and 1,184 customers got no 'out for delivery' SMS over the weekend. There was not a single test. Learn how Go code is organised into modules and packages, what a capital letter means, what internal/ protects, and how to write table-driven tests with go test, t.Run, t.Errorf and t.Fatalf - plus the flags (-v, -run, -cover, -count) and the vet checks that run with every test.",
    estimatedTime: 21,

    scenario: {
        role: "Junior Go developer on the platform team at Saigon Parcel, a delivery company in Ho Chi Minh City",
        problem:
            "The notifier sends customers an SMS when their parcel goes out for delivery. On Friday afternoon a developer changed the shared Normalize function so that numbers typed with spaces on the new web form would work. The change was small, reviewed and deployed. On Monday the support team had 260 complaints: numbers from the mobile app, which arrive as +84..., were all skipped as invalid, and the notifier only logged it.",
    },

    content: [
        h2("1. The incident"),
        p("Every Saigon Parcel service that sends an SMS calls one function: `phone.Normalize`, which turns whatever the customer typed into the form the SMS gateway wants, `+84901234567`. The mobile app already sends that form. The new web form sends what people type: `0901234567`, `090 123 4567`, `0912.345.678`."),
        p("On Friday a developer rewrote `Normalize` to handle the spaces: drop every character that is not a digit, then check for 10 digits starting with 0. Numbers from the web form worked. Numbers from the mobile app - `+84901234567` becomes `84901234567`, 11 digits that do not start with 0 - were now rejected. The notifier logged `skip \"+84...\": invalid phone number` 1,184 times over the weekend, at info level, and sent nothing."),
        bullets([
            "**The function had no tests.** The reviewer checked the new case by reading the code; nobody thought of the old case.",
            "**One shared package, many callers.** The notifier, the driver app backend and the returns service all use `Normalize`, so one change broke all of them at once.",
            "**The fix is not only a code change.** It is a test that runs every case anyone has ever cared about, on every change, so the next refactor cannot drop one silently.",
        ]),

        h2("2. Reproduce it"),
        p("The trackd repository is one Go **module** with several **packages**. The helper lives in `internal/phone`, and the notifier is a small program in `cmd/notifier`:"),
        code("text", String.raw`
trackd/
├── go.mod                      module saigonparcel.vn/trackd
├── cmd/
│   └── notifier/
│       └── main.go             package main
└── internal/
    └── phone/
        └── phone.go            package phone`),
        code("go", String.raw`
// Package phone normalizes Vietnamese mobile numbers for the SMS gateway.
package phone

import (
	"errors"
	"strings"
	"unicode"
)

// ErrInvalid is returned for input that is not a Vietnamese mobile number.
var ErrInvalid = errors.New("invalid phone number")

// Normalize returns the number in E.164 form, e.g. "+84901234567".
func Normalize(raw string) (string, error) {
	digits := onlyDigits(raw)
	if len(digits) != 10 || digits[0] != '0' {
		return "", ErrInvalid
	}
	return "+84" + digits[1:], nil
}

// onlyDigits drops every character that is not a digit.
func onlyDigits(s string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) {
			return r
		}
		return -1
	}, s)
}`, "internal/phone/phone.go"),
        code("go", String.raw`
package main

import (
	"fmt"
	"os"

	"saigonparcel.vn/trackd/internal/phone"
)

func main() {
	for _, raw := range os.Args[1:] {
		n, err := phone.Normalize(raw)
		if err != nil {
			fmt.Printf("skip %q: %v\n", raw, err)
			continue
		}
		fmt.Println("send SMS to", n)
	}
}`, "cmd/notifier/main.go"),
        code("text", String.raw`
$ go run ./cmd/notifier 0901234567 +84912345678
send SMS to +84901234567
skip "+84912345678": invalid phone number`),
        p("`strings.Map` calls the function for every rune and drops the rune when the function returns -1, so `+84912345678` becomes `84912345678`: 11 digits, first digit 8, rejected. Before you fix it, it is worth understanding the pieces you just used - the module, the two packages, and why `main.go` can call `phone.Normalize` but not `phone.onlyDigits`."),

        h2("3. Modules and packages"),
        p("A **module** is a tree of Go code with a `go.mod` file at the root. It is what you version, release and download. You create one with `go mod init` and a **module path**, which is usually where the code lives (a domain or a repository URL):"),
        code("text", String.raw`
$ go mod init saigonparcel.vn/trackd
go: creating new go.mod: module saigonparcel.vn/trackd
$ cat go.mod
module saigonparcel.vn/trackd

go 1.26.8`),
        p("The `go` line is the minimum Go version for the module; `go mod init` writes the version of your toolchain, and you may lower it to the oldest version your code supports. Dependencies are added to `go.mod` by `go get` and recorded with checksums in `go.sum`."),
        bullets([
            "**One directory is one package.** Every `.go` file in `internal/phone/` starts with `package phone`, and together they are one package: they share all names, as if they were one file.",
            "**The import path is the module path plus the directory:** `saigonparcel.vn/trackd/internal/phone`. The last element is, by convention, the package name, which is how you refer to it in code: `phone.Normalize`.",
            "**`package main` is a program.** A package named `main` with a `func main()` builds to an executable. The convention for a repository with several programs is one directory per program under `cmd/`: `go run ./cmd/notifier`, `go build ./cmd/notifier`.",
            "**`./...` means every package in the tree.** `go build ./...`, `go vet ./...` and `go test ./...` work on the whole module.",
        ]),
        h3("Exported names: the capital letter"),
        p("Go has no `public` or `private` keyword. A name declared at package level - a function, a type, a variable, a constant, a struct field or a method - is **exported** when it starts with an upper-case letter, and then other packages can use it. Everything else is visible only inside its own package:"),
        code("go", String.raw`
// In package phone:
var ErrInvalid = errors.New("invalid phone number")   // exported
func Normalize(raw string) (string, error) { ... }   // exported
func onlyDigits(s string) string { ... }              // unexported: package phone only

type Number struct {
	Country string // exported field
	digits  string // unexported field
}`),
        code("text", String.raw`
$ go build ./cmd/x           # main.go calls phone.onlyDigits("090 123 4567")
cmd/x/main.go:10:20: undefined: phone.onlyDigits

$ go build ./cmd/x           # main.go prints n.Country, n.digits
cmd/x/main.go:11:27: n.digits undefined (cannot refer to unexported field digits)`),
        p("This is the most important design tool in a package: export the few names other code should depend on, and keep the helpers unexported so you can change them freely. `onlyDigits` can be renamed or deleted tomorrow without touching any other package."),
        h3("internal/: a package only your module can import"),
        p("A directory named `internal` is enforced by the `go` command: a package below `internal/` can only be imported by code in the tree rooted at the **parent** of `internal`. `trackd/internal/phone` can be imported by anything inside `trackd/`, and by nothing outside it. The billing team's module tried:"),
        code("text", String.raw`
$ go build .                 # in module saigonparcel.vn/billing
package saigonparcel.vn/billing
	main.go:6:2: use of internal package saigonparcel.vn/trackd/internal/phone not allowed`),
        p("That is the point: `phone` is an implementation detail of trackd, and putting it under `internal/` means trackd's developers can change its API without breaking other teams. If billing really needs it, it becomes a real, versioned, non-internal package."),
        image("module-layout-visibility", {
            alt: "Three panels. Top left, The trackd repository: go.mod with module saigonparcel.vn/trackd; cmd/notifier/ with main.go, package main: a program; internal/phone/ with phone.go, package phone, and phone_test.go, package phone, built only by go test; and a box saying import path = module path + directory: saigonparcel.vn/trackd/internal/phone. Top right, Using package phone from ...: a green box cmd/notifier (same module), where phone.Normalize and phone.ErrInvalid are ok and phone.onlyDigits and n.digits are undefined, lower-case names stay inside package phone; a green box phone_test.go (same package), sees every name, exported or not; and a red box another module (saigonparcel.vn/billing), use of internal package ... not allowed. Bottom, go test ./... - for every package in the module, four steps connected by lines: 1. Build the package together with its _test.go files and run vet checks; 2. Run every TestXxx, func TestXxx(t *testing.T), t.Run gives each table row a name; 3. Record failures, t.Errorf: fail, keep going, t.Fatalf: fail, stop this (sub)test; 4. Report, ok .../phone or FAIL .../phone.",
            caption: "Exported names are the package's API, internal/ keeps the whole package inside the module, and the test files live next to the code they test.",
        }),
        challenge("chal_quiz_gof_411", "For each name, look at its first letter and at where the importing code lives. For the test, ask what t.Fatalf stops when there is no t.Run around the loop body."),

        h2("4. Your first test"),
        p("A test is a function in a file whose name ends in `_test.go`, in the same directory as the code. `go build` ignores these files; `go test` compiles them together with the package and runs every function of the form `func TestXxx(t *testing.T)`. Because the test file says `package phone`, it is part of the package and can call unexported helpers too."),
        p("The standard shape is a **table-driven test**: a slice of cases, one loop, and `t.Run` to give every case its own name. This is the test the trackd team wrote on Monday morning, before touching `Normalize`, with the case that broke on the weekend:"),
        code("go", String.raw`
package phone

import (
	"errors"
	"testing"
)

func TestNormalize(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		want    string
		wantErr error
	}{
		{"local", "0901234567", "+84901234567", nil},
		{"local with spaces", "090 123 4567", "+84901234567", nil},
		{"plus 84", "+84901234567", "+84901234567", nil},
		{"84 without plus", "84 90 123 4567", "+84901234567", nil},
		{"too short", "090123456", "", ErrInvalid},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Normalize(tc.raw)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("Normalize(%q) error = %v, want %v", tc.raw, err, tc.wantErr)
			}
			if got != tc.want {
				t.Errorf("Normalize(%q) = %q, want %q", tc.raw, got, tc.want)
			}
		})
	}
}`, "internal/phone/phone_test.go"),
        code("text", String.raw`
$ go test ./...
?   	saigonparcel.vn/trackd/cmd/notifier	[no test files]
--- FAIL: TestNormalize (0.00s)
    --- FAIL: TestNormalize/plus_84 (0.00s)
        phone_test.go:25: Normalize("+84901234567") error = invalid phone number, want <nil>
    --- FAIL: TestNormalize/84_without_plus (0.00s)
        phone_test.go:25: Normalize("84 90 123 4567") error = invalid phone number, want <nil>
FAIL
FAIL	saigonparcel.vn/trackd/internal/phone	0.008s
FAIL`),
        bullets([
            "**The test reproduces the incident** - `plus_84` fails - and it found a second case nobody had reported yet: `84 90 123 4567`, which customers type when they leave out the plus.",
            "**Every case has a name.** `t.Run` turns the name into a subtest; spaces become underscores (`plus_84`). The failure message says which case broke and what came out, so you do not need a debugger to start.",
            "**Write messages as `Func(input) = got, want want`.** That is the Go convention, and a reader of the CI log understands it without opening the test file.",
            "**`errors.Is(err, tc.wantErr)`** works for both kinds of case: with `wantErr` nil it is true only when `err` is nil, and with `ErrInvalid` it also matches an error that wraps it.",
        ]),
        h3("t.Errorf or t.Fatalf?"),
        p("Both mark the test as failed and print the message. The difference is what happens next:"),
        bullets([
            "**`t.Errorf`** records the failure and **continues**. Use it when the rest of the checks still make sense: here, comparing `got` with `want`.",
            "**`t.Fatalf`** records the failure and **stops the current test** (it calls `runtime.Goexit`). Use it when continuing makes no sense: here, when the error is wrong, `got` is meaningless.",
            "**Inside `t.Run`, \"the current test\" is the subtest.** A `t.Fatalf` stops one case and the loop goes on to the next one. Without `t.Run`, `t.Fatalf` stops the whole test function at the first bad case.",
        ]),
        p("A test `TestNormalizeLoop` with four similar rows (local, plus 84, 84 without plus, local with spaces), but with the body directly in the loop instead of in `t.Run`, hides a failing case:"),
        code("text", String.raw`
$ go test -run TestNormalizeLoop ./...
--- FAIL: TestNormalizeLoop (0.00s)
    phone_test.go:15: Normalize("+84901234567"): invalid phone number
FAIL
FAIL	saigonparcel.vn/trackd/internal/phone	0.041s
FAIL`),
        p("The `84 90 123 4567` case is just as broken, but the test stopped before it. You would fix one case, push, wait for CI, and only then see the next. With `t.Run`, one run shows every failing case."),

        h2("5. Running tests: the flags you need"),
        code("text", String.raw`
$ go test -v -run 'TestNormalize/plus' ./internal/phone
=== RUN   TestNormalize
=== RUN   TestNormalize/plus_84
    phone_test.go:25: Normalize("+84901234567") error = invalid phone number, want <nil>
=== RUN   TestNormalize/84_without_plus
    phone_test.go:25: Normalize("84 90 123 4567") error = invalid phone number, want <nil>
--- FAIL: TestNormalize (0.00s)
    --- FAIL: TestNormalize/plus_84 (0.00s)
    --- FAIL: TestNormalize/84_without_plus (0.00s)
FAIL
FAIL	saigonparcel.vn/trackd/internal/phone	0.059s
FAIL`),
        bullets([
            "**`-v`** prints every test and subtest as it runs, passing ones included (`=== RUN`, `--- PASS`). Without it, `go test` only prints failures and one `ok` or `FAIL` line per package.",
            "**`-run regexp`** runs only the tests whose name matches. The part after `/` matches subtest names - and it is a regular expression that matches anywhere in the name, so `plus` selected both `plus_84` and `84_without_plus`. Use `-run 'TestNormalize/^plus_84$'` for exactly one case.",
            "**`-cover`** reports the share of statements the tests executed: `coverage: 100.0% of statements`. It tells you what is not tested at all; it does not tell you that the tested code is right.",
            "**`-count=1`** runs the tests even when nothing changed. `go test` caches results of passing packages and prints `(cached)` instead of running them again.",
        ]),
        h3("go vet runs with every test"),
        p("`go test` runs a small set of `go vet` checks before the tests, and a vet problem fails the build. This test passes the string `got` to a `%d` verb:"),
        code("go", String.raw`
func TestLength(t *testing.T) {
	got, _ := Normalize("0901234567")
	if len(got) != 12 {
		t.Errorf("Normalize returned %d, want 12 characters", got)
	}
}`),
        code("text", String.raw`
$ go test ./...
# saigonparcel.vn/trackd/internal/phone
# [saigonparcel.vn/trackd/internal/phone]
internal/phone/phone_test.go:8:32: (*testing.common).Errorf format %d has arg got of wrong type string
FAIL	saigonparcel.vn/trackd/internal/phone [build failed]
FAIL`),
        p("Run the full `go vet ./...` in CI as well: it checks more (unreachable code, copied locks, wrong struct tags, misuse of `errors.As` and more), and it is fast."),
        callout("tip", "Test the package, not the program",
            "Keep main small: read flags and input, call a package, print the result. Then almost everything worth testing lives in a package with plain functions like Normalize, and tests can call those functions directly with a table of inputs. A main that does everything itself can only be tested by running the whole program."),

        h2("6. The fix"),
        p("With the test in place, the fix for the weekend incident is small: when the input starts with `+84`, that prefix replaces the leading 0. The `84 without plus` row went to the backlog (it is your challenge below), and three more rows were added for inputs that must never crash or pass: empty, too short, and only `+84`:"),
        code("go", String.raw`
// Normalize returns the number in E.164 form, e.g. "+84901234567".
// It accepts the local form (0901234567) and the international form (+84901234567),
// with spaces between the digit groups.
func Normalize(raw string) (string, error) {
	digits := onlyDigits(raw)
	if rest, ok := strings.CutPrefix(strings.TrimSpace(raw), "+84"); ok {
		digits = "0" + onlyDigits(rest) // +84 replaces the leading 0
	}
	if len(digits) != 10 || digits[0] != '0' {
		return "", ErrInvalid
	}
	return "+84" + digits[1:], nil
}`, "internal/phone/phone.go"),
        code("go", String.raw`
		{"local", "0901234567", "+84901234567", nil},
		{"local with spaces", "090 123 4567", "+84901234567", nil},
		{"plus 84", "+84901234567", "+84901234567", nil}, // the weekend incident
		{"plus 84 with spaces", "+84 90 123 4567", "+84901234567", nil},
		{"too short", "090123456", "", ErrInvalid},
		{"empty", "", "", ErrInvalid},
		{"only plus 84", "+84", "", ErrInvalid},`, "internal/phone/phone_test.go"),
        code("text", String.raw`
$ go test -v ./internal/phone
=== RUN   TestNormalize
=== RUN   TestNormalize/local
=== RUN   TestNormalize/local_with_spaces
=== RUN   TestNormalize/plus_84
=== RUN   TestNormalize/plus_84_with_spaces
=== RUN   TestNormalize/too_short
=== RUN   TestNormalize/empty
=== RUN   TestNormalize/only_plus_84
--- PASS: TestNormalize (0.00s)
    --- PASS: TestNormalize/local (0.00s)
    --- PASS: TestNormalize/local_with_spaces (0.00s)
    --- PASS: TestNormalize/plus_84 (0.00s)
    --- PASS: TestNormalize/plus_84_with_spaces (0.00s)
    --- PASS: TestNormalize/too_short (0.00s)
    --- PASS: TestNormalize/empty (0.00s)
    --- PASS: TestNormalize/only_plus_84 (0.00s)
PASS
ok  	saigonparcel.vn/trackd/internal/phone	0.011s

$ go test -cover ./...
	saigonparcel.vn/trackd/cmd/notifier		coverage: 0.0% of statements
ok  	saigonparcel.vn/trackd/internal/phone	0.068s	coverage: 100.0% of statements`),
        numbered([
            "**The test came first** and failed for the right reason. Only then was the code changed, and the same test proves the fix.",
            "**`strings.CutPrefix`** returns the rest and whether the prefix was there, so there is no index arithmetic that could panic on a short input like `+8` - the `only plus 84` row checks that edge.",
            "**CI runs `go vet ./...` and `go test ./...` on every pull request.** The Friday change would have failed the `plus_84` row before review.",
            "**100% coverage is not \"done\".** Every line ran, yet `84 90 123 4567` is still rejected and letters typed into a number are still silently dropped. Coverage shows what is not tested; only good cases show what is wrong.",
        ]),

        h2("7. Your turn"),
        p("Customer support has sent more rows for the table, and several still fail with the code above: `84 90 123 4567` is rejected, a number with letters typed into it is accepted because the letters are simply dropped, and a landline number gets an SMS that can never arrive. The SMS gateway team wrote down the exact rules at the top of the file. The test runner works like the table-driven test from this lesson: it reads `RAW|WANT` rows and prints `ok` or `FAIL` for each one, then `PASS`."),
        challenge("chal_fix_gof_412", "Stop dropping every non-digit: walk over the input once and decide for each character whether it is a digit, an allowed separator, a plus at the very start, or something that makes the number invalid. Then look at the prefix (+84, 84 with the right length, or 0) to get the 9 subscriber digits, and check their length and their first digit."),

        h2("8. Pitfalls"),
        bullets([
            "**Shared code without tests**: a helper that many services call is exactly the code that needs a table of every case anyone relies on.",
            "**Testing only the case you just changed**: keep the old cases in the table forever; the weekend bug was an old case nobody re-checked.",
            "**`t.Fatalf` in a loop without `t.Run`**: the first failing case hides all the others. Use `t.Run` per case.",
            "**Unnamed cases** (`{\"0901234567\", \"+84901234567\"}` only): the failure says `TestNormalize` failed, but not which row. Give every row a name.",
            "**Exporting everything**: every exported name is a promise to other packages. Start unexported and export what callers really need.",
            "**Shared helpers outside `internal/`**: other modules start importing them, and you can no longer change them. Put implementation details under `internal/`.",
            "**`-run` patterns that match more than you think**: they are regular expressions matched anywhere in the name. Anchor them with `^` and `$` when you need one test.",
            "**Reading `(cached)` as \"tests ran\"**: use `-count=1` when you want a real run, for example after changing test data files.",
        ]),

        h2("9. Checklist"),
        bullets([
            "The repository is one module with a `go.mod`; programs live in `cmd/<name>/`, shared code in packages, implementation details under `internal/`.",
            "Package-level names are unexported unless another package needs them.",
            "Every package with logic has a `_test.go` file with a table-driven test: named cases, `t.Run`, `Func(input) = got, want want` messages.",
            "`t.Fatalf` only when the rest of the case cannot be checked; `t.Errorf` otherwise.",
            "The table contains the cases from every bug report, and the edge cases: empty input, too short, too long, invalid characters.",
            "CI runs `go vet ./...` and `go test ./...` (with `-count=1` if test data can change) on every pull request.",
        ]),
        p("Next lesson: the mini project. You will build a small command-line tool from start to finish - reading input, counting, sorting and printing - in small functions that are easy to test."),
    ],
});
