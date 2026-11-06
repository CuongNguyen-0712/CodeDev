// @piece check-artifacts: Check every artifact in the bundle
const count = new Map<string, number>();
for (const a of input.artifacts) count.set(a.name, (count.get(a.name) ?? 0) + 1);
const requested = new Set(input.request.refs.map((r) => r.split("@")[0].split(":")[0]));
for (const a of input.artifacts.filter((x) => requested.has(x.name))) {
    if ((count.get(a.name) ?? 0) > 1) reasons.push({ artifact: a.name, code: "duplicate-artifact" });
    else if (!signed.has(a.name)) reasons.push({ artifact: a.name, code: "unsigned-artifact" });
    else if (sha256Hex(a.content) !== signed.get(a.name)) reasons.push({ artifact: a.name, code: "digest-mismatch" });
}
