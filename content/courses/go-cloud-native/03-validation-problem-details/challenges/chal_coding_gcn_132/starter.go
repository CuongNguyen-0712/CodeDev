// Rice Rocket API gateway: validates POST /v1/orders before the api sees it, and answers every
// refusal as RFC 9457 problem details (Content-Type: application/problem+json).
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

const maxBody = 16 << 10 // 16 KiB: a real order is under 2 KiB

type Item struct {
	MenuItemID string `json:"menuItemId"`
	Quantity   int    `json:"quantity"`
}

type Order struct {
	RestaurantID    string `json:"restaurantId"`
	Items           []Item `json:"items"`
	DeliveryAddress string `json:"deliveryAddress"`
}

type FieldError struct {
	Field  string `json:"field"`
	Detail string `json:"detail"`
}

// Problem is an RFC 9457 problem details body.
type Problem struct {
	Type   string       `json:"type"`
	Title  string       `json:"title"`
	Status int          `json:"status"`
	Detail string       `json:"detail,omitempty"`
	Errors []FieldError `json:"errors,omitempty"`
}

func problem(status int, kind, title, detail string) *Problem {
	return &Problem{Type: "https://api.ricerocket.vn/problems/" + kind, Title: title, Status: status, Detail: detail}
}

// checkOrder returns the status to answer, a problem for a refusal, or the parsed order.
func checkOrder(contentType string, body []byte) (int, *Problem, *Order) {
	// [ ] Accept JSON with or without parameters (415 otherwise)
	if len(body) > maxBody {
		return 413, problem(413, "body-too-large", "Content Too Large", fmt.Sprintf("the body is over %d bytes", maxBody)), nil
	}
	var o Order
	// [ ] Decode strictly: unknown fields and broken JSON are 400
	// [ ] Check every field and report all problems at once (422)
	return 201, nil, &o
}

// mediaTypeFor is the Content-Type of the answer.
func mediaTypeFor(p *Problem) string {
	// [ ] Problem bodies have their own media type
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: {"contentType", "body"}. Prints {"status", "contentType", "problem", "order"} as one JSON line.
func main() {
	var in struct {
		ContentType string `json:"contentType"`
		Body        string `json:"body"`
	}
	if err := json.NewDecoder(os.Stdin).Decode(&in); err != nil {
		fmt.Println("bad input:", err)
		return
	}
	status, p, o := checkOrder(in.ContentType, []byte(in.Body))
	out, _ := json.Marshal(struct {
		Status      int      `json:"status"`
		ContentType string   `json:"contentType"`
		Problem     *Problem `json:"problem"`
		Order       *Order   `json:"order"`
	}{status, mediaTypeFor(p), p, o})
	fmt.Println(string(out))
}
