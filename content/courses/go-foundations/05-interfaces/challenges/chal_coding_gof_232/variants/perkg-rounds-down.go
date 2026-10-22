package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Saigon Parcel - delivery fee quotes.
//
// A delivery fee is the sum of several fee rules. Every rule is a small type that satisfies
// FeeRule: it computes its part of the fee for one parcel, and it describes itself (String)
// on the printed quote. Write the methods of the four rule types and Quote.
//
//   Flat{Amount}            every parcel pays Amount.
//                           String: "flat 15000 VND"
//   PerKg{Amount}           Amount for every STARTED kilogram: 1-1000 g is 1 kg, 1001-2000 g is 2 kg ...
//                           String: "5000 VND per started kg"
//   District{Name, Amount}  Amount only for parcels going to district Name, 0 for every other parcel.
//                           String: "+10000 VND in thu-duc"
//   Capped{Rule, Max}       what Rule charges, but never more than Max. Rule can be any FeeRule.
//                           String: "at most 40000 VND of (8000 VND per started kg)"
//   Quote(rules, p)         the sum of every rule's fee for p.
//
// Input (stdin): rule lines first, then parcel lines.
//   rule flat AMOUNT
//   rule perkg AMOUNT
//   rule district NAME AMOUNT
//   rule capped MAX <another rule>          e.g. rule capped 40000 perkg 8000
//   parcel ID WEIGHT_GRAMS DISTRICT
//
// Example input:
//   rule flat 15000
//   rule perkg 5000
//   parcel SP-4001 2300 q3
// Expected output:
//   rules:
//   - flat 15000 VND
//   - 5000 VND per started kg
//   SP-4001 2300g q3
//     flat 15000 VND: 15000
//     5000 VND per started kg: 15000
//     total: 30000 VND
//
// The runner builds the rules as values (Flat{...}, not &Flat{...}) and stores them in a
// []FeeRule, so every rule type must satisfy FeeRule as a value.

type Parcel struct {
	ID       string
	WeightG  int    // grams, at least 1
	District string // q1, q3, binh-thanh, thu-duc, go-vap ...
}

// FeeRule is one part of a delivery fee.
type FeeRule interface {
	Fee(p Parcel) int64 // VND
	String() string     // how the rule appears on a quote
}

type Flat struct{ Amount int64 }

type PerKg struct{ Amount int64 }

type District struct {
	Name   string
	Amount int64
}

type Capped struct {
	Rule FeeRule
	Max  int64
}

func (f Flat) Fee(p Parcel) int64 { return f.Amount }
func (f Flat) String() string     { return fmt.Sprintf("flat %d VND", f.Amount) }

func (r PerKg) Fee(p Parcel) int64 {
	return int64(p.WeightG/1000) * r.Amount
}
func (r PerKg) String() string { return fmt.Sprintf("%d VND per started kg", r.Amount) }

func (d District) Fee(p Parcel) int64 {
	if p.District != d.Name {
		return 0
	}
	return d.Amount
}
func (d District) String() string { return fmt.Sprintf("+%d VND in %s", d.Amount, d.Name) }

// Capped wraps any other rule: it only needs the FeeRule interface, not a concrete type.
func (c Capped) Fee(p Parcel) int64 { return min(c.Rule.Fee(p), c.Max) }
func (c Capped) String() string {
	return fmt.Sprintf("at most %d VND of (%v)", c.Max, c.Rule)
}

// Quote returns the total fee for p: the sum of every rule's fee.
func Quote(rules []FeeRule, p Parcel) int64 {
	var total int64
	for _, r := range rules {
		total += r.Fee(p)
	}
	return total
}

// ---------------------------------------------------------------- test runner (do not change)
func parseRule(f []string) (FeeRule, error) {
	num := func(i int) (int64, error) {
		if i >= len(f) {
			return 0, fmt.Errorf("missing number in %q", strings.Join(f, " "))
		}
		return strconv.ParseInt(f[i], 10, 64)
	}
	if len(f) == 0 {
		return nil, fmt.Errorf("missing rule")
	}
	switch f[0] {
	case "flat":
		n, err := num(1)
		return Flat{Amount: n}, err
	case "perkg":
		n, err := num(1)
		return PerKg{Amount: n}, err
	case "district":
		n, err := num(2)
		return District{Name: f[1], Amount: n}, err
	case "capped":
		max, err := num(1)
		if err != nil {
			return nil, err
		}
		inner, err := parseRule(f[2:])
		return Capped{Rule: inner, Max: max}, err
	}
	return nil, fmt.Errorf("unknown rule %q", f[0])
}

func main() {
	var rules []FeeRule
	printed := false
	sc := bufio.NewScanner(os.Stdin)
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) == 0 {
			continue
		}
		switch {
		case f[0] == "rule":
			r, err := parseRule(f[1:])
			if err != nil {
				fmt.Println("bad rule:", err)
				return
			}
			rules = append(rules, r)
		case f[0] == "parcel" && len(f) == 4:
			if !printed {
				fmt.Println("rules:")
				for _, r := range rules {
					fmt.Println("-", r)
				}
				printed = true
			}
			w, err := strconv.Atoi(f[2])
			if err != nil {
				fmt.Println("bad weight:", f[2])
				return
			}
			p := Parcel{ID: f[1], WeightG: w, District: f[3]}
			fmt.Printf("%s %dg %s\n", p.ID, p.WeightG, p.District)
			for _, r := range rules {
				fmt.Printf("  %v: %d\n", r, r.Fee(p))
			}
			fmt.Printf("  total: %d VND\n", Quote(rules, p))
		default:
			fmt.Println("bad line:", sc.Text())
			return
		}
	}
}
