package main

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"slices"
	"strings"
)

// Saigon Parcel - trackd, the parcel tracking API (cut down to its error handling).
//
// Every request goes handler -> service (lookup, reschedule) -> store. Errors travel back up,
// and statusFor turns the final error into the HTTP status code:
//   200  no error
//   400  the request is invalid: a *ValidationError anywhere in the error chain
//   404  the parcel does not exist: ErrNotFound anywhere in the chain
//   409  the parcel is already delivered and cannot be rescheduled: ErrConflict in the chain
//   500  anything else
// Keep the texts of the error messages as they are: the bugs are in how errors are returned,
// wrapped and compared.
//
// Input (stdin): one request per line.
//   get ID                 look a parcel up
//   reschedule ID DAY      move a delivery to another day (mon tue wed thu fri sat)
// The runner prints one line per request:
//   get SP-2001: 200 SP-2001 out_for_delivery
//   get SP-9999: 404 lookup SP-9999: parcel not found
//
// The bug: trackd answers 500 for almost everything - for parcels that exist, for unknown
// parcels and for invalid ids. Fix the error handling so every request gets the status code
// above. Do not change the test runner, the store contents or the error messages.

var (
	ErrNotFound = errors.New("parcel not found")
	ErrConflict = errors.New("parcel already delivered")
)

// ValidationError says which part of a request is invalid and why.
type ValidationError struct {
	Field  string
	Reason string
}

func (e *ValidationError) Error() string { return e.Field + ": " + e.Reason }

type Parcel struct {
	ID     string
	Status string
	Day    string // delivery day after a reschedule
}

type Store struct {
	parcels map[string]*Parcel
}

func (s *Store) Get(id string) (*Parcel, error) {
	p, ok := s.parcels[id]
	if !ok {
		return nil, ErrNotFound
	}
	return p, nil
}

// validateID checks an id like SP-2001: "SP-" followed by 4 characters.
func validateID(id string) error {
	// Return a literal nil on success: a nil *ValidationError stored in an error is not a nil error.
	switch {
	case !strings.HasPrefix(id, "SP-"):
		return &ValidationError{Field: "id", Reason: "must start with SP-"}
	case len(id) != 7:
		return &ValidationError{Field: "id", Reason: "must be SP- and 4 digits"}
	}
	return nil
}

func validateDay(day string) error {
	if !slices.Contains([]string{"mon", "tue", "wed", "thu", "fri", "sat"}, day) {
		return &ValidationError{Field: "day", Reason: "must be one of mon tue wed thu fri sat"}
	}
	return nil
}

func lookup(s *Store, id string) (*Parcel, error) {
	if err := validateID(id); err != nil {
		return nil, fmt.Errorf("lookup %s: %w", id, err)
	}
	p, err := s.Get(id)
	if err != nil {
		return nil, fmt.Errorf("lookup %s: %w", id, err)
	}
	return p, nil
}

func reschedule(s *Store, id, day string) (*Parcel, error) {
	p, err := lookup(s, id)
	if err != nil {
		return nil, fmt.Errorf("reschedule: %w", err)
	}
	if err := validateDay(day); err != nil {
		return nil, fmt.Errorf("reschedule %s: %w", id, err)
	}
	if p.Status == "delivered" {
		return nil, fmt.Errorf("reschedule %s: %w", id, ErrConflict)
	}
	p.Day = day
	return p, nil
}

// statusFor maps the error a request ended with to its HTTP status code.
func statusFor(err error) int {
	if err == nil {
		return 200
	}
	// errors.Is and errors.As look through every %w wrapper; == and a type assertion do not.
	var verr *ValidationError
	switch {
	case errors.As(err, &verr):
		return 400
	case errors.Is(err, ErrNotFound):
		return 404
	case errors.Is(err, ErrConflict):
		return 409
	}
	return 500
}

// ---------------------------------------------------------------- test runner (do not change)
func main() {
	store := &Store{parcels: map[string]*Parcel{
		"SP-2001": {ID: "SP-2001", Status: "out_for_delivery"},
		"SP-2002": {ID: "SP-2002", Status: "delivered"},
		"SP-2003": {ID: "SP-2003", Status: "at_hub"},
	}}
	sc := bufio.NewScanner(os.Stdin)
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) == 0 {
			continue
		}
		var p *Parcel
		var err error
		switch {
		case f[0] == "get" && len(f) == 2:
			p, err = lookup(store, f[1])
		case f[0] == "reschedule" && len(f) == 3:
			p, err = reschedule(store, f[1], f[2])
		default:
			fmt.Println("bad line:", sc.Text())
			continue
		}
		code := statusFor(err)
		switch {
		case err != nil:
			fmt.Printf("%s: %d %v\n", strings.Join(f, " "), code, err)
		case p.Day != "":
			fmt.Printf("%s: %d %s %s, day %s\n", strings.Join(f, " "), code, p.ID, p.Status, p.Day)
		default:
			fmt.Printf("%s: %d %s %s\n", strings.Join(f, " "), code, p.ID, p.Status)
		}
	}
}
