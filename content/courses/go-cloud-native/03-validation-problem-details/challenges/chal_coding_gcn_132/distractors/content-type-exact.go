// @piece content-type: Accept JSON with or without parameters (415 otherwise)
if contentType != "application/json" {
	return 415, problem(415, "unsupported-media-type", "Unsupported Media Type", "send the order as application/json"), nil
}
