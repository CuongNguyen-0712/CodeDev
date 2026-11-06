import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/**
 * Rice Rocket order-service: the circuit breaker in front of the courier-matching service, modelled on
 * Resilience4j's count-based CircuitBreaker.
 *
 *   CLOSED     calls go through and are recorded in a window of the last `window` recorded calls.
 *              Once the window holds at least `minCalls` calls, the breaker opens when the failure
 *              rate or the slow-call rate (in %) is at or above its threshold.
 *   OPEN       calls are rejected without calling the service, until `openMs` have passed since it
 *              opened; the next call then moves the breaker to HALF_OPEN.
 *   HALF_OPEN  `halfOpenCalls` trial calls go through; once they are recorded the breaker opens again
 *              if the rates are still at or above a threshold, otherwise it closes.
 * Every change of state starts a new, empty window. A 400 (bad-request) is the caller's mistake: it
 * goes through but is not recorded. A call is slow when it takes longer than `slowMs`.
 *
 * Input (stdin): the config line, then one call per line in time order:
 *   config window=10 minCalls=5 failureRate=50 slowMs=1000 slowRate=80 openMs=5000 halfOpenCalls=3
 *   call t=0 ok 120
 *   call t=100 error 300
 *   call t=200 bad-request 40
 * Output: one line per call ("t=<ms> <state before> <ok|error|ignored|rejected>[ slow]"), each change of
 * state on its own line after the call that caused it, and the final state.
 */
public class Main {

    record Config(int window, int minCalls, int failureRate, int slowMs, int slowRate, int openMs, int halfOpenCalls) {}

    record Outcome(boolean failure, boolean slow) {}

    enum State { CLOSED, OPEN, HALF_OPEN }

    static final class Breaker {
        final Config c;
        final List<String> events = new ArrayList<>();
        final ArrayDeque<Outcome> window = new ArrayDeque<>();
        State state = State.CLOSED;
        long openUntil;

        Breaker(Config c) {
            this.c = c;
        }

        String onCall(long t, String result, int durationMs) {
            // [ ] While open, reject calls until the wait is over
            // [ ] Which calls are recorded, as failures or as slow
            window.addLast(outcome);
            if (window.size() > c.window()) {
                window.removeFirst();
            }
            if (state == State.CLOSED) {
                // [ ] Open once enough calls show too many failures
            } else {
                // [ ] After the trial calls, open again or close
            }
            return result + (outcome.slow() ? " slow" : "");
        }

        boolean tooBad() {
            long failures = window.stream().filter(Outcome::failure).count();
            long slow = window.stream().filter(Outcome::slow).count();
            return failures * 100 >= (long) c.failureRate() * window.size()
                    || slow * 100 >= (long) c.slowRate() * window.size();
        }

        void transition(State to, long t) {
            events.add("t=" + t + " " + state + " -> " + to);
            state = to;
            window.clear();
            if (to == State.OPEN) {
                openUntil = t + c.openMs();
            }
        }
    }

    // ---------------------------------------------------------------- test runner (do not change)
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
        Breaker breaker = null;
        List<String> out = new ArrayList<>();
        for (String line : input.lines().map(String::strip).filter(l -> !l.isEmpty()).toList()) {
            String[] words = line.split("\\s+");
            if (words[0].equals("config")) {
                breaker = new Breaker(new Config(arg(words, "window"), arg(words, "minCalls"), arg(words, "failureRate"),
                        arg(words, "slowMs"), arg(words, "slowRate"), arg(words, "openMs"), arg(words, "halfOpenCalls")));
                continue;
            }
            long t = arg(words, "t");
            State before = breaker.state;
            String result = breaker.onCall(t, words[2], Integer.parseInt(words[3]));
            out.add("t=" + t + " " + before + " " + result);
            out.addAll(breaker.events);
            breaker.events.clear();
        }
        out.add("state=" + breaker.state);
        System.out.println(String.join("\n", out));
    }
}
