// @piece host-and-token-rules: Rules 5-7: __Host- names and token values
if (!secure && names.some(prefixed)) return "cookie prefix requires Secure";
if (c.refreshName.startsWith("__Host-")) return "__Host- cookie requires Path=/";
const valueOk = (v: string) => /^[A-Za-z0-9._-]+$/.test(v);
