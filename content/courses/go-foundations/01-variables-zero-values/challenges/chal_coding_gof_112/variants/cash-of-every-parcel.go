package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Saigon Parcel - end-of-day cash-on-delivery (COD) summary for one driver.
//
// Input (stdin): one parcel per line, three fields separated by spaces:
//   ID      parcel id, e.g. SP-2001
//   COD     cash to collect, in VND (an integer; 0 for parcels paid online)
//   STATUS  delivered, failed or returned
//
// Write summarize and successRate. The test runner at the bottom prints:
//   parcels: N
//   delivered: D (R%)     R = D / N * 100 with one decimal, e.g. 66.7
//                         "delivered: 0 (n/a)" when there are no parcels at all
//   cash: C VND           the sum of COD over DELIVERED parcels only
//   largest: ID A VND     the delivered parcel with the largest COD (the first one on a tie)
//                         "largest: none" when no parcel was delivered
//
// Example input:
//   SP-2001 350000 delivered
//   SP-2002 120000 failed
//   SP-2003 89000 delivered
// Expected output:
//   parcels: 3
//   delivered: 2 (66.7%)
//   cash: 439000 VND
//   largest: SP-2001 350000 VND

type Parcel struct {
	ID     string
	COD    int64  // VND
	Status string // "delivered", "failed" or "returned"
}

type Summary struct {
	Parcels   int    // every parcel in the input
	Delivered int    // parcels with Status "delivered"
	Cash      int64  // sum of COD over delivered parcels, in VND
	Largest   Parcel // delivered parcel with the largest COD; the zero Parcel when none was delivered
}

// summarize computes the driver's summary for the day.
func summarize(parcels []Parcel) Summary {
	s := Summary{Parcels: len(parcels)}
	for _, p := range parcels {
		s.Cash += p.COD
		if p.Status != "delivered" {
			continue
		}
		s.Delivered++
		// The zero Parcel has COD 0, so "p.COD > s.Largest.COD" alone would skip a first parcel
		// that was paid online. An empty ID means "nothing chosen yet".
		if s.Largest.ID == "" || p.COD > s.Largest.COD {
			s.Largest = p
		}
	}
	return s
}

// successRate returns delivered/total as a percentage between 0 and 100.
// ok is false when total is 0 (there is no rate to report).
func successRate(delivered, total int) (rate float64, ok bool) {
	if total == 0 {
		return 0, false
	}
	return float64(delivered) / float64(total) * 100, true
}

// ---------------------------------------------------------------- test runner (do not change)
func main() {
	var parcels []Parcel
	sc := bufio.NewScanner(os.Stdin)
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) == 0 {
			continue
		}
		if len(f) != 3 {
			fmt.Println("bad line:", sc.Text())
			return
		}
		cod, err := strconv.ParseInt(f[1], 10, 64)
		if err != nil {
			fmt.Println("bad COD:", f[1])
			return
		}
		parcels = append(parcels, Parcel{ID: f[0], COD: cod, Status: f[2]})
	}

	s := summarize(parcels)
	fmt.Println("parcels:", s.Parcels)
	if rate, ok := successRate(s.Delivered, s.Parcels); ok {
		fmt.Printf("delivered: %d (%.1f%%)\n", s.Delivered, rate)
	} else {
		fmt.Printf("delivered: %d (n/a)\n", s.Delivered)
	}
	fmt.Printf("cash: %d VND\n", s.Cash)
	if s.Largest.ID == "" {
		fmt.Println("largest: none")
	} else {
		fmt.Printf("largest: %s %d VND\n", s.Largest.ID, s.Largest.COD)
	}
}
