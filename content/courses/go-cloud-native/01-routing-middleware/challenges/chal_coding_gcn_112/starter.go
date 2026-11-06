// Rice Rocket API gateway: the routes and the middleware chain every request goes through.
// The upstream services are stand-ins here: the handlers answer directly. Handler, ServeMux,
// Request and friends at the bottom of the file mirror net/http (see the test runner section).
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
)

// newGateway returns the gateway handler. log receives one line per request:
// "<request id> <METHOD> <path> <status>".
func newGateway(log *[]string) Handler {
	mux := NewServeMux()
	// [ ] Routes: method + path patterns; probes need no token
	// [ ] Wrap the mux: request id, then logging, then recovery
}

func getOrder(w ResponseWriter, r *Request) {
	// [ ] Read the order id the pattern matched
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"order": id})
}

func createOrder(w ResponseWriter, r *Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"order": "new"})
}

// boom stands in for an upstream handler with a bug (a write to a nil map).
func boom(w ResponseWriter, r *Request) {
	var cache map[string]int
	cache["orders"]++
}

func requireToken(next Handler) Handler {
	return HandlerFunc(func(w ResponseWriter, r *Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			w.Header().Set("WWW-Authenticate", "Bearer")
			Error(w, "missing bearer token", StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

var lastID = 0

// withRequestID keeps the id the load balancer sent, or makes one, and echoes it.
func withRequestID(next Handler) Handler {
	return HandlerFunc(func(w ResponseWriter, r *Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" {
			lastID++
			id = fmt.Sprintf("rid-%d", lastID)
			r.Header.Set("X-Request-ID", id)
		}
		w.Header().Set("X-Request-ID", id)
		next.ServeHTTP(w, r)
	})
}

// statusRecorder remembers the status code a handler wrote.
type statusRecorder struct {
	ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func withLogging(log *[]string, next Handler) Handler {
	return HandlerFunc(func(w ResponseWriter, r *Request) {
		// [ ] Serve through a recorder; 200 if WriteHeader is never called
		*log = append(*log, fmt.Sprintf("%s %s %s %d", r.Header.Get("X-Request-ID"), r.Method, r.URL.Path, rec.status))
	})
}

func withRecovery(next Handler) Handler {
	return HandlerFunc(func(w ResponseWriter, r *Request) {
		defer func() {
			if v := recover(); v != nil {
				Error(w, "internal error", StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// ---------------------------------------------------------------- test runner (do not change)
// A small copy of the net/http API the gateway uses, because the code runner compiles net/http too
// slowly for Run: method + path patterns with {wildcards} (a GET pattern also serves HEAD), 404,
// 405 with a sorted Allow header, Request.PathValue and Error. In the real gateway these are
// net/http's own types; the code above stays the same apart from the `http.` prefix.
const (
	StatusOK                  = 200
	StatusCreated             = 201
	StatusUnauthorized        = 401
	StatusNotFound            = 404
	StatusMethodNotAllowed    = 405
	StatusInternalServerError = 500
)

type Header map[string]string

func (h Header) Get(k string) string { return h[strings.ToLower(k)] }
func (h Header) Set(k, v string)     { h[strings.ToLower(k)] = v }

type URL struct{ Path string }

type Request struct {
	Method string
	URL    *URL
	Header Header
	values map[string]string
}

func (r *Request) PathValue(name string) string { return r.values[name] }

type ResponseWriter interface {
	Header() Header
	Write([]byte) (int, error)
	WriteHeader(code int)
}

type Handler interface{ ServeHTTP(ResponseWriter, *Request) }

type HandlerFunc func(ResponseWriter, *Request)

func (f HandlerFunc) ServeHTTP(w ResponseWriter, r *Request) { f(w, r) }

func Error(w ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(code)
	fmt.Fprintln(w, msg)
}

type route struct {
	method   string
	segments []string
	handler  Handler
}

type ServeMux struct{ routes []route }

func NewServeMux() *ServeMux { return &ServeMux{} }

func (m *ServeMux) Handle(pattern string, h Handler) {
	method, path := "", pattern
	if i := strings.IndexByte(pattern, ' '); i >= 0 {
		method, path = pattern[:i], strings.TrimSpace(pattern[i+1:])
	}
	m.routes = append(m.routes, route{method, strings.Split(path[1:], "/"), h})
}

func (m *ServeMux) HandleFunc(pattern string, f func(ResponseWriter, *Request)) {
	m.Handle(pattern, HandlerFunc(f))
}

// match: literal segments must be equal, {name} takes one non-empty segment.
func (rt route) match(path string) (map[string]string, bool) {
	segs := strings.Split(path[1:], "/")
	if len(segs) != len(rt.segments) {
		return nil, false
	}
	values := map[string]string{}
	for i, s := range rt.segments {
		if strings.HasPrefix(s, "{") && strings.HasSuffix(s, "}") {
			if segs[i] == "" {
				return nil, false
			}
			values[s[1:len(s)-1]] = segs[i]
		} else if s != segs[i] {
			return nil, false
		}
	}
	return values, true
}

func (m *ServeMux) ServeHTTP(w ResponseWriter, r *Request) {
	var allow []string
	for _, rt := range m.routes {
		values, ok := rt.match(r.URL.Path)
		if !ok {
			continue
		}
		if rt.method == "" || rt.method == r.Method || (rt.method == "GET" && r.Method == "HEAD") {
			r.values = values
			rt.handler.ServeHTTP(w, r)
			return
		}
		allow = append(allow, rt.method)
		if rt.method == "GET" {
			allow = append(allow, "HEAD")
		}
	}
	if len(allow) > 0 {
		sort.Strings(allow)
		w.Header().Set("Allow", strings.Join(allow, ", "))
		Error(w, "Method Not Allowed", StatusMethodNotAllowed)
		return
	}
	Error(w, "404 page not found", StatusNotFound)
}

type recorder struct {
	header Header
	code   int
	body   strings.Builder
}

func (r *recorder) Header() Header { return r.header }

func (r *recorder) WriteHeader(code int) {
	if r.code == 0 {
		r.code = code
	}
}

func (r *recorder) Write(b []byte) (int, error) {
	r.WriteHeader(StatusOK)
	return r.body.Write(b)
}

// Input: {"requests": [{"method", "path", "headers"}]}. Sends each request through newGateway and
// prints {"responses": [{"status", "allow", "requestId", "body"}], "log": [...]} as one JSON line.
type testRequest struct {
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Headers map[string]string `json:"headers"`
}

type testResponse struct {
	Status    int    `json:"status"`
	Allow     string `json:"allow"`
	RequestID string `json:"requestId"`
	Body      string `json:"body"`
}

func main() {
	var in struct {
		Requests []testRequest `json:"requests"`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		fmt.Println("bad input:", err)
		return
	}
	log := []string{}
	gateway := newGateway(&log)
	out := struct {
		Responses []testResponse `json:"responses"`
		Log       []string       `json:"log"`
	}{Responses: []testResponse{}}
	for _, tr := range in.Requests {
		req := &Request{Method: tr.Method, URL: &URL{Path: tr.Path}, Header: Header{}}
		for k, v := range tr.Headers {
			req.Header.Set(k, v)
		}
		rec := &recorder{header: Header{}}
		gateway.ServeHTTP(rec, req)
		out.Responses = append(out.Responses, testResponse{rec.code, rec.header.Get("Allow"), rec.header.Get("X-Request-ID"), strings.TrimSpace(rec.body.String())})
	}
	out.Log = log
	b, _ := json.Marshal(out)
	fmt.Println(string(b))
}
