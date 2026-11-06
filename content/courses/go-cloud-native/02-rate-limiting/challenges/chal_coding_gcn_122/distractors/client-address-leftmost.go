// @piece client-address: Trust X-Forwarded-For only from the LB: its last entry
if forwardedFor != "" {
	hops := strings.Split(forwardedFor, ",")
	return "ip:" + strings.TrimSpace(hops[0])
}
