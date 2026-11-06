// @piece phone: Redact phone numbers in any format
out = out.replace(/(?<![A-Za-z0-9_-])(?:\+84|0)(?:[ .]?\d){9}(?![A-Za-z0-9_-])/g, (m) =>
    label("PHONE", m),
);
