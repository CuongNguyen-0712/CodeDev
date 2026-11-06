import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Rice Rocket order-service: one semaphore bulkhead per dependency, modelled on Resilience4j's
 * (semaphore) Bulkhead. A dependency allows at most `max` calls at once. A call that finds no free
 * permit waits up to `wait` ms for one (first come, first served); with wait=0, or when the wait runs
 * out, it is rejected (BulkheadFullException). A finished call frees its permit whether it succeeded
 * or failed, and the permit goes straight to the oldest waiting call of the same dependency.
 *
 * Input (stdin): the bulkheads, then the calls (any order):
 *   bulkhead payments max=4 wait=0
 *   bulkhead reports max=2 wait=500
 *   call c1 payments t=0 ms=300 ok
 *   call r1 reports t=10 ms=5000 error
 * Output: one line per call in input order ("<id> <dependency> started=<t> done=<t> <ok|error>" or
 * "<id> <dependency> rejected=<t>"), then the highest number of concurrent calls per dependency.
 */
public class Main {

    record Call(String id, String dependency, long arrival, int durationMs, boolean fails) {}

    record Waiter(Call call, long deadline) {}

    static final class Bulkhead {
        final int max;
        final int maxWaitMs;
        int inUse;
        final ArrayDeque<Waiter> waiting = new ArrayDeque<>();

        Bulkhead(int[] limit) {
            this.max = limit[0];
            this.maxWaitMs = limit[1];
        }
    }

    static final class Gateway {
        final Map<String, int[]> limits;
        final Map<String, Bulkhead> bulkheads = new HashMap<>();
        final Sim sim;

        Gateway(Map<String, int[]> limits, Sim sim) {
            this.limits = limits;
            this.sim = sim;
        }

        Bulkhead bulkheadFor(String dependency) {
            // [ ] Which bulkhead guards a dependency
        }

        void arrive(Call call, long now) {
            Bulkhead b = bulkheadFor(call.dependency());
            // [ ] Take a permit, queue for one, or reject
        }

        void finish(Call call, long now) {
            Bulkhead b = bulkheadFor(call.dependency());
            // [ ] Give the permit back when a call ends
            while (!b.waiting.isEmpty() && b.inUse < b.max) {
                Waiter w = b.waiting.removeFirst();
                b.inUse++;
                sim.start(w.call(), now);
            }
        }

        void expire(long now) {
            for (Bulkhead b : bulkheads.values()) {
                // [ ] Reject calls that waited too long
            }
        }
    }

    // ---------------------------------------------------------------- test runner (do not change)
    static final class Sim {
        final Map<String, String> result = new HashMap<>();
        final TreeMap<Long, List<Call>> finishes = new TreeMap<>();
        final Map<String, Integer> running = new HashMap<>();
        final Map<String, Integer> peak = new TreeMap<>();

        void start(Call call, long now) {
            long done = now + call.durationMs();
            result.put(call.id(), call.dependency() + " started=" + now + " done=" + done + " " + (call.fails() ? "error" : "ok"));
            finishes.computeIfAbsent(done, k -> new ArrayList<>()).add(call);
            int r = running.merge(call.dependency(), 1, Integer::sum);
            peak.merge(call.dependency(), r, Math::max);
        }

        void reject(Call call, long at) {
            result.put(call.id(), call.dependency() + " rejected=" + at);
        }
    }

    static int arg(String[] words, String name) {
        for (String w : words) {
            if (w.startsWith(name + "=")) {
                return Integer.parseInt(w.substring(name.length() + 1));
            }
        }
        throw new IllegalArgumentException("missing " + name);
    }

    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        Map<String, int[]> limits = new HashMap<>();
        List<Call> calls = new ArrayList<>();
        for (String line : input.lines().map(String::strip).filter(l -> !l.isEmpty()).toList()) {
            String[] w = line.split("\\s+");
            if (w[0].equals("bulkhead")) {
                limits.put(w[1], new int[] {arg(w, "max"), arg(w, "wait")});
            } else {
                calls.add(new Call(w[1], w[2], arg(w, "t"), arg(w, "ms"), w[5].equals("error")));
            }
        }
        Sim sim = new Sim();
        Gateway gateway = new Gateway(limits, sim);
        ArrayDeque<Call> arrivals = new ArrayDeque<>(calls.stream().sorted(Comparator.comparingLong(Call::arrival)).toList());
        long now = -1;
        while (true) {
            long next = Long.MAX_VALUE;
            if (!arrivals.isEmpty()) next = arrivals.peekFirst().arrival();
            if (!sim.finishes.isEmpty()) next = Math.min(next, sim.finishes.firstKey());
            for (Bulkhead b : gateway.bulkheads.values()) {
                for (Waiter w : b.waiting) {
                    if (w.deadline() > now) next = Math.min(next, w.deadline());
                }
            }
            if (next == Long.MAX_VALUE) break;
            now = next;
            // Same instant: finished calls free their permits first, then waits run out, then new calls arrive.
            List<Call> done = sim.finishes.remove(now);
            if (done != null) {
                for (Call c : done) {
                    sim.running.merge(c.dependency(), -1, Integer::sum);
                    gateway.finish(c, now);
                }
            }
            gateway.expire(now);
            while (!arrivals.isEmpty() && arrivals.peekFirst().arrival() == now) {
                gateway.arrive(arrivals.removeFirst(), now);
            }
        }
        List<String> out = new ArrayList<>();
        for (Call c : calls) {
            out.add(c.id() + " " + sim.result.getOrDefault(c.id(), c.dependency() + " never started"));
        }
        StringBuilder peaks = new StringBuilder("peak");
        sim.peak.forEach((dep, n) -> peaks.append(" ").append(dep).append("=").append(n));
        out.add(peaks.toString());
        System.out.println(String.join("\n", out));
    }
}
