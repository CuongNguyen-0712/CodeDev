// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - test cases live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-rno-1-3",
    title: "Optimistic updates and rollback",
    slug: { _type: "slug", current: "react-native-optimistic-updates" },
    description:
        "The courier app's Delivered button changed the row at once, then flicked it back, kept rejected deliveries looking delivered, and undid one courier tap when another failed. Learn the optimistic update lifecycle in TanStack Query - cancel, change, roll back one item, reconcile - and fix the mutation.",
    estimatedTime: 15,

    scenario: {
        role: "Mobile developer at Rice Rocket, a food-delivery startup in Ho Chi Minh City",
        problem:
            "Couriers want the list to react the moment they tap, even on a weak signal. The first optimistic version did react at once, but three bugs made couriers distrust what the list showed.",
    },

    content: [
        h2("Situation"),
        p("The mutation as it shipped, and three reports from couriers:"),
        code("ts", `
useMutation({
  mutationFn: (v: Vars) => api.post(\`/deliveries/\${v.id}/complete\`),
  onMutate: async (v) => {
    await queryClient.invalidateQueries({ queryKey: KEY });
    const snapshot = queryClient.getQueryData<Delivery[]>(KEY);
    queryClient.setQueryData<Delivery[]>(KEY, (list) => list?.map((d) => (d.id === v.id ? { ...d, status: "delivered" } : d)));
    return { snapshot };
  },
  onError: (_e, _v, ctx) => queryClient.setQueryData(KEY, ctx?.snapshot),
  onSettled: (_d, error) => { if (!error) queryClient.invalidateQueries({ queryKey: KEY }); },
});`, "src/deliveries/useCompleteDelivery.ts"),
        bullets([
            "\"I tap Delivered, it turns green, then a second later it says picked up again.\"",
            "\"The customer cancelled, the app showed an error, and the order still says picked up. I drove back.\"",
            "\"I finished two orders quickly. The first one failed, and the second one went back to picked up as well.\"",
        ]),

        h2("The core you need"),
        bullets([
            "**Optimistic means: show the expected result, then confirm it.** `onMutate` runs before the request and changes the cache; `onError` puts things back; `onSettled` (success or error) asks the server for the truth.",
            "**Cancel, do not refetch, before changing.** A refetch started before the tap returns the list from before the tap and lands on top of the change. `cancelQueries` drops its result; `invalidateQueries` would start another fetch that has the same problem.",
            "**Roll back what you changed, not the whole list.** A snapshot of the whole list also holds other rows; restoring it undoes other taps made since. Save the one delivery you changed and put that one back.",
            "**Always reconcile.** After an error the old value is not necessarily the truth either: the customer cancelled, so the server says `cancelled`. Invalidate in `onSettled` whatever the outcome.",
            "**In an offline-first app the same lifecycle applies to the local write.** The SQLite row changes at once and the outbox entry carries the action; when the api refuses it for good, the row is restored and the server's version replaces it on the next pull.",
        ]),

        h2("Apply it in the project"),
        code("ts", `
const KEY = ["courier-deliveries"] as const;

export function useCompleteDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: Vars) => api.post(\`/deliveries/\${v.id}/complete\`, undefined, { idempotencyKey: v.actionId }),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const list = queryClient.getQueryData<Delivery[]>(KEY) ?? [];
      const previous = list.find((d) => d.id === v.id);
      queryClient.setQueryData<Delivery[]>(KEY, list.map((d) => (d.id === v.id ? { ...d, status: "delivered" } : d)));
      return { previous };
    },
    onError: (_error, _v, ctx) => {
      const previous = ctx?.previous;
      if (previous) {
        queryClient.setQueryData<Delivery[]>(KEY, (list) => list?.map((d) => (d.id === previous.id ? previous : d)));
      }
      toast.show("This delivery could not be completed. Check the order details.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}`, "src/deliveries/useCompleteDelivery.ts"),
        callout("info", "Two taps in flight",
            "With several mutations on the same list, each `onSettled` refetch can briefly show the server before the other request has been processed. TanStack's docs suggest invalidating only when the last related mutation settles (check `queryClient.isMutating({ mutationKey })`). The challenge's api applies each request when it arrives, so this window does not appear there."),

        h2("Verify"),
        code("bash", `
# Android emulator, slow network to make the windows visible
adb emu network delay umts
# 1. pull to refresh, then tap Delivered within a second: the row stays green
# 2. cancel order d-8812 from the customer app, then tap Delivered on it:
#    the row turns back, the toast shows, a moment later it reads "cancelled"
# 3. tap Delivered on d-8812 (cancelled) and d-8813 quickly: d-8813 stays delivered
adb emu network delay none`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**`await` missing on `cancelQueries`.** The cancel is asynchronous; without `await` the optimistic `setQueryData` can still lose to a fetch that resolves in between. Keep `onMutate` async and await it.",
            "**Rolling back from a stale closure.** Reading `deliveries` from the component's render instead of `getQueryData` restores a list from an earlier render. Always read the cache inside the callbacks.",
            "**Swallowing the error.** Rolling back silently makes couriers think the tap was ignored and tap again. Show what happened, and leave the reconciled value on screen.",
        ]),

        p("Now fix the mutation. The editor starts from `completeDeliveryOptions` with its key blocks missing, each marked by a `// [ ]` line: click a piece to fill a line, or drag it onto one. The pieces include last week's buggy versions. Run replays taps, background refetches, cancellations and late answers, and prints what the list showed after each step."),
        challenge("chal_coding_rno_132"),
    ],
});
