import java.util.ArrayList;
import java.util.List;

/**
 * Rice Rocket order-service: the call to payment-service during checkout.
 *
 * One checkout may spend at most `deadline` ms on payments. Each attempt waits at most `timeout` ms,
 * and never longer than what is left of the deadline. Only transient failures are retried: no answer
 * in time, 429 and 5xx. Before retry n the call waits backoff * 2^(n-1) ms, unless that wait would
 * reach the deadline. Retries also spend a budget shared by every checkout of this instance: each
 * checkout adds `ratio` tokens (never above the starting `tokens`), each retry costs one token.
 *
 * Input (stdin): the policy line, then one line per checkout, in arrival order:
 *   policy deadline=2000 timeout=800 attempts=3 backoff=100 tokens=2 ratio=0.1
 *   call c1 503:120 200:80
 *   call c2 timeout 200:50
 * Each outcome is what payment-service does on that attempt: "<status>:<ms>" answers after ms,
 * "timeout" never answers. When the attempts outrun the list, the last outcome repeats.
 *
 * Output: one line per checkout, then the totals, for example
 *   c1 ok attempts=2 elapsed=300
 *   c2 failed status=409 attempts=1 elapsed=40
 *   c3 failed deadline attempts=2 elapsed=1600
 *   c4 failed budget attempts=1 elapsed=900
 *   total checkouts=4 attempts=6
 */
public class Main {

    record Policy(int deadlineMs, int timeoutMs, int maxAttempts, int backoffMs, double tokens, double ratio) {}

    /** Retry tokens shared by all checkouts of one order-service instance, in thousandths of a token. */
    static final class RetryBudget {
        static final long ONE = 1000;
        long tokens;
        final long max;
        final long ratio;

        RetryBudget(double tokens, double ratio) {
            this.tokens = Math.round(tokens * ONE);
            this.max = this.tokens;
            this.ratio = Math.round(ratio * ONE);
        }

        void onCheckout() {
            tokens = Math.min(max, tokens + ratio);
        }
    }

    static String call(String id, Policy p, RetryBudget budget, List<String> outcomes) {
        int elapsed = 0;
        int attempt = 0;
        while (true) {
            attempt++;
            // @piece attempt-timeout: How long this attempt may wait for an answer
            int limit = Math.min(p.timeoutMs(), p.deadlineMs() - elapsed);
            // @end
            String outcome = outcomes.get(Math.min(attempt, outcomes.size()) - 1);
            int status = 0; // 0: no answer within the limit
            if (!outcome.equals("timeout")) {
                String[] parts = outcome.split(":");
                int ms = Integer.parseInt(parts[1]);
                if (ms <= limit) {
                    status = Integer.parseInt(parts[0]);
                    elapsed += ms;
                }
            }
            if (status == 0) {
                elapsed += limit;
            }
            if (status >= 200 && status < 300) {
                return id + " ok attempts=" + attempt + " elapsed=" + elapsed;
            }
            String failure = status == 0 ? "timeout" : "status=" + status;
            // @piece retry-only-transient: Give up at once on errors a retry cannot fix
            if (status != 0 && status != 429 && status < 500) {
                return id + " failed " + failure + " attempts=" + attempt + " elapsed=" + elapsed;
            }
            // @end
            if (attempt >= p.maxAttempts()) {
                return id + " failed " + failure + " attempts=" + attempt + " elapsed=" + elapsed;
            }
            // @piece backoff-before-deadline: Back off before retrying, unless it hits the deadline
            int wait = p.backoffMs() << (attempt - 1);
            if (elapsed + wait >= p.deadlineMs()) {
                return id + " failed deadline attempts=" + attempt + " elapsed=" + elapsed;
            }
            // @end
            // @piece spend-retry-budget: Retry only while the shared retry budget lasts
            if (budget.tokens < RetryBudget.ONE) {
                return id + " failed budget attempts=" + attempt + " elapsed=" + elapsed;
            }
            budget.tokens -= RetryBudget.ONE;
            // @end
            elapsed += wait;
        }
    }

    // ---------------------------------------------------------------- test runner (do not change)
    static int intArg(String[] words, String name) {
        return (int) doubleArg(words, name);
    }

    static double doubleArg(String[] words, String name) {
        for (String w : words) {
            if (w.startsWith(name + "=")) {
                return Double.parseDouble(w.substring(name.length() + 1));
            }
        }
        throw new IllegalArgumentException("missing " + name);
    }

    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        Policy policy = null;
        RetryBudget budget = null;
        List<String> out = new ArrayList<>();
        int attempts = 0;
        int checkouts = 0;
        for (String line : input.lines().map(String::strip).filter(l -> !l.isEmpty()).toList()) {
            String[] words = line.split("\\s+");
            if (words[0].equals("policy")) {
                policy = new Policy(intArg(words, "deadline"), intArg(words, "timeout"), intArg(words, "attempts"),
                        intArg(words, "backoff"), doubleArg(words, "tokens"), doubleArg(words, "ratio"));
                budget = new RetryBudget(policy.tokens(), policy.ratio());
                continue;
            }
            budget.onCheckout();
            String result = call(words[1], policy, budget, List.of(words).subList(2, words.length));
            out.add(result);
            checkouts++;
            attempts += Integer.parseInt(result.replaceAll(".*attempts=(\\d+).*", "$1"));
        }
        out.add("total checkouts=" + checkouts + " attempts=" + attempts);
        System.out.println(String.join("\n", out));
    }
}
