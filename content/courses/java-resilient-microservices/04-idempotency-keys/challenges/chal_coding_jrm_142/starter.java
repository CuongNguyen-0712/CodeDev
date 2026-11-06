import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Rice Rocket payment-service: idempotency keys for POST /payments (the app sends an Idempotency-Key
 * header and retries on a flaky network) and for the provider's callbacks (keyed by event id,
 * delivered at least once, sometimes twice at the same time).
 *
 *   first request with a key   claim the key, do the work, keep the answer
 *   same key, same request     answer with the kept answer, without doing the work again
 *   same key, still running    409: the first request has not finished yet
 *   same key, other request    422: the key was reused for a different request body
 *   5xx answers                not kept: the client's retry runs the work again
 * Keys are forgotten `ttl` ms after they were claimed. A request without a key ("-") always runs.
 *
 * Input (stdin): the store line, then the requests (any order):
 *   store ttl=86400000
 *   req r1 t=0 key=k1 body=order-881:185000 ms=200 status=201
 * `ms` and `status` are what the work takes and answers if it runs.
 * Output: one line per request in input order ("<id> key=<k> -> <status> <processed|replayed|in progress|key reused>"),
 * then how many times the work succeeded (charges).
 */
public class Main {

    static final int IN_PROGRESS = 0;

    record Kept(String fingerprint, long createdAt, int status) {}

    record Decision(boolean process, int status, String note) {
        static final Decision PROCESS = new Decision(true, 0, "processed");

        static Decision answer(int status, String note) {
            return new Decision(false, status, note);
        }
    }

    static final class IdempotencyStore {
        final long ttlMs;
        final Map<String, Kept> keys = new HashMap<>();

        IdempotencyStore(long ttlMs) {
            this.ttlMs = ttlMs;
        }

        Decision begin(String key, String fingerprint, long now) {
            Kept kept = keys.get(key);
            // [ ] Forget keys older than the retention window
            if (kept == null) {
                // [ ] Claim the key before doing the work
                return Decision.PROCESS;
            }
            // [ ] Refuse a key reused for a different request
            // [ ] Answer a duplicate that arrives while the first runs
            return Decision.answer(kept.status(), "replayed");
        }

        void complete(String key, int status) {
            Kept kept = keys.get(key);
            // [ ] Keep the answer only when a retry would get the same
        }
    }

    // ---------------------------------------------------------------- test runner (do not change)
    record Req(String id, long t, String key, String body, int ms, int status) {}

    static String arg(String[] words, String name) {
        for (String w : words) {
            if (w.startsWith(name + "=")) {
                return w.substring(name.length() + 1);
            }
        }
        throw new IllegalArgumentException("missing " + name);
    }

    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        IdempotencyStore store = null;
        List<Req> reqs = new ArrayList<>();
        for (String line : input.lines().map(String::strip).filter(l -> !l.isEmpty()).toList()) {
            String[] w = line.split("\\s+");
            if (w[0].equals("store")) {
                store = new IdempotencyStore(Long.parseLong(arg(w, "ttl")));
            } else {
                // new String(...): bodies arrive as separate objects, as they would from separate HTTP requests.
                reqs.add(new Req(w[1], Long.parseLong(arg(w, "t")), arg(w, "key"), new String(arg(w, "body")),
                        Integer.parseInt(arg(w, "ms")), Integer.parseInt(arg(w, "status"))));
            }
        }
        Map<String, String> result = new HashMap<>();
        TreeMap<Long, List<Req>> completions = new TreeMap<>();
        List<Req> arrivals = new ArrayList<>(reqs);
        arrivals.sort(Comparator.comparingLong(Req::t));
        int charges = 0;
        int next = 0;
        while (next < arrivals.size() || !completions.isEmpty()) {
            long tArrive = next < arrivals.size() ? arrivals.get(next).t() : Long.MAX_VALUE;
            long tDone = completions.isEmpty() ? Long.MAX_VALUE : completions.firstKey();
            if (tDone <= tArrive) {
                for (Req r : completions.remove(tDone)) {
                    if (!r.key().equals("-")) {
                        store.complete(r.key(), r.status());
                    }
                    if (r.status() >= 200 && r.status() < 300) {
                        charges++;
                    }
                    result.put(r.id(), r.status() + " processed");
                }
                continue;
            }
            Req r = arrivals.get(next++);
            Decision d = r.key().equals("-") ? Decision.PROCESS : store.begin(r.key(), r.body(), r.t());
            if (d.process()) {
                completions.computeIfAbsent(r.t() + r.ms(), k -> new ArrayList<>()).add(r);
            } else {
                result.put(r.id(), d.status() + " " + d.note());
            }
        }
        List<String> out = new ArrayList<>();
        for (Req r : reqs) {
            out.add(r.id() + " key=" + r.key() + " -> " + result.get(r.id()));
        }
        out.add("charges=" + charges);
        System.out.println(String.join("\n", out));
    }
}
