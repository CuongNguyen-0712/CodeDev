package main

import (
	"encoding/json"
	"fmt"
	"os"
)

// Rice Rocket API gateway: a circuit breaker in front of the menu service.
//
// Every request for a menu goes through serve(), one request after another. The breaker:
//   closed     requests go through; FailureThreshold failures IN A ROW open it
//   open       requests are refused at once (503) until OpenForMs has passed since it opened
//   half-open  requests go through as trials; one failure opens it again (a new cool-down),
//              SuccessThreshold successes in a row close it
// Only upstream problems are failures: a call cut at TimeoutMs (the client gets 504) and a 5xx
// (the client gets 502). A 4xx (an unknown dish id, a bad query) is the client's fault: for the
// breaker it is a success.
// Times are milliseconds; a call's outcome is recorded when it ends (arrival + time waited).

type Config struct {
	TimeoutMs        int64 `json:"timeoutMs"`
	FailureThreshold int   `json:"failureThreshold"`
	OpenForMs        int64 `json:"openForMs"`
	SuccessThreshold int   `json:"successThreshold"`
}

// Upstream is what the menu service would answer to a request at that moment.
type Upstream struct {
	Status    int   `json:"status"`
	LatencyMs int64 `json:"latencyMs"`
}

type Breaker struct {
	cfg         Config
	state       string // "closed", "open" or "half-open"
	failures    int    // failures in a row while closed
	successes   int    // successes in a row while half-open
	openedAt    int64
	transitions []string
}

func (b *Breaker) moveTo(state string, now int64) {
	b.transitions = append(b.transitions, fmt.Sprintf("%d %s->%s", now, b.state, state))
	b.state = state
}

// allow reports whether a request arriving at now may go to the upstream.
func (b *Breaker) allow(now int64) bool {
	// [ ] Open: refuse until the cool-down is over, then try
	return true
}

// record feeds the outcome of one upstream call, ending at now, back into the breaker.
func (b *Breaker) record(now int64, failed bool) {
	// [ ] Half-open: reopen on a failure, close after enough successes
	// [ ] Closed: count failures in a row, open at the threshold
}

// serve answers one client request arriving at now: the status the client gets, how long it
// waited and whether the menu service was called.
func serve(b *Breaker, now int64, up Upstream) (status int, waitedMs int64, called bool) {
	if !b.allow(now) {
		return 503, 0, false // fail fast; the handler also sets Retry-After
	}
	// [ ] Call the menu service, cut the call at the timeout
	// [ ] Tell the breaker whether the menu service failed
	return status, waitedMs, true
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: {"config": Config, "requests": [{"t": ms, "status": int, "latencyMs": ms}, ...]} in arrival order.
// Output: the status each client got, the upstream calls made, the total client wait, the
// breaker's transitions and its final state.
func main() {
	var in struct {
		Config   Config `json:"config"`
		Requests []struct {
			T int64 `json:"t"`
			Upstream
		} `json:"requests"`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		fmt.Println(`{"error":"bad input"}`)
		return
	}
	b := &Breaker{cfg: in.Config, state: "closed", transitions: []string{}}
	out := struct {
		Statuses      []int    `json:"statuses"`
		UpstreamCalls int      `json:"upstreamCalls"`
		ClientWaitMs  int64    `json:"clientWaitMs"`
		Transitions   []string `json:"transitions"`
		State         string   `json:"state"`
	}{Statuses: []int{}}
	for _, r := range in.Requests {
		status, waited, called := serve(b, r.T, r.Upstream)
		out.Statuses = append(out.Statuses, status)
		out.ClientWaitMs += waited
		if called {
			out.UpstreamCalls++
		}
	}
	out.Transitions, out.State = b.transitions, b.state
	data, _ := json.Marshal(out)
	fmt.Println(string(data))
}
