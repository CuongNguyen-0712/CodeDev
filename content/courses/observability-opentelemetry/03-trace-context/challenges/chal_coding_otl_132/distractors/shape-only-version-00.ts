// @piece parse-shape: Check the header's length, version and separators
if (header === null) return null;
const h = header.replace(OWS, "");
if (h.length < 55) return null;
const version = h.slice(0, 2);
if (!isHex(version, 2) || version === "ff" || h[2] !== "-") return null;
if (h.length !== 55) return null;
