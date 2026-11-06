// @piece strict-decode: Decode strictly: unknown fields and broken JSON are 400
if err := json.NewDecoder(bytes.NewReader(body)).Decode(&o); err != nil {
	return 400, problem(400, "malformed-json", "Malformed JSON", err.Error()), nil
}
