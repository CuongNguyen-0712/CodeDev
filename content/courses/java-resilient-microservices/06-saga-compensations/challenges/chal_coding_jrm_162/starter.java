import java.util.*;

/**
 * Rice Rocket checkout saga, run by the order-service orchestrator.
 *
 * Steps, in order: authorize-payment, reserve-courier, confirm-restaurant, capture-payment,
 * notify-customer. confirm-restaurant is the pivot: once the kitchen accepted the order, the food is
 * being cooked and the saga only moves forward.
 *
 * Write run(steps, pivot, svc):
 *   - Up to and including the pivot, call each step once. svc.call answers "ok", "rejected" (the
 *     service said no) or "timeout" (no answer: the step may or may not have happened).
 *     On anything but "ok", stop and compensate: undo every step that may have taken effect,
 *     newest first. A timed-out step may have taken effect, so it is undone too (undo is
 *     idempotent: undoing something that never happened is a no-op for the service).
 *   - After the pivot, never compensate: retry the step until svc.call answers "ok", at most
 *     MAX_ATTEMPTS times. Still failing: return "stuck: <step> did not succeed after 5 attempts".
 *   - An undo is retried until svc.undo answers "ok", at most MAX_ATTEMPTS times. Still failing:
 *     return "stuck: undo <step> failed 5 times" (an operator finishes from the saga log).
 *   - Return "completed" or "compensated".
 * The services (Services) are scripted by the test runner below, which logs every call.
 */
public class Main {
    static final int MAX_ATTEMPTS = 5;

    static String run(List<String> steps, String pivot, Services svc) {
        Deque<String> done = new ArrayDeque<>();
        int pivotIndex = steps.indexOf(pivot);
        for (int i = 0; i < steps.size(); i++) {
            String step = steps.get(i);
            // [ ] Steps after the pivot only move forward
            String result = svc.call(step);
            // [ ] Remember every step that may have taken effect
            if (!result.equals("ok")) return compensate(done, svc);
        }
        return "completed";
    }

    // [ ] Undo what may have happened, newest first

    // [ ] Retry one compensation until it succeeds

    static boolean retryForward(String step, Services svc) {
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            if (svc.call(step).equals("ok")) return true;
        }
        return false;
    }

    // ---------------------------------------------------------------- test runner (do not change)
    // Input lines:
    //   saga <step> <step> ...           the steps, in order
    //   pivot <step>
    //   call <step> <answer> <answer>... answers of successive calls (ok | rejected | timeout); unlisted: ok
    //   undo <step> <answer> ...         answers of successive undos (ok | fail); unlisted: ok
    // Output: every call in order, the saga's result, and the effects still in place.
    // A "timeout" call takes effect (the provider did it; only the answer was lost).
    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        List<String> steps = new ArrayList<>();
        String pivot = null;
        Services svc = new Services();
        try {
            for (String line : input.lines().map(String::strip).filter(l -> !l.isEmpty()).toList()) {
                String[] p = line.split("\\s+");
                List<String> rest = Arrays.asList(p).subList(Math.min(2, p.length), p.length);
                switch (p[0]) {
                    case "saga" -> steps.addAll(Arrays.asList(p).subList(1, p.length));
                    case "pivot" -> pivot = p[1];
                    case "call" -> svc.calls.put(p[1], new ArrayDeque<>(rest));
                    case "undo" -> svc.undos.put(p[1], new ArrayDeque<>(rest));
                    default -> throw new IllegalArgumentException("unknown line " + line);
                }
            }
            String result = run(steps, pivot, svc);
            svc.log.forEach(System.out::println);
            System.out.println("saga: " + result);
            List<String> left = steps.stream().filter(svc.effects::contains).toList();
            System.out.println("left in place: " + (left.isEmpty() ? "nothing" : String.join(", ", left)));
        } catch (RuntimeException e) {
            svc.log.forEach(System.out::println);
            System.out.println("error: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }
}

/** The payment, courier, restaurant and notification services, scripted per test. */
class Services {
    final Map<String, Deque<String>> calls = new HashMap<>();
    final Map<String, Deque<String>> undos = new HashMap<>();
    final Set<String> effects = new HashSet<>();
    final List<String> log = new ArrayList<>();

    String call(String step) {
        if (log.size() > 200) throw new IllegalStateException("too many calls: the saga is looping");
        Deque<String> answers = calls.get(step);
        String answer = answers == null || answers.isEmpty() ? "ok" : answers.poll();
        if (answer.equals("ok") || answer.equals("timeout")) effects.add(step);
        log.add(step + ": " + answer);
        return answer;
    }

    String undo(String step) {
        if (log.size() > 200) throw new IllegalStateException("too many calls: the saga is looping");
        Deque<String> answers = undos.get(step);
        String answer = answers == null || answers.isEmpty() ? "ok" : answers.poll();
        if (answer.equals("ok")) effects.remove(step);
        log.add("undo " + step + ": " + answer);
        return answer;
    }
}
