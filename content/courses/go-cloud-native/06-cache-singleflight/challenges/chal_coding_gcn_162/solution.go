package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

// Rice Rocket API gateway: restaurant menus cached in the gateway.
//
// menuCache.Get(key) answers from a TTL cache and calls the menu service (fetch) only when it must:
//   - an entry younger than ttlMs on the cache's clock is returned without a call;
//   - concurrent misses for the same key share ONE call (single-flight) and all get its result;
//   - a failed call is never cached: the next request tries again;
//   - when the call fails and an expired entry exists, the expired value is served (stale-if-error).
// Get is called from many goroutines at once.

type entry struct {
	value     string
	fetchedAt int64 // ms on the cache's clock
}

// call is one fetch in flight; waiters block on done and then read value / err.
type call struct {
	done  chan struct{}
	value string
	err   error
}

type menuCache struct {
	mu       sync.Mutex
	ttlMs    int64
	now      func() int64
	fetch    func(key string) (string, error)
	entries  map[string]entry
	inflight map[string]*call
}

func (c *menuCache) Get(key string) (string, error) {
	c.mu.Lock()
	// @piece fresh-hit: Serve a fresh entry without calling the menu service
	if e, ok := c.entries[key]; ok && c.now()-e.fetchedAt < c.ttlMs {
		c.mu.Unlock()
		return e.value, nil
	}
	// @end
	// @piece join-inflight: Wait for a call already on its way and use its result
	if cl, ok := c.inflight[key]; ok {
		c.mu.Unlock()
		<-cl.done
		return cl.value, cl.err
	}
	// @end
	cl := &call{done: make(chan struct{})}
	c.inflight[key] = cl
	c.mu.Unlock()

	value, err := c.fetch(key)

	c.mu.Lock()
	// @piece store-result: Keep a success, fall back to the stale entry on a failure
	if err == nil {
		c.entries[key] = entry{value: value, fetchedAt: c.now()}
	} else if e, ok := c.entries[key]; ok {
		value, err = e.value, nil
	}
	// @end
	// @piece finish-call: Hand the result to the waiters and forget the finished call
	cl.value, cl.err = value, err
	delete(c.inflight, key)
	close(cl.done)
	// @end
	c.mu.Unlock()
	return value, err
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: {"ttlMs": ms, "steps": [{"atMs": clock, "requests": n, "origin": "<menu version>" | "error"}]}.
// Each step sets the clock, then sends n concurrent requests for the same restaurant; the menu
// service answers after 50 ms of real time with the step's origin. Output per step: the calls the
// menu service got and how many clients received each value ("error" for a failure).
func main() {
	var in struct {
		TTLMs int64 `json:"ttlMs"`
		Steps []struct {
			AtMs     int64  `json:"atMs"`
			Requests int    `json:"requests"`
			Origin   string `json:"origin"`
		} `json:"steps"`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		fmt.Println(`{"error":"bad input"}`)
		return
	}
	var clock atomic.Int64
	var calls atomic.Int64
	var origin atomic.Value
	cache := &menuCache{
		ttlMs:    in.TTLMs,
		now:      clock.Load,
		entries:  map[string]entry{},
		inflight: map[string]*call{},
		fetch: func(key string) (string, error) {
			calls.Add(1)
			time.Sleep(50 * time.Millisecond)
			if v := origin.Load().(string); v != "error" {
				return v, nil
			}
			return "", errors.New("menu service: 503")
		},
	}
	type stepOut struct {
		OriginCalls int64          `json:"originCalls"`
		Results     map[string]int `json:"results"`
	}
	out := struct {
		Steps []stepOut `json:"steps"`
	}{Steps: []stepOut{}}
	for _, s := range in.Steps {
		clock.Store(s.AtMs)
		origin.Store(s.Origin)
		before := calls.Load()
		results := map[string]int{}
		var mu sync.Mutex
		var wg sync.WaitGroup
		start := make(chan struct{})
		for i := 0; i < s.Requests; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-start
				v, err := cache.Get("restaurant:rr-118")
				if err != nil {
					v = "error"
				}
				mu.Lock()
				results[v]++
				mu.Unlock()
			}()
		}
		close(start)
		wg.Wait()
		out.Steps = append(out.Steps, stepOut{OriginCalls: calls.Load() - before, Results: results})
	}
	data, _ := json.Marshal(out)
	fmt.Println(string(data))
}
