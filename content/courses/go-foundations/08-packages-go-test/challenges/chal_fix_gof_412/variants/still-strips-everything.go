package main

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strings"
	"unicode"
)

// Saigon Parcel - normalizePhone for the SMS gateway (package phone, copied into one file).
//
// After the weekend incident, normalizePhone accepts +84 numbers again. Customer support has
// now sent more rows for the test table, and some of them still fail. Make every row pass.
//
// The rules (from the SMS gateway team):
//   - Allowed characters: digits, spaces, dots and dashes as separators, and one '+' only
//     as the very first character. Any other character (letters, '(', '/', ...) -> invalid.
//   - After removing the separators the number is one of:
//       0 + 9 digits        local form           0901234567
//       +84 + 9 digits      international form   +84901234567
//       84 + 9 digits       international, no +  84901234567
//   - The 9 digits are the subscriber number. Mobile numbers start with 3, 5, 7, 8 or 9;
//     anything else (for example 0201234567, a landline) -> invalid.
//   - Result: "+84" followed by the 9 digits, e.g. "+84901234567".
//   - Invalid input returns errInvalid (wrapped or not) and "".
//
// The test runner below works like a table-driven test. Input (stdin): one case per line,
//   RAW|WANT        WANT is the expected number, or "invalid"
// It prints "ok   ..." or "FAIL ..." for every case, then PASS or FAIL with a count.
//
// Example input:
//   0901234567|+84901234567
//   84 90 123 4567|+84901234567
// Expected output:
//   ok   "0901234567"
//   ok   "84 90 123 4567"
//   PASS

var errInvalid = errors.New("invalid phone number")

// normalizePhone returns raw as an E.164 Vietnamese mobile number, e.g. "+84901234567".
func normalizePhone(raw string) (string, error) {
	digits := onlyDigits(raw)
	trimmed := strings.TrimSpace(raw)
	switch {
	case strings.HasPrefix(trimmed, "+84"):
		digits = "0" + digits[2:]
	case strings.HasPrefix(digits, "84") && len(digits) == 11:
		digits = "0" + digits[2:]
	}
	if len(digits) != 10 || digits[0] != '0' || !strings.ContainsRune("35789", rune(digits[1])) {
		return "", errInvalid
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
}

// ---------------------------------------------------------------- test runner (do not change)
func main() {
	sc := bufio.NewScanner(os.Stdin)
	cases, failed := 0, 0
	for sc.Scan() {
		line := sc.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		raw, want, found := strings.Cut(line, "|")
		if !found {
			fmt.Println("bad line:", line)
			return
		}
		cases++
		got, err := normalizePhone(raw)
		switch {
		case want == "invalid" && errors.Is(err, errInvalid) && got == "":
			fmt.Printf("ok   %q\n", raw)
		case want == "invalid":
			failed++
			fmt.Printf("FAIL %q: got %q (err %v), want invalid\n", raw, got, err)
		case err != nil:
			failed++
			fmt.Printf("FAIL %q: got error %v, want %s\n", raw, err, want)
		case got != want:
			failed++
			fmt.Printf("FAIL %q: got %s, want %s\n", raw, got, want)
		default:
			fmt.Printf("ok   %q\n", raw)
		}
	}
	if failed == 0 {
		fmt.Println("PASS")
	} else {
		fmt.Printf("FAIL: %d of %d cases\n", failed, cases)
	}
}
