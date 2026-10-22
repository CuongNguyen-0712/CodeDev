package main

import (
	"bufio"
	"cmp"
	"fmt"
	"os"
	"slices"
	"strconv"
	"strings"
	"unicode"
)

// Saigon Parcel - feedback report, part 2: two-word phrases.
//
// Most Vietnamese words have two syllables ("giao hàng", "thân thiện", "đóng gói"), so the
// single-word report mixes up "hàng" in "giao hàng" with "hàng" in "mặt hàng". Customer care
// wants the most frequent PHRASES: pairs of neighbouring words.
//
// Write phrases and top:
//   phrases(message) splits one message into lower-case words (runs of letters and digits, as
//     in the lesson) and returns every pair of neighbouring words, joined by one space, in order.
//     A phrase never crosses a clause break: the characters . , ; : ! ? end a clause.
//     Any other character that is not a letter or digit (spaces, dashes, quotes, brackets)
//     only separates words. A clause with fewer than two words has no phrases.
//       "Giao hàng trễ 2 ngày, shipper không gọi!"
//       -> "giao hàng", "hàng trễ", "trễ 2", "2 ngày", "shipper không", "không gọi"
//   top(counts, n) returns the n most frequent phrases: highest count first, ties in
//     ascending string order; all of them when there are fewer than n.
//
// Input (stdin): the first line is N (1 or more); every other line is one feedback message.
// The test runner counts the phrases of every message (phrases never cross messages) and prints
//   PHRASE COUNT        one line per phrase from top(counts, N)
//   phrases T, unique U
//
// Example input:
//   2
//   Giao hàng nhanh. Giao hàng tốt!
//   giao hàng trễ
// Expected output:
//   giao hàng 3
//   hàng nhanh 1
//   phrases 6, unique 4

type PhraseCount struct {
	Phrase string
	Count  int
}

// phrases returns the pairs of neighbouring lower-case words in message, clause by clause.
func phrases(message string) []string {
	var out []string
	clauses := strings.FieldsFunc(message, func(r rune) bool {
		return strings.ContainsRune(".,;:!?", r)
	})
	for _, clause := range clauses {
		words := strings.FieldsFunc(strings.ToLower(clause), func(r rune) bool {
			return !unicode.IsLetter(r) && !unicode.IsDigit(r)
		})
		for i := 1; i < len(words); i++ {
			out = append(out, words[i-1]+" "+words[i])
		}
	}
	return out
}

// top returns the n most frequent phrases: highest count first, ties in ascending order.
func top(counts map[string]int, n int) []PhraseCount {
	list := make([]PhraseCount, 0, len(counts))
	for p, c := range counts {
		list = append(list, PhraseCount{p, c})
	}
	slices.SortFunc(list, func(a, b PhraseCount) int {
		return cmp.Or(cmp.Compare(b.Count, a.Count), cmp.Compare(b.Phrase, a.Phrase))
	})
	return list[:min(n, len(list))]
}

// ---------------------------------------------------------------- test runner (do not change)
func main() {
	sc := bufio.NewScanner(os.Stdin)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	if !sc.Scan() {
		fmt.Println("missing N")
		return
	}
	n, err := strconv.Atoi(strings.TrimSpace(sc.Text()))
	if err != nil || n < 1 {
		fmt.Println("bad N:", sc.Text())
		return
	}
	counts := map[string]int{}
	total := 0
	for sc.Scan() {
		for _, p := range phrases(sc.Text()) {
			counts[p]++
			total++
		}
	}
	for _, pc := range top(counts, n) {
		fmt.Println(pc.Phrase, pc.Count)
	}
	fmt.Printf("phrases %d, unique %d\n", total, len(counts))
}
