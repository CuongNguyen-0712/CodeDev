package main

import (
	"bufio"
	"fmt"
	"os"
	"slices"
	"strconv"
	"strings"
)

// Saigon Parcel - driver shift ledger.
//
// During a shift every driver picks parcels up at the hub, then delivers them (collecting the
// cash on delivery) or marks them failed. At the end of the shift every parcel still on the
// bike counts as failed and goes back to the hub.
//
// Input (stdin): one command per line.
//   driver NAME             add a driver to the fleet
//   pickup NAME ID          the driver takes parcel ID
//   deliver NAME ID COD     the driver delivers parcel ID and collects COD VND
//   fail NAME ID            the delivery of parcel ID failed; it goes back to the hub now
//   end                     end of shift for every driver
//
// After the last command the runner prints one line per driver, in the order they were added:
//   NAME: delivered D, failed F, cash C VND, carrying [IDs]
//
// The bug: nothing sticks. Parcels that were picked up are "not carried" a moment later,
// counters stay at 0 and the end of the shift changes nothing. Fix the ledger so that every
// change is kept. Do not change the test runner or the output format.

type Driver struct {
	Name      string
	Carrying  []string // parcel ids on the bike, in pickup order
	Delivered int
	Failed    int
	Cash      int64 // VND collected today
}

// Pickup puts a parcel on the bike.
func (d Driver) Pickup(id string) {
	d.Carrying = append(d.Carrying, id)
}

// take removes id from the bike and reports whether the driver was carrying it.
func (d Driver) take(id string) bool {
	i := slices.Index(d.Carrying, id)
	if i < 0 {
		return false
	}
	d.Carrying = slices.Delete(d.Carrying, i, i+1)
	return true
}

// Deliver records a delivery and the cash collected for it.
func (d Driver) Deliver(id string, cod int64) error {
	if !d.take(id) {
		return fmt.Errorf("%s is not carrying %s", d.Name, id)
	}
	d.Delivered++
	d.Cash += cod
	return nil
}

// Fail records a failed delivery.
func (d Driver) Fail(id string) error {
	if !d.take(id) {
		return fmt.Errorf("%s is not carrying %s", d.Name, id)
	}
	d.Failed++
	return nil
}

// Line is the driver's line in the shift report.
func (d Driver) Line() string {
	return fmt.Sprintf("%s: delivered %d, failed %d, cash %d VND, carrying %v",
		d.Name, d.Delivered, d.Failed, d.Cash, d.Carrying)
}

type Fleet struct {
	drivers []Driver
}

func (f *Fleet) Add(name string) {
	f.drivers = append(f.drivers, Driver{Name: name})
}

// Find returns the driver with that name, or nil.
func (f *Fleet) Find(name string) *Driver {
	for _, d := range f.drivers {
		if d.Name == name {
			return &d
		}
	}
	return nil
}

// EndShift sends every parcel still on a bike back to the hub as failed.
func (f *Fleet) EndShift() {
	for _, d := range f.drivers {
		d.Failed += len(d.Carrying)
		d.Carrying = nil
	}
}

// ---------------------------------------------------------------- test runner (do not change)
func main() {
	fleet := &Fleet{}
	sc := bufio.NewScanner(os.Stdin)
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) == 0 {
			continue
		}
		if f[0] == "driver" && len(f) == 2 {
			fleet.Add(f[1])
			continue
		}
		if f[0] == "end" {
			fleet.EndShift()
			continue
		}
		if len(f) < 3 {
			fmt.Println("bad line:", sc.Text())
			continue
		}
		d := fleet.Find(f[1])
		if d == nil {
			fmt.Println("error: no driver", f[1])
			continue
		}
		var err error
		switch {
		case f[0] == "pickup":
			d.Pickup(f[2])
		case f[0] == "deliver" && len(f) == 4:
			cod, perr := strconv.ParseInt(f[3], 10, 64)
			if perr != nil {
				fmt.Println("bad COD:", f[3])
				continue
			}
			err = d.Deliver(f[2], cod)
		case f[0] == "fail":
			err = d.Fail(f[2])
		default:
			fmt.Println("bad line:", sc.Text())
		}
		if err != nil {
			fmt.Println("error:", err)
		}
	}
	for _, d := range fleet.drivers {
		fmt.Println(d.Line())
	}
}
