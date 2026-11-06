// @piece correlation-id: Pick the correlation id
const incoming = req.headers["x-correlation-id"];
const correlationId = newId();
