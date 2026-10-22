package main

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strings"
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
	// Check every character first: stripping "everything that is not a digit" also
	// accepted letters and other junk.
	var b strings.Builder
	for i, r := range raw {
		switch {
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ' || r == '.' || r == '-':
			// a separator: drop it
		case r == '+' && i == 0:
			b.WriteRune(r)
		default:
			return "", fmt.Errorf("%w: unexpected %q in %q", errInvalid, r, raw)
		}
	}
	number := b.String()

	var subscriber string
	switch {
	case strings.HasPrefix(number, "+84"):
		subscriber = number[3:]
	case strings.HasPrefix(number, "84") && len(number) == 11:
		subscriber = number[2:]
	case strings.HasPrefix(number, "0"):
		subscriber = number[1:]
	default:
		return "", fmt.Errorf("%w: %q has no 0, 84 or +84 prefix", errInvalid, raw)
	}
	if len(subscriber) != 9 {
		return "", fmt.Errorf("%w: %q is not a mobile number", errInvalid, raw)
	}
	return "+84" + subscriber, nil
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
