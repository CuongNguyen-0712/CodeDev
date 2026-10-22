package main

import (
	"bufio"
	"fmt"
	"os"
	"slices"
	"strings"
)

// Saigon Parcel route planner: one route per driver.
//
// Every route starts with the same prefix (the depot and the sorting hub), followed by that
// driver's own stops. During the day a stop can be cancelled: the driver gets a new route
// without it, and the planned route is kept unchanged for the evening report.
//
// Input (stdin), one command per line:
//   prefix STOP...           the shared prefix (always the first line)
//   driver NAME STOP...      a driver and their stops, in order (a driver may have no stops)
//   cancel NAME STOP         remove STOP from NAME's current route (nothing happens if it is not there)
//
// Output: "route NAME: ..." for every driver (current route), then "planned NAME: ..." for
// every driver (the route as first planned), then "prefix: ...", stops joined with " > ".
//
// The bug: drivers get each other's stops, and after a cancel the planned route is wrong too.
// Fix buildRoutes and withoutStop. Do not change the test runner.

// buildRoutes returns one route per driver: the shared prefix followed by that driver's stops.
// It must not change prefix or stops.
func buildRoutes(prefix []string, stops [][]string) [][]string {
	routes := make([][]string, 0, len(stops))
	for _, s := range stops {
		routes = append(routes, slices.Concat(prefix, s))
	}
	return routes
}

// withoutStop returns route without the first occurrence of stop. It must not change route:
// the caller keeps the old route as the planned one.
func withoutStop(route []string, stop string) []string {
	i := slices.Index(route, stop)
	if i < 0 {
		return route
	}
	return slices.Delete(route, i, i+1)
}

// ---------------------------------------------------------------- test runner (do not change)
func main() {
	// The prefix loader reserves room for the stops that usually follow, like the real one.
	prefix := make([]string, 0, 16)
	var names []string
	var stops [][]string
	var cancels [][2]string

	sc := bufio.NewScanner(os.Stdin)
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) == 0 {
			continue
		}
		switch {
		case f[0] == "prefix":
			prefix = append(prefix, f[1:]...)
		case f[0] == "driver" && len(f) >= 2:
			names = append(names, f[1])
			stops = append(stops, f[2:])
		case f[0] == "cancel" && len(f) == 3:
			cancels = append(cancels, [2]string{f[1], f[2]})
		default:
			fmt.Println("bad line:", sc.Text())
			return
		}
	}

	planned := buildRoutes(prefix, stops)
	current := slices.Clone(planned) // the outer slice is copied; each route is still shared
	for _, c := range cancels {
		if i := slices.Index(names, c[0]); i >= 0 {
			current[i] = withoutStop(current[i], c[1])
		}
	}

	for i, name := range names {
		fmt.Printf("route %s: %s\n", name, strings.Join(current[i], " > "))
	}
	for i, name := range names {
		fmt.Printf("planned %s: %s\n", name, strings.Join(planned[i], " > "))
	}
	fmt.Println("prefix:", strings.Join(prefix, " > "))
}
