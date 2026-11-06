// @piece base-key: Start the key from the resource and its params
let key = [req.resource, ...paramValues].join("/");
