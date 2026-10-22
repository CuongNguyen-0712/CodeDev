// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, image, challenge }) => ({
    _id: "lesson-gof-4-2",
    title: "Mini project: a word-frequency CLI",
    slug: { _type: "slug", current: "go-mini-project-word-frequency-cli" },
    description:
        "Customer care at Saigon Parcel wanted to know what customers complain about most. The first script said 'giao' and 'shipper', never mentioned 'trễ' (late), printed a different list on every run, and one week silently counted only a quarter of the messages. Build the replacement, wordfreq, step by step: read input with bufio.Scanner and its line limit, split Vietnamese text into words with strings.FieldsFunc and unicode, count with a map, sort with slices.SortFunc and cmp for output that is the same on every run, add a -n flag, and test the pieces with go test.",
    estimatedTime: 22,

    scenario: {
        role: "Junior Go developer on the platform team at Saigon Parcel, a delivery company in Ho Chi Minh City",
        problem:
            "Every Monday, customer care exports last week's feedback messages, one per line, and a small script prints the most frequent words for the operations meeting. The list never showed late deliveries, the most common complaint, and it changed every time it was run. One week it was based on 1,280 of 5,400 messages, and nobody noticed until the totals were compared with the export.",
    },

    content: [
        h2("1. The incident"),
        p("Customer care's feedback export is a text file with one customer message per line, in Vietnamese, typed on phones: `Giao hàng trễ 2 ngày, shipper không gọi trước.` A colleague wrote a quick script to count the words, and the operations meeting has used its top list for a month: customers talk about `giao` (deliver), `shipper` and `hàng` (goods)."),
        p("Then a manager read 50 messages by hand. Most of them were about late deliveries - `trễ` - which was not on the list at all. Two people running the script on the same file got two different lists. And the week after a customer pasted a whole chat log into the feedback box, the script reported 1,280 messages instead of 5,400, without any error."),
        bullets([
            "**Punctuation and capital letters split one word into many.** `trễ,`, `trễ.`, `trễ!` and `trễ` were four different words, each too rare to make the list. `Giao` and `giao` were two.",
            "**Map order is random.** The script printed the map directly, so the order - and which words were cut off - changed between runs.",
            "**`bufio.Scanner` stopped at a line over 64 KiB** and the script never checked `sc.Err()`, so everything after the chat log was ignored.",
        ]),
        p("This lesson builds the replacement, `wordfreq`, using everything from this course: types and zero values, slices and maps, functions, errors, the standard library's generic helpers, and a test."),

        h2("2. Reproduce it"),
        p("The script, and a four-line sample of the export in `feedback.txt`:"),
        code("go", String.raw`
package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// Counts the words in customer feedback, one message per line.
func main() {
	counts := map[string]int{}
	sc := bufio.NewScanner(os.Stdin)
	for sc.Scan() {
		for _, w := range strings.Split(sc.Text(), " ") {
			counts[w]++
		}
	}
	for w, c := range counts {
		if c > 1 {
			fmt.Printf("%q %d\n", w, c)
		}
	}
}`, "v1.go"),
        code("text", String.raw`
Giao hàng trễ 2 ngày, shipper không gọi trước.
giao hàng nhanh, shipper thân thiện
Hàng bị móp, giao trễ.
Shipper  gọi không được, giao trễ!`, "feedback.txt"),
        code("text", String.raw`
$ go run v1.go < feedback.txt
"không" 2
"giao" 3
"shipper" 2
"hàng" 2
"gọi" 2
$ go run v1.go < feedback.txt
"gọi" 2
"shipper" 2
"không" 2
"hàng" 2
"giao" 3`),
        p("`trễ` appears in three of the four messages and is missing. `giao` appears four times and is counted three times, because one is `Giao`. `shipper` and `hàng` are undercounted the same way. And the two runs print the same counts in a different order: Go deliberately randomises the iteration order of maps, so that no program can depend on it."),
        p("The third bug needs a long line. This program builds an export with a 132 KB message in the middle and counts its lines twice:"),
        code("go", String.raw`
package main

import (
	"bufio"
	"fmt"
	"strings"
)

func countLines(sc *bufio.Scanner) {
	lines := 0
	for sc.Scan() {
		lines++
	}
	fmt.Println("lines read:", lines, "- err:", sc.Err())
}

func main() {
	// One customer pasted a whole chat log into the feedback box: about 130 KB on one line.
	long := strings.Repeat("rất tệ ", 12_000)
	export := "Giao hàng nhanh\n" + long + "\nGiao trễ\nShipper không gọi\n"
	fmt.Println("bytes:", len(export))

	countLines(bufio.NewScanner(strings.NewReader(export)))

	sc := bufio.NewScanner(strings.NewReader(export))
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024) // allow lines up to 1 MiB
	countLines(sc)
}`, "long.go"),
        code("text", String.raw`
$ go run long.go
bytes: 132050
lines read: 1 - err: bufio.Scanner: token too long
lines read: 4 - err: <nil>`),
        p("`len` counts bytes: `rất tệ ` is 7 characters but 11 bytes in UTF-8. The first scanner reads one line, then `Scan` returns false - exactly what it does at the end of the input. The only difference is `sc.Err()`, which v1 never called."),

        h2("3. Reading input"),
        p("`bufio.Scanner` is the standard way to read input line by line. It reads in chunks from any `io.Reader` and hands you one line at a time, without the newline:"),
        bullets([
            "**The loop is always the same:** `for sc.Scan() { ... sc.Text() ... }`, then **`if err := sc.Err(); err != nil`**. `Scan` returns false both at the end of the input and on an error; only `Err` tells them apart (it returns nil at a normal end).",
            "**A line may be at most 64 KiB by default** (`bufio.MaxScanTokenSize`). Longer lines give `bufio.Scanner: token too long`. `sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)` keeps the 64 KiB starting buffer and lets it grow to 1 MiB. Pick a limit: a file with no newlines at all should still fail, not eat all memory.",
            "**Read from an `io.Reader`, not from `os.Stdin` directly.** A function `countWords(r io.Reader)` works with `os.Stdin`, a file from `os.Open`, and `strings.NewReader(\"...\")` in a test.",
            "**`io.ReadAll(r)`** reads everything into one `[]byte`. It is simpler when the input is small and you need it all at once; the scanner keeps memory flat for big exports.",
        ]),

        h2("4. Splitting Vietnamese text into words"),
        p("`strings.Split(s, \" \")` splits at every single space, so two spaces in a row give an empty string, and punctuation stays attached to the word. `strings.Fields(s)` is better - it splits at any run of white space and never returns empty strings - but `trễ,` is still one field. What we want is \"a word is a run of letters and digits; everything else separates words\". That is `strings.FieldsFunc`, which splits wherever your function returns true:"),
        code("go", String.raw`
// words splits text into lower-case words: runs of letters and digits.
func words(text string) []string {
	return strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
}`),
        p("Both functions work on **runes** (Unicode code points), not bytes, which is exactly what Vietnamese text needs:"),
        code("go", String.raw`
fmt.Println(strings.ToLower("GIAO HÀNG CHẬM, ĐÓNG GÓI ẨU"))
fmt.Println(len("trễ"), len([]rune("trễ")))
fmt.Printf("[%-6s] [%-6s]\n", "tre", "trễ")
// giao hàng chậm, đóng gói ẩu
// 5 3
// [tre   ] [trễ   ]`),
        bullets([
            "**`strings.ToLower`** lower-cases every letter it knows, `Ẩ` and `Đ` included.",
            "**`unicode.IsLetter`** is true for `ễ`, `ơ`, `đ` and letters of every other script, not only a-z. `unicode.IsDigit` keeps numbers such as the `2` in `trễ 2 ngày` as words of their own.",
            "**`len` of a string is its size in bytes**: `trễ` is 3 runes but 5 bytes. Use `len([]rune(s))` or `utf8.RuneCountInString(s)` to count characters. `fmt` widths such as `%-6s` count runes, so columns of Vietnamese words still line up.",
        ]),
        callout("warning", "The same word can be stored in two ways",
            "Unicode allows à to be one code point (U+00E0, composed form) or an a followed by a combining grave accent (U+0300, decomposed form). They look identical, but they are different strings: \"hàng\" == \"ha\\u0300ng\" is false. A combining mark is not a letter for unicode.IsLetter, so the decomposed form even splits into \"ha\" and \"ng\". Most phones and browsers send the composed form; text pasted from some PDF or Mac tools may not. The fix is to normalise to the composed form (NFC) before counting, with the golang.org/x/text/unicode/norm package - a module outside the standard library."),
        p("Here is that difference in a real run:"),
        code("go", String.raw`
composed := "hàng"         // à is one code point, U+00E0
decomposed := "hàng" // a + U+0300 COMBINING GRAVE ACCENT
fmt.Println(composed == decomposed, len(composed), len(decomposed))
fmt.Printf("%q %q\n", words(composed), words(decomposed))
fmt.Println(unicode.IsLetter('̀'), unicode.Is(unicode.Mn, '̀'))
// false 5 6
// ["hàng"] ["ha" "ng"]
// false true`),

        h2("5. Counting and a stable order"),
        p("Counting is the easy part: `counts[w]++` works even for a word that is not in the map yet, because a missing key reads as the zero value 0. The order is the part v1 got wrong. A map has no order, so to print \"the top N\" you copy the entries into a slice and sort the slice:"),
        code("go", String.raw`
type WordCount struct {
	Word  string
	Count int
}

// topN returns the n most frequent words: highest count first, ties in word order.
func topN(counts map[string]int, n int) []WordCount {
	list := make([]WordCount, 0, len(counts))
	for w, c := range counts {
		list = append(list, WordCount{w, c})
	}
	slices.SortFunc(list, func(a, b WordCount) int {
		return cmp.Or(
			cmp.Compare(b.Count, a.Count), // more frequent first
			cmp.Compare(a.Word, b.Word),   // ties: in word order, the same on every run
		)
	})
	return list[:min(n, len(list))]
}`),
        bullets([
            "**`make([]WordCount, 0, len(counts))`** creates an empty slice with room for every entry, so `append` never has to grow it.",
            "**The tie-breaker is not optional.** `hàng`, `shipper` and `trễ` all have count 3. Sorting by count alone leaves their order to the sort algorithm and the random map order - which brings back exactly the \"different list on every run\" bug. With `cmp.Or`, equal counts fall through to comparing the words.",
            "**`cmp.Compare` on strings compares bytes**, so `a` < `b` < `z` < `à` < `ễ`. That is not Vietnamese dictionary order (that needs `golang.org/x/text/collate`), but it is fixed and documented, which is what a report needs.",
            "**`list[:min(n, len(list))]`** never slices past the end: with 3 distinct words and `-n 10`, it returns all 3 instead of panicking with `slice bounds out of range`.",
        ]),
        image("word-count-pipeline", {
            alt: "A pipeline of four boxes connected by arrows. 1. Read lines: bufio.Scanner, one message per line; a line over 64 KiB stops it, check sc.Err(); sc.Buffer(buf, 1 MiB) raises the limit. 2. Split into words: strings.ToLower and strings.FieldsFunc, a word = letters and digits; \"Giao trễ!\" becomes [giao trễ]. 3. Count: counts[w]++ in a map[string]int; ranging over a map gives a different order each run. 4. Sort and cut: slices.SortFunc, count high to low, then word A to Z, then list[:min(n, len)]. Below, a red panel Version 1: strings.Split(line, \" \") lists its bugs: \"Giao\" and \"giao\" are two different words; \"trễ,\" \"trễ.\" \"trễ!\" are three more words; \"\" is counted for double spaces; random order, the report changes every run; no sc.Err() check, it stops early and says nothing; \"trễ\" (late) never reached the top list. A green panel wordfreq -n 5 < feedback.txt shows the output giao 4, hàng 3, shipper 3, trễ 3, gọi 2, with the note hàng, shipper, trễ: a tie, so in word order; same input, same output, every run.",
            caption: "Each bug in the first script sits in one step of the pipeline, so each fix is one small function with its own test.",
        }),

        h2("6. Command-line flags"),
        p("The meeting wants the top 5, the weekly email the top 20. The standard `flag` package turns `-n 5` into a variable:"),
        code("go", String.raw`
n := flag.Int("n", 10, "number of words to print")
flag.Parse()
// ... *n is the value: 10 by default, 5 with -n 5`),
        bullets([
            "**`flag.Int` returns a `*int`**, a pointer to the variable that `flag.Parse` fills in; read it with `*n`. There are `flag.String`, `flag.Bool`, `flag.Duration` and others.",
            "**`flag.Parse()` must run before you read the values**, and it parses `os.Args[1:]`. Arguments that are not flags are left in `flag.Args()`.",
            "**You get help and error messages for free:**",
        ]),
        code("text", String.raw`
$ ./wordfreq -n abc < feedback.txt
invalid value "abc" for flag -n: parse error
Usage of ./wordfreq:
  -n int
    	number of words to print (default 10)
$ echo $?
2`),

        h2("7. The program"),
        p("All the pieces together. `main` only wires them up: parse the flag, count, print. Each piece is a plain function that a test can call:"),
        code("go", String.raw`
// wordfreq prints the most frequent words in customer feedback, one message per line.
//
//	wordfreq -n 5 < feedback.txt
package main

import (
	"bufio"
	"cmp"
	"flag"
	"fmt"
	"io"
	"os"
	"slices"
	"strings"
	"unicode"
)

type WordCount struct {
	Word  string
	Count int
}

// words splits text into lower-case words: runs of letters and digits.
func words(text string) []string {
	return strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
}

// countWords counts the words in r, line by line.
func countWords(r io.Reader) (map[string]int, error) {
	counts := map[string]int{}
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024) // feedback lines up to 1 MiB
	for sc.Scan() {
		for _, w := range words(sc.Text()) {
			counts[w]++
		}
	}
	return counts, sc.Err()
}

// topN returns the n most frequent words: highest count first, ties in word order.
func topN(counts map[string]int, n int) []WordCount {
	list := make([]WordCount, 0, len(counts))
	for w, c := range counts {
		list = append(list, WordCount{w, c})
	}
	slices.SortFunc(list, func(a, b WordCount) int {
		return cmp.Or(
			cmp.Compare(b.Count, a.Count), // more frequent first
			cmp.Compare(a.Word, b.Word),   // ties: in word order, the same on every run
		)
	})
	return list[:min(n, len(list))]
}

func main() {
	n := flag.Int("n", 10, "number of words to print")
	flag.Parse()

	counts, err := countWords(os.Stdin)
	if err != nil {
		fmt.Fprintln(os.Stderr, "wordfreq:", err)
		os.Exit(1)
	}
	for _, wc := range topN(counts, *n) {
		fmt.Printf("%-8s %d\n", wc.Word, wc.Count)
	}
}`, "main.go"),
        code("text", String.raw`
$ go mod init saigonparcel.vn/wordfreq
go: creating new go.mod: module saigonparcel.vn/wordfreq
$ go build -o wordfreq .
$ ./wordfreq -n 5 < feedback.txt
giao     4
hàng     3
shipper  3
trễ      3
gọi      2
$ ./wordfreq -n 5 < feedback.txt | md5sum
512434cb7017eb3dd8546ff704bf55c4  -
$ ./wordfreq -n 5 < feedback.txt | md5sum
512434cb7017eb3dd8546ff704bf55c4  -`),
        p("`trễ` is on the list, `giao` counts all four, and two runs give byte-for-byte the same output. A read error now goes to standard error with exit code 1, so a script or a cron job that runs `wordfreq` can see that the report is incomplete."),
        h3("The test"),
        p("The tests from the previous lesson apply directly: a table for `words` with every case that broke v1, and a test that ties are ordered. `countWords` takes an `io.Reader`, so the test feeds it a `strings.Reader`:"),
        code("go", String.raw`
package main

import (
	"slices"
	"strings"
	"testing"
)

func TestWords(t *testing.T) {
	tests := []struct {
		name string
		text string
		want []string
	}{
		{"punctuation", "giao trễ, giao trễ!", []string{"giao", "trễ", "giao", "trễ"}},
		{"upper case", "GIAO Hàng", []string{"giao", "hàng"}},
		{"digits", "trễ 2 ngày", []string{"trễ", "2", "ngày"}},
		{"double spaces", "  shipper   gọi ", []string{"shipper", "gọi"}},
		{"empty", "", nil},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := words(tc.text); !slices.Equal(got, tc.want) {
				t.Errorf("words(%q) = %q, want %q", tc.text, got, tc.want)
			}
		})
	}
}

func TestTopNTies(t *testing.T) {
	counts, err := countWords(strings.NewReader("b a c\nc a b\n"))
	if err != nil {
		t.Fatal(err)
	}
	got := topN(counts, 2)
	want := []WordCount{{"a", 2}, {"b", 2}}
	if !slices.Equal(got, want) {
		t.Errorf("topN = %v, want %v", got, want)
	}
}`, "main_test.go"),
        code("text", String.raw`
$ go test -v ./...
=== RUN   TestWords
=== RUN   TestWords/punctuation
=== RUN   TestWords/upper_case
=== RUN   TestWords/digits
=== RUN   TestWords/double_spaces
=== RUN   TestWords/empty
--- PASS: TestWords (0.00s)
    --- PASS: TestWords/punctuation (0.00s)
    --- PASS: TestWords/upper_case (0.00s)
    --- PASS: TestWords/digits (0.00s)
    --- PASS: TestWords/double_spaces (0.00s)
    --- PASS: TestWords/empty (0.00s)
=== RUN   TestTopNTies
--- PASS: TestTopNTies (0.00s)
PASS
ok  	saigonparcel.vn/wordfreq	0.015s`),
        numbered([
            "**Words are defined, not guessed:** runs of letters and digits, lower-cased. Punctuation, capitals and double spaces no longer create fake words.",
            "**The order is fully specified** by count and then by word, so the output is reproducible and diffable from week to week.",
            "**Input errors are reported.** `sc.Err()` is returned and checked, and the line limit is raised on purpose rather than hit by accident.",
            "**`main` is thin.** Everything with logic is a function with a test; `main` only connects flags, input and output.",
        ]),

        h2("8. Your turn"),
        p("The operations meeting liked the new list and immediately asked for more. Most Vietnamese words have two syllables - `giao hàng` (delivery), `thân thiện` (friendly), `đóng gói` (packing) - so counting single syllables mixes up `hàng` in `giao hàng` with `hàng` in `mặt hàng`. They want the most frequent **phrases**: pairs of neighbouring words. A phrase must not jump over a comma or a full stop, because `ngày, shipper` is not a phrase anyone wrote."),
        challenge("chal_coding_gof_421", "Split the message into clauses first: strings.FieldsFunc can split at the clause characters just as well as at non-letters. Then split each clause into words like the words function in this lesson, and join each word with the next one. For top, copy the map into a slice and sort it with a tie-breaker, then cut it with min."),

        h2("9. Pitfalls"),
        bullets([
            "**`strings.Split(s, \" \")` for words**: empty strings for double spaces and punctuation glued to words. Use `strings.Fields` or `strings.FieldsFunc`.",
            "**Forgetting to lower-case**: `Giao` and `giao` become two words. Normalise case (and, for pasted text, Unicode form) before counting.",
            "**Not calling `sc.Err()`**: a scanner that hits an error looks exactly like one that reached the end of the input.",
            "**Lines longer than 64 KiB**: set `sc.Buffer` with a sensible maximum when your input can contain long lines.",
            "**Printing a map, or sorting without a tie-breaker**: the output changes between runs. Sort a slice with a full order.",
            "**`list[:n]` when the list may be shorter**: `slice bounds out of range`. Use `list[:min(n, len(list))]`.",
            "**`len(s)` as \"number of characters\"**: it is bytes. Vietnamese letters with diacritics take 2 or 3 bytes each.",
            "**All the logic in `main`**: it cannot be tested without running the program. Put it in functions that take an `io.Reader` and return values.",
        ]),

        h2("10. Checklist"),
        bullets([
            "Input is read through an `io.Reader`; every scanner loop is followed by an `sc.Err()` check.",
            "Words are defined explicitly (`strings.FieldsFunc` with `unicode.IsLetter` / `unicode.IsDigit`) and lower-cased.",
            "Results are copied from the map into a slice and sorted with a comparison that has a tie-breaker.",
            "Slicing to \"the first n\" uses `min(n, len(list))`.",
            "Flags have defaults and help text; errors go to standard error with a non-zero exit code.",
            "Each function has a table-driven test with the cases that broke the previous version.",
        ]),

        h2("11. Where to go next"),
        p("This was the last lesson of Go Fundamentals. You can now read and write everyday Go: variables and zero values, slices and the aliasing trap, maps and structs, pointers and methods, interfaces, errors as values, generics, packages and tests - and you have built a small tool from start to finish."),
        bullets([
            "**Concurrency in Go: Goroutines, Channels & Context** is the natural next course: run work in parallel with goroutines, connect it with channels, and stop it cleanly with `context` - for example to count several export files at once.",
            "**Cloud-Native Go: Building an API Gateway** builds a real HTTP service: `net/http`, middleware, configuration, observability and deployment.",
            "**Keep practising on your own tools.** Extend `wordfreq` with a stop-word list, a `-min` flag for the minimum count, or JSON output with `encoding/json` - and write the test first each time.",
        ]),
    ],
});
