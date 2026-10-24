// Wrong variant: regexes and includes() on the raw header. Case-sensitive, so "Max-Age=600"
// and "PRIVATE" are missed, and quoted values such as max-age="120" are not read.
function parseCacheControl(header) {
  const h = header || "";
  const m = /max-age=(\d+)/.exec(h);
  return {
    maxAge: m ? Number(m[1]) : null,
    noStore: h.includes("no-store"),
    noCache: h.includes("no-cache"),
    private: h.includes("private"),
    public: h.includes("public"),
  };
}
