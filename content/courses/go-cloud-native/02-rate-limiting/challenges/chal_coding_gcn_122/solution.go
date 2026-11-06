// Rice Rocket API gateway: per-client rate limiting with a token bucket.
// Each client (an API key, else its address) gets a bucket of `burst` tokens that refills at
// `rate` tokens per second; a request spends one token or is refused with 429 + Retry-After.
package main

import (
	"encoding/json"
	"fmt"
	"math"
	"net/netip"
	"os"
	"strings"
	"time"
)

// The cloud load balancer in front of the gateway; it appends the address it saw to X-Forwarded-For.
var loadBalancers = netip.MustParsePrefix("10.0.0.0/8")

type bucket struct {
	tokens float64
	last   time.Time
}

// Limiter keeps one token bucket per client key.
type Limiter struct {
	rate    float64 // tokens added per second
	burst   float64 // bucket size
	buckets map[string]*bucket
}

func NewLimiter(rate float64, burst int) *Limiter {
	return &Limiter{rate: rate, burst: float64(burst), buckets: map[string]*bucket{}}
}

// Allow spends one token from key's bucket. When none is left it returns false and how long
// until the next token.
func (l *Limiter) Allow(key string, now time.Time) (bool, time.Duration) {
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	}
	// @piece refill: Refill for the time since the last call, capped at the burst
	b.tokens = math.Min(l.burst, b.tokens+now.Sub(b.last).Seconds()*l.rate)
	b.last = now
	// @end
	// @piece take-token: Spend a token, or work out the wait for the next one
	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	return false, time.Duration((1 - b.tokens) / l.rate * float64(time.Second))
	// @end
}

// retryAfter is the Retry-After header value: whole seconds, never 0 for a refused request.
func retryAfter(wait time.Duration) string {
	// @piece retry-after: Whole seconds, rounded up
	return fmt.Sprint(int(math.Ceil(wait.Seconds())))
	// @end
}

// clientKey names the bucket: the API key when the client sent one, else the client's address.
func clientKey(apiKey, remoteAddr, forwardedFor string) string {
	if apiKey != "" {
		return "key:" + apiKey
	}
	peer := netip.MustParseAddrPort(remoteAddr).Addr()
	// @piece client-address: Trust X-Forwarded-For only from the LB: its last entry
	if loadBalancers.Contains(peer) && forwardedFor != "" {
		hops := strings.Split(forwardedFor, ",")
		return "ip:" + strings.TrimSpace(hops[len(hops)-1])
	}
	// @end
	return "ip:" + peer.String()
}

// Evict forgets buckets that have refilled completely: a full bucket behaves like a new one, so
// the map does not keep every client the gateway has ever seen.
func (l *Limiter) Evict(now time.Time) {
	// @piece evict-idle: Drop the buckets that are full again
	for key, b := range l.buckets {
		if b.tokens+now.Sub(b.last).Seconds()*l.rate >= l.burst {
			delete(l.buckets, key)
		}
	}
	// @end
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: {"rate", "burst", "events": [{"atMs", "apiKey", "remote", "forwardedFor"}], "evictAtMs"}.
// Prints {"decisions": [{"key", "status", "retryAfter"}], "buckets": <count after Evict(evictAtMs)>}.
type event struct {
	AtMs         int64  `json:"atMs"`
	APIKey       string `json:"apiKey"`
	Remote       string `json:"remote"`
	ForwardedFor string `json:"forwardedFor"`
}

type decision struct {
	Key        string `json:"key"`
	Status     int    `json:"status"`
	RetryAfter string `json:"retryAfter,omitempty"`
}

func main() {
	var in struct {
		Rate      float64 `json:"rate"`
		Burst     int     `json:"burst"`
		Events    []event `json:"events"`
		EvictAtMs *int64  `json:"evictAtMs"`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		fmt.Println("bad input:", err)
		return
	}
	start := time.Date(2026, 11, 6, 11, 0, 0, 0, time.UTC)
	at := func(ms int64) time.Time { return start.Add(time.Duration(ms) * time.Millisecond) }
	l := NewLimiter(in.Rate, in.Burst)
	out := struct {
		Decisions []decision `json:"decisions"`
		Buckets   int        `json:"buckets"`
	}{Decisions: []decision{}}
	for _, e := range in.Events {
		key := clientKey(e.APIKey, e.Remote, e.ForwardedFor)
		if ok, wait := l.Allow(key, at(e.AtMs)); ok {
			out.Decisions = append(out.Decisions, decision{Key: key, Status: 200})
		} else {
			out.Decisions = append(out.Decisions, decision{Key: key, Status: 429, RetryAfter: retryAfter(wait)})
		}
	}
	if in.EvictAtMs != nil {
		l.Evict(at(*in.EvictAtMs))
	}
	out.Buckets = len(l.buckets)
	b, _ := json.Marshal(out)
	fmt.Println(string(b))
}
