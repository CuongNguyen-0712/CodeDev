package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// Saigon Parcel - daily district report from tracking events.
//
// Input (stdin): tracking events in time order, one per line: ID DISTRICT STATUS
//   ID        parcel id, e.g. SP-3001
//   DISTRICT  q1, q3, binh-thanh, thu-duc, go-vap ...
//   STATUS    out (out for delivery), delivered, failed or returned
// A parcel usually has several events during the day (out, then delivered ...).
// Only its LAST event counts: a parcel counts once, in its district, with its last status.
//
// Write report and busiest. The test runner prints one line per district, sorted by
// district name, then the busiest district:
//   q1: parcels 3, delivered 1, failed 1, returned 0
//   q3: parcels 1, delivered 0, failed 0, returned 1
//   busiest: q1, parcels 3
// A parcel whose last status is out counts as a parcel but in none of the three columns.
// busiest is the district with the most parcels; on a tie, the first one by name.
// With no events at all the runner prints "no parcels".
//
// Example input:
//   SP-3001 q1 out
//   SP-3002 q3 out
//   SP-3001 q1 delivered
//   SP-3002 q3 failed
//   SP-3002 q3 returned
// Expected output:
//   q1: parcels 1, delivered 1, failed 0, returned 0
//   q3: parcels 1, delivered 0, failed 0, returned 1
//   busiest: q1, parcels 1

type Event struct {
	ID       string
	District string
	Status   string
}

type DistrictReport struct {
	Name      string
	Parcels   int
	Delivered int
	Failed    int
	Returned  int
}

// report returns one DistrictReport per district that has at least one parcel,
// sorted by district name.
func report(events []Event) []DistrictReport {
	// TODO
	return nil
}

// busiest returns the report with the most parcels (the first by name on a tie).
// ok is false when reports is empty.
func busiest(reports []DistrictReport) (best DistrictReport, ok bool) {
	// TODO
	return DistrictReport{}, false
}

// ---------------------------------------------------------------- test runner (do not change)
func main() {
	var events []Event
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
		events = append(events, Event{ID: f[0], District: f[1], Status: f[2]})
	}

	reports := report(events)
	for _, r := range reports {
		fmt.Printf("%s: parcels %d, delivered %d, failed %d, returned %d\n",
			r.Name, r.Parcels, r.Delivered, r.Failed, r.Returned)
	}
	if b, ok := busiest(reports); ok {
		fmt.Printf("busiest: %s, parcels %d\n", b.Name, b.Parcels)
	} else {
		fmt.Println("no parcels")
	}
}
