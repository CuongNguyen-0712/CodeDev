// @piece email-and-id: Redact emails, then national IDs
let out = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, (m) => label("EMAIL", m.toLowerCase()));
out = out.replace(/\b\d{12}\b/g, (m) => label("NATIONAL_ID", m));
