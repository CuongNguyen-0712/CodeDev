// @piece private-key: Private key blocks
let out = text.replace(
    /-----BEGIN ([A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*(-----END ([A-Z0-9]+ )*PRIVATE KEY-----|$)/g,
    () => mark("private_key"),
);
