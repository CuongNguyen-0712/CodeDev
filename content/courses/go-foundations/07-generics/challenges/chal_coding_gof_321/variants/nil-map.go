package main

import (
	"bufio"
	"cmp"
	"fmt"
	"os"
	"slices"
	"strconv"
	"strings"
)

// Saigon Parcel - one set of generic helpers for every report.
//
// The reports team has groupParcelsByDistrict, groupDriversByShift, sumCOD, sumWeight, sumStops...
// all copy-pasted, all slightly different. Replace them with three generic functions:
//
//   GroupBy(items, key)   groups items by key(item); inside each group the items keep their input order
//   SumBy(items, value)   adds up value(item) over all items (0 for no items)
//   SortedKeys(m)         the keys of m in ascending order
//
// The test runner below uses them on two different types: parcels (grouped by district, summing
// int64 COD and float64 weight) and drivers (grouped by shift, summing int stops).
//
// Input (stdin), one record per line:
//   parcel ID DISTRICT COD_VND WEIGHT_KG     e.g. parcel SP-2001 q1 350000 1.5
//   driver NAME SHIFT STOPS                  e.g. driver an morning 12
//
// Output: one line per district, then one line per shift, each in ascending key order:
//   district q1: SP-2001 SP-2003 (470000 VND, 3.0 kg)
//   shift morning: an bich (21 stops)
//   (no district / shift lines when there are no parcels / drivers)

// Number is every type whose underlying type is an integer or float type used in the reports.
type Number interface {
	~int | ~int64 | ~float64
}

// GroupBy groups items by key(item). Items in each group keep the order they had in items.
func GroupBy[T any, K comparable](items []T, key func(T) K) map[K][]T {
	var groups map[K][]T
	for _, item := range items {
		k := key(item)
		groups[k] = append(groups[k], item)
	}
	return groups
}

// SumBy returns the sum of value(item) over all items, or 0 when there are none.
func SumBy[T any, N Number](items []T, value func(T) N) N {
	var total N
	for _, item := range items {
		total += value(item)
	}
	return total
}

// SortedKeys returns the keys of m in ascending order.
func SortedKeys[K cmp.Ordered, V any](m map[K]V) []K {
	keys := make([]K, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	return keys
}

// ---------------------------------------------------------------- test runner (do not change)

type Parcel struct {
	ID       string
	District string
	COD      int64   // VND
	WeightKg float64 // kg
}

type Driver struct {
	Name  string
	Shift string
	Stops int
}

func main() {
	var parcels []Parcel
	var drivers []Driver
	sc := bufio.NewScanner(os.Stdin)
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		switch {
		case len(f) == 0:
			continue
		case f[0] == "parcel" && len(f) == 5:
			cod, err1 := strconv.ParseInt(f[3], 10, 64)
			kg, err2 := strconv.ParseFloat(f[4], 64)
			if err1 != nil || err2 != nil {
				fmt.Println("bad line:", sc.Text())
				return
			}
			parcels = append(parcels, Parcel{f[1], f[2], cod, kg})
		case f[0] == "driver" && len(f) == 4:
			stops, err := strconv.Atoi(f[3])
			if err != nil {
				fmt.Println("bad line:", sc.Text())
				return
			}
			drivers = append(drivers, Driver{f[1], f[2], stops})
		default:
			fmt.Println("bad line:", sc.Text())
			return
		}
	}

	byDistrict := GroupBy(parcels, func(p Parcel) string { return p.District })
	for _, d := range SortedKeys(byDistrict) {
		group := byDistrict[d]
		ids := make([]string, 0, len(group))
		for _, p := range group {
			ids = append(ids, p.ID)
		}
		cod := SumBy(group, func(p Parcel) int64 { return p.COD })
		kg := SumBy(group, func(p Parcel) float64 { return p.WeightKg })
		fmt.Printf("district %s: %s (%d VND, %.1f kg)\n", d, strings.Join(ids, " "), cod, kg)
	}

	byShift := GroupBy(drivers, func(d Driver) string { return d.Shift })
	for _, s := range SortedKeys(byShift) {
		group := byShift[s]
		names := make([]string, 0, len(group))
		for _, d := range group {
			names = append(names, d.Name)
		}
		stops := SumBy(group, func(d Driver) int { return d.Stops })
		fmt.Printf("shift %s: %s (%d stops)\n", s, strings.Join(names, " "), stops)
	}
}
