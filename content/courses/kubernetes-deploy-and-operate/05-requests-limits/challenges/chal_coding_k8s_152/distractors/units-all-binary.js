// @piece parse-quantity: Turn "250m", "1", "512Mi", "512M" into millicores and bytes
function cpuMillis(q) {
    const s = String(q ?? 0).trim();
    return s.endsWith("m") ? Number(s.slice(0, -1)) : Math.round(Number(s) * 1000);
}

function memoryBytes(q) {
    // M and Mi are the same thing, so are G and Gi.
    const units = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
    const m = String(q ?? 0).trim().match(/^([\d.]+)([A-Za-z]?)/);
    return Math.round(Number(m[1]) * (units[m[2].toUpperCase()] ?? 1));
}
