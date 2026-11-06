// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-rno-1-1",
    title: "Why offline-first: the network is a cache miss",
    slug: { _type: "slug", current: "react-native-why-offline-first" },
    description:
        "Rice Rocket's courier app asked the api for everything, so couriers in basements and elevators stared at spinners, tapped Delivered twice and sometimes recorded cash twice. Learn the offline-first model - read from the phone, write to the phone, sync in the background - and the three rules it rests on: never trust a connectivity check, give every write an identity, and label stale data.",
    estimatedTime: 14,

    scenario: {
        role: "Mobile developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Couriers deliver into apartment towers, basement car parks and office lifts where the signal comes and goes. The courier app (React Native, Expo) was built online-first, and support gets daily calls about stuck spinners, deliveries marked twice and cash counted twice.",
    },

    content: [
        h2("Situation"),
        p("The delivery list and the Delivered button, as they shipped:"),
        code("tsx", `
export function DeliveriesScreen() {
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  useEffect(() => {
    api.get("/couriers/me/deliveries").then(setDeliveries);
  }, []);
  if (!deliveries) return <Spinner />;
  return <DeliveryList items={deliveries} onDelivered={(id) => api.post(\`/deliveries/\${id}/complete\`)} />;
}`, "app/deliveries.tsx"),
        bullets([
            "In a basement the screen shows a spinner until the request times out, so the courier cannot even see the next address.",
            "A timed-out Delivered tap is tapped again: the api log shows two completions for one delivery, and the cash on delivery is booked twice.",
            "A NetInfo check added before each request did not help: the phone was \"connected\" to the building's Wi-Fi, which had no internet behind it.",
        ]),

        h2("The core you need"),
        bullets([
            "**The network is a cache miss, not the source of the screen.** Screens read from a database on the phone (expo-sqlite); a sync process fills and refreshes it when the api answers. A basement makes the data older, not absent.",
            "**Writes go to the phone first.** A tap writes the change locally (the UI updates at once) and adds an entry to an outbox table; a background flush sends it later and retries (lesson 4).",
            "**Each write has an identity.** The phone creates an id for every action and sends it as an `Idempotency-Key` on every attempt; the api stores the first answer per key and replays it. A timeout then stops meaning \"maybe twice\".",
            "**Connectivity checks are hints.** NetInfo's `isConnected` describes the network interface; `isInternetReachable` is a periodic probe. Neither predicts whether the next request arrives. Send with a timeout and treat failure as normal.",
            "**Authority stays clear.** The api decides assignments and prices; the phone owns the courier's actions until the api has acknowledged them. Data shown from the phone carries its age (\"updated 4 min ago\").",
        ]),

        h2("Apply it in the project"),
        p("The shape the next lessons build, from the screen down:"),
        code("text", `
Screen (FlatList)        reads deliveries from SQLite, re-renders on change
  |  tap "Delivered"
  v
Local write              UPDATE deliveries SET status = 'delivered' ...      (lesson 3)
  + outbox entry          INSERT INTO outbox (id, kind, payload, ...)         (lesson 4)
  |
Sync loop (every 5 s, on reconnect, on app foreground)
  |-> flush outbox        POST with Idempotency-Key = outbox id, backoff on 5xx/429
  '-> pull changes        GET /couriers/me/changes?cursor=...                 (lesson 6)
         |
         '-> merge         three-way merge with the base copy                 (lesson 5)
`, "architecture"),
        p("The list screen reads the phone's copy and shows its age; the network only refreshes it:"),
        code("tsx", `
import { useSQLiteContext } from "expo-sqlite";

export function DeliveriesScreen() {
  const db = useSQLiteContext();
  const { data } = useQuery({
    queryKey: ["courier-deliveries"],
    queryFn: () => db.getAllAsync<Delivery>("SELECT * FROM deliveries ORDER BY eta"),
    networkMode: "always",          // the query reads SQLite, it never needs the network
  });
  const lastSync = useLastSync();   // written by the sync loop after each successful pull
  return (
    <>
      <StaleBanner since={lastSync} />
      <DeliveryList items={data ?? []} onDelivered={markDelivered} />
    </>
  );
}`, "app/deliveries.tsx"),
        callout("info", "Why not just cache API responses",
            "An HTTP cache keeps answers to GET requests. It does not keep the courier's own changes, does not order them, and cannot merge them with the dispatcher's edits. Offline-first needs a database the app writes to and a sync process that owns the conversation with the api."),

        h2("Verify"),
        code("bash", `
# Android emulator: cut the data path, keep the app running
adb shell svc wifi disable && adb shell svc data disable
# open the app: the list shows the last synced deliveries and "updated N min ago"
# tap Delivered on one delivery: the row changes at once, the outbox has 1 entry
adb shell svc wifi enable
# within a few seconds: outbox empty, api log shows ONE completion for that delivery
#   POST /deliveries/d-8812/complete  200  Idempotency-Key=act-4f1c...`, "terminal"),
        p("On iOS use the Network Link Conditioner profile \"100% Loss\" in the simulator's developer settings, or a real phone in a lift."),

        h2("Pitfalls"),
        bullets([
            "**Gating actions on NetInfo.** Disabled buttons in a basement are the online-first app again. Detect it by searching for `isConnected` checks in action handlers; write locally and let the sync loop decide when to send.",
            "**A new idempotency key per retry.** A key generated inside the retry loop changes every attempt, so the api cannot spot the repeat. The key belongs to the action (the outbox row id), created once when the courier taps.",
            "**Offline data presented as live.** A list with no age label makes couriers drive to a delivery that was reassigned an hour ago. Show the last successful sync time and refresh on app foreground.",
        ]),

        challenge("chal_quiz_rno_111"),
    ],
});
