// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers and test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-rno-2-2",
    title: "Conflict resolution: last-write-wins vs field merge",
    slug: { _type: "slug", current: "react-native-conflict-resolution" },
    description:
        "A courier's offline note wiped out the dispatcher's address fix, and a phone with a slow clock lost edits it made later. Learn why last-write-wins on whole records loses data, how a three-way merge with a stored base copy decides each field, which policy each field needs, and when the courier must be told.",
    estimatedTime: 17,

    scenario: {
        role: "Mobile developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Couriers edit deliveries offline (gate codes, tags, proof photos) while dispatchers edit the same deliveries on the web (address fixes, phone numbers). When the phone syncs, one side's work regularly disappears, and one courier drove to the old address after a dispatcher had corrected it.",
    },

    content: [
        h2("Situation"),
        p("The sync merged a delivery by keeping whichever copy had the newer `updatedAt`:"),
        code("ts", `
function resolve(local: Delivery, remote: Delivery): Delivery {
  return local.updatedAt > remote.updatedAt ? local : remote;   // last write wins
}`, "src/sync/resolve.ts"),
        code("text", `
04:12:03  dispatcher (web)    address: 12 Le Loi -> 14 Le Loi        updatedAt 04:12:03 (server clock)
04:14:40  courier (offline)   note: "" -> "gate code 4471"         updatedAt 04:21:40 (phone clock, 7 min fast)
04:20:15  phone syncs         local wins -> address back to 12 Le Loi, the dispatcher's fix is gone
04:31:02  courier arrives at 12 Le Loi, customer at 14 Le Loi`, "sync log"),

        h2("The core you need"),
        bullets([
            "**Whole-record last-write-wins drops whole edits.** Two people changed different fields; one of them loses everything they changed. It also trusts timestamps from clocks you do not control: a phone set 7 minutes fast always wins, one set slow always loses.",
            "**Three-way merge per field.** Keep `base`, the copy the phone last synced. For each field: equal to base on the phone means only the server changed it (take the server's value); equal to base on the server means only the courier changed it (keep the courier's); both changed to the same value is not a conflict.",
            "**A policy for fields both sides changed.** Decide per field who wins: the server for facts the office owns (address, phone, status), the device for facts only the courier knows (proof photo, delivery note), a union for sets (tags). Fields with no rule fall back to the server.",
            "**Tell the courier when their edit loses.** A field where the server's value replaced a different courier edit is a conflict worth showing (\"The address was changed by dispatch\").",
            "**Clocks never decide.** `updatedAt` is for display. Ordering comes from the base copy, from server versions (an `etag` / `version` column the api increments), or from hybrid logical clocks in fully peer-to-peer designs; CRDT libraries package these ideas for text and lists.",
        ]),

        h2("Apply it in the project"),
        code("ts", `
type Policy = "server" | "device" | "union";
export const DELIVERY_POLICY: Record<string, Policy> = {
  address: "server", phone: "server", status: "server",
  note: "device", proofPhoto: "device",
  tags: "union",
};

// stored when the courier starts editing offline, cleared when the edit is acknowledged
type PendingEdit = { base: Delivery; local: Delivery };

export async function syncEdit(pending: PendingEdit) {
  const remote = await api.getDelivery(pending.local.id);
  const { merged, conflicts } = mergeDelivery(pending.base, pending.local, remote, DELIVERY_POLICY);
  await api.putDelivery(merged, { ifMatch: remote.version });      // 412 if it changed again: re-run
  await db.saveDelivery(merged);
  if (conflicts.length) notify.show(\`Dispatch changed \${conflicts.join(", ")} on this delivery.\`);
}`, "src/sync/syncEdit.ts"),
        callout("info", "Why If-Match on the write",
            "Between reading `remote` and writing `merged`, the dispatcher may save again. Sending the version you merged against (`If-Match`) makes the api refuse a write based on stale data with 412, and the phone simply merges again with the new copy."),

        h2("Verify"),
        code("bash", `
# set the emulator clock 10 minutes fast, go offline, add a gate code and a tag to d-8812
adb shell "su 0 date -s $(date -u -d '+10 min' +%m%d%H%M%Y.%S)"
adb shell svc wifi disable
# on the dispatch web app: change d-8812's phone number and add the tag "call-on-arrival"
adb shell svc wifi enable
# expected on the phone: the dispatcher's phone number, the courier's gate code,
# tags ["call-on-arrival", "cash", "fragile"], and no conflict banner (different fields)`, "terminal"),
        p("Setting the clock needs a rooted emulator image (the Google APIs image without Play Store); on a real phone use the system date settings."),

        h2("Pitfalls"),
        bullets([
            "**Storing no base.** Without the base copy every difference looks like a conflict, and the code drifts back to \"the server wins\", silently dropping courier edits. Persist the base when the edit starts.",
            "**Merging lists by concatenation.** `[...local.tags, ...remote.tags]` repeats every tag both sides had. Use a set, and decide whether removals should win (a union cannot express \"the courier removed a tag\").",
            "**Hiding lost edits.** A merge that quietly takes the server's value for a field the courier changed teaches couriers that edits vanish. Report those fields, and keep the courier's value in the message so it can be re-entered.",
        ]),

        challenge("chal_quiz_rno_151"),
        p("Now write the merge. The editor starts from `mergeDelivery` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. Some pieces repeat the first version's mistakes on purpose. Run merges deliveries edited on both sides, including one from a phone whose clock runs fast."),
        challenge("chal_coding_rno_152"),
    ],
});
