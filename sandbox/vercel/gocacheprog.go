// gocacheprog: the GOCACHEPROG run-job gives every Go job (docs/sandbox.md, `go help environment`).
//
//	GOCACHEPROG="/opt/codedev/gocacheprog <read-only GOCACHE> <job cache dir>"
//
// Hits come from the job's own directory first, then from the image's pre-built standard library
// cache (a plain GOCACHE directory, root-owned and read-only); new entries go to the job's
// directory only. Jobs share the pre-built std without copying it and without sharing anything
// writable. Both directories use the go command's own on-disk layout (<xx>/<id>-a, <xx>/<id>-d).
// Protocol: cmd/go/internal/cacheprog.
package main

import (
	"bufio"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type request struct {
	ID       int64
	Command  string
	ActionID []byte
	OutputID []byte
	BodySize int64
}

type response struct {
	ID            int64
	Err           string     `json:",omitempty"`
	KnownCommands []string   `json:",omitempty"`
	Miss          bool       `json:",omitempty"`
	OutputID      []byte     `json:",omitempty"`
	Size          int64      `json:",omitempty"`
	Time          *time.Time `json:",omitempty"`
	DiskPath      string     `json:",omitempty"`
}

func file(root, id, kind string) string { return filepath.Join(root, id[:2], id+"-"+kind) }

// get reads an action entry ("v1 <action> <output> <size> <unixnano>") and checks its output file.
func get(root, action string) (res response, ok bool) {
	data, err := os.ReadFile(file(root, action, "a"))
	if err != nil {
		return res, false
	}
	f := strings.Fields(string(data))
	if len(f) != 5 || f[0] != "v1" || f[1] != action || len(f[2]) < 2 {
		return res, false
	}
	out, err1 := hex.DecodeString(f[2])
	size, err2 := strconv.ParseInt(f[3], 10, 64)
	nanos, err3 := strconv.ParseInt(f[4], 10, 64)
	if err1 != nil || err2 != nil || err3 != nil {
		return res, false
	}
	path := file(root, f[2], "d")
	if st, err := os.Stat(path); err != nil || st.Size() != size {
		return res, false
	}
	t := time.Unix(0, nanos)
	return response{OutputID: out, Size: size, Time: &t, DiskPath: path}, true
}

func put(root string, req request, body []byte) (response, error) {
	if int64(len(body)) != req.BodySize {
		return response{}, fmt.Errorf("body is %d bytes, expected %d", len(body), req.BodySize)
	}
	action, out := hex.EncodeToString(req.ActionID), hex.EncodeToString(req.OutputID)
	path := file(root, out, "d")
	entry := fmt.Sprintf("v1 %s %s %20d %20d\n", action, out, len(body), time.Now().UnixNano())
	for _, w := range []struct {
		path string
		data []byte
	}{{path, body}, {file(root, action, "a"), []byte(entry)}} {
		if err := os.MkdirAll(filepath.Dir(w.path), 0o700); err != nil {
			return response{}, err
		}
		if err := os.WriteFile(w.path, w.data, 0o600); err != nil {
			return response{}, err
		}
	}
	return response{DiskPath: path}, nil
}

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "usage: gocacheprog <read-only GOCACHE> <job cache dir>")
		os.Exit(2)
	}
	base, dir := os.Args[1], os.Args[2]
	in := json.NewDecoder(bufio.NewReader(os.Stdin))
	w := bufio.NewWriter(os.Stdout)
	out := json.NewEncoder(w)
	send := func(r response) {
		if out.Encode(r) != nil || w.Flush() != nil {
			os.Exit(1)
		}
	}
	send(response{KnownCommands: []string{"get", "put", "close"}})
	for {
		var req request
		if err := in.Decode(&req); err != nil {
			if err != io.EOF {
				fmt.Fprintln(os.Stderr, "gocacheprog:", err)
				os.Exit(1)
			}
			return
		}
		var res response
		switch req.Command {
		case "get":
			action := hex.EncodeToString(req.ActionID)
			if len(action) < 2 {
				res.Err = "missing ActionID"
				break
			}
			var ok bool
			if res, ok = get(dir, action); !ok {
				if res, ok = get(base, action); !ok {
					res = response{Miss: true}
				}
			}
		case "put":
			var body []byte // a base64 JSON string follows the request when BodySize > 0
			if req.BodySize > 0 {
				if err := in.Decode(&body); err != nil {
					fmt.Fprintln(os.Stderr, "gocacheprog: put body:", err)
					os.Exit(1)
				}
			}
			if len(req.ActionID) == 0 || len(req.OutputID) == 0 {
				res.Err = "missing ActionID or OutputID"
				break
			}
			var err error
			if res, err = put(dir, req, body); err != nil {
				res.Err = err.Error()
			}
		case "close":
			res.ID = req.ID
			send(res)
			return
		default:
			res.Err = "unknown command " + strconv.Quote(req.Command)
		}
		res.ID = req.ID
		send(res)
	}
}
