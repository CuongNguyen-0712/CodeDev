package main

import (
	"encoding/json"
	"fmt"
	"os"
)

// Rice Rocket API gateway: what the process does when Kubernetes sends SIGTERM during a rollout.
//
// At SIGTERM (time 0) Kubernetes also starts removing the pod from the Service's endpoints; the
// load balancers keep sending new requests to it for a short while (up to cfg.PropagationMs).
// The kubelet sends SIGKILL at cfg.GracePeriodMs (terminationGracePeriodSeconds).
// onSigterm must:
//   - keep serving long enough (cfg.DrainDelayMs) for the load balancers to stop sending traffic;
//   - then stop accepting and wait for in-flight requests, but stop waiting in time to finish the
//     rest before the grace period ends (leave cfg.WorkerStopMs + cfg.ExitMarginMs);
//   - stop the background workers and flush the logs;
//   - exit 0 when every request finished, 1 when some had to be cut.
// All waiting goes through g (a virtual clock): never call time.Sleep or os.Exit yourself.

type Config struct {
	GracePeriodMs int64 `json:"gracePeriodMs"`
	PropagationMs int64 `json:"propagationMs"`
	DrainDelayMs  int64 `json:"drainDelayMs"`
	WorkerStopMs  int64 `json:"workerStopMs"`
	ExitMarginMs  int64 `json:"exitMarginMs"`
}

type Gateway interface {
	Sleep(ms int64)                 // keep serving for ms
	Shutdown(timeoutMs int64) error // close the listener, wait up to timeoutMs for in-flight requests; error if some were cut
	StopWorkers()                   // cancel the workers' context and wait for them (takes cfg.WorkerStopMs)
	FlushLogs()
	Exit(code int)
}

func onSigterm(g Gateway, cfg Config) {
	// [ ] Keep serving while the load balancers forget this pod
	// [ ] Stop accepting and wait for requests within the budget
	// [ ] Stop the background workers and flush the logs
	// [ ] Exit 0 only when every request finished
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: {"config": Config, "requests": [{"arriveMs": t, "durationMs": d}, ...]} (t < 0: already in
// flight at SIGTERM; the load balancers send nothing after config.propagationMs).
// Output: requests served ("ok"), refused at a closed listener (the ingress answers 502), cut while in
// flight; the exit code and time, whether SIGKILL hit, whether the worker's job was lost and the logs flushed.

type request struct {
	ArriveMs   int64 `json:"arriveMs"`
	DurationMs int64 `json:"durationMs"`
}

type sim struct {
	cfg        Config
	reqs       []request
	now        int64
	closedAt   int64 // -1 while the listener is open
	cutAt      int64 // in-flight requests not done by then are cut; -1 = none
	dead       bool
	killed     bool
	exitCode   *int
	exitAt     int64
	workersOff bool
	flushed    bool
}

func (s *sim) advance(to int64) bool {
	if s.dead {
		return false
	}
	if to > s.cfg.GracePeriodMs {
		s.now, s.dead, s.killed = s.cfg.GracePeriodMs, true, true
		return false
	}
	s.now = to
	return true
}

func (s *sim) Sleep(ms int64) { s.advance(s.now + ms) }

func (s *sim) Shutdown(timeoutMs int64) error {
	if s.dead {
		return nil
	}
	s.closedAt = s.now
	last := s.now
	for _, r := range s.reqs {
		if r.ArriveMs < s.closedAt && r.ArriveMs+r.DurationMs > last {
			last = r.ArriveMs + r.DurationMs
		}
	}
	if last-s.now > timeoutMs {
		s.cutAt = s.now + timeoutMs
		s.advance(s.cutAt)
		return fmt.Errorf("context deadline exceeded")
	}
	s.advance(last)
	return nil
}

func (s *sim) StopWorkers() {
	if s.advance(s.now + s.cfg.WorkerStopMs) {
		s.workersOff = true
	}
}

func (s *sim) FlushLogs() {
	if !s.dead {
		s.flushed = true
	}
}

func (s *sim) Exit(code int) {
	if s.dead {
		return
	}
	s.dead, s.exitCode, s.exitAt = true, &code, s.now
}

func main() {
	var in struct {
		Config   Config    `json:"config"`
		Requests []request `json:"requests"`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		fmt.Println(`{"error":"bad input"}`)
		return
	}
	s := &sim{cfg: in.Config, reqs: in.Requests, closedAt: -1, cutAt: -1}
	onSigterm(s, in.Config)
	if !s.dead { // returned without exiting: the kubelet kills it at the end of the grace period
		s.now, s.dead, s.killed = s.cfg.GracePeriodMs, true, true
	}
	end := s.now // the process is gone from here on
	if s.cutAt >= 0 && s.cutAt < end {
		end = s.cutAt
	}
	out := struct {
		OK          int   `json:"ok"`
		Refused     int   `json:"refused"`
		Cut         int   `json:"cut"`
		ExitCode    *int  `json:"exitCode"`
		ExitAtMs    int64 `json:"exitAtMs"`
		Killed      bool  `json:"killed"`
		JobLost     bool  `json:"jobLost"`
		LogsFlushed bool  `json:"logsFlushed"`
	}{ExitCode: s.exitCode, ExitAtMs: s.now, Killed: s.killed, JobLost: !s.workersOff, LogsFlushed: s.flushed}
	for _, r := range in.Requests {
		switch {
		case s.closedAt >= 0 && r.ArriveMs >= s.closedAt:
			out.Refused++
		case s.closedAt < 0 && r.ArriveMs >= s.now:
			out.Refused++ // arrived after the process was gone
		case r.ArriveMs+r.DurationMs > end:
			out.Cut++
		default:
			out.OK++
		}
	}
	data, _ := json.Marshal(out)
	fmt.Println(string(data))
}
