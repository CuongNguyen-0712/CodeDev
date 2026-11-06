import java.util.*;

/**
 * Rice Rocket payment-service: the traceparent it sends to the card processor.
 *
 * The hand-written HTTP client of the payment-service must continue the caller's trace (W3C Trace
 * Context): read the incoming traceparent header, and build the header for the outgoing call.
 *
 *   traceparent = version "-" trace-id "-" parent-id "-" trace-flags
 *     version   2 lowercase hex digits; "ff" is invalid
 *     trace-id  32 lowercase hex digits, not all zeros
 *     parent-id 16 lowercase hex digits, not all zeros
 *     flags     2 lowercase hex digits; bit 0x01 = sampled
 *   Version 00 headers are exactly 55 characters. A higher version may be longer: parse its first
 *   55 characters the same way, and the character after them must be "-".
 *
 * outgoing(incoming, spanId, newTraceId, sampleNew) returns one line:
 *   "continue <header>"  incoming is valid: same trace-id, parent-id = this call's spanId, version 00,
 *                        flags "01" when the caller sampled, else "00"
 *   "restart (<reason>) <header>"  missing (null) or invalid: a new trace (newTraceId, spanId),
 *                        flags from this service's own decision sampleNew. Reasons, checked in this
 *                        order: missing, bad length, bad version, version ff, bad trace-id,
 *                        zero trace-id, bad parent-id, zero parent-id, bad flags.
 */
public class Main {
    static final String ZERO_TRACE = "0".repeat(32);
    static final String ZERO_SPAN = "0".repeat(16);

    static String outgoing(String incoming, String spanId, String newTraceId, boolean sampleNew) {
        String reason = problem(incoming);
        if (reason != null) {
            // @piece restart: Start a new trace when the caller's context is unusable
            return "restart (" + reason + ") 00-" + newTraceId + "-" + spanId + "-" + (sampleNew ? "01" : "00");
            // @end
        }
        String traceId = incoming.substring(3, 35);
        boolean sampled = (Integer.parseInt(incoming.substring(53, 55), 16) & 0x01) == 1;
        // @piece child-header: The header for the outgoing call
        return "continue 00-" + traceId + "-" + spanId + "-" + (sampled ? "01" : "00");
        // @end
    }

    /** The first problem with an incoming header, or null when it can be continued. */
    static String problem(String h) {
        if (h == null) return "missing";
        // @piece check-shape: Length and version
        if (h.length() < 55) return "bad length";
        String version = h.substring(0, 2);
        if (!version.matches("[0-9a-f]{2}") || h.charAt(2) != '-') return "bad version";
        if (version.equals("ff")) return "version ff";
        if (version.equals("00") ? h.length() != 55 : h.length() > 55 && h.charAt(55) != '-') return "bad length";
        // @end
        String traceId = h.substring(3, 35);
        String parentId = h.substring(36, 52);
        // @piece check-ids: trace-id and parent-id
        if (!traceId.matches("[0-9a-f]{32}") || h.charAt(35) != '-') return "bad trace-id";
        if (traceId.equals(ZERO_TRACE)) return "zero trace-id";
        if (!parentId.matches("[0-9a-f]{16}") || h.charAt(52) != '-') return "bad parent-id";
        if (parentId.equals(ZERO_SPAN)) return "zero parent-id";
        // @end
        if (!h.substring(53, 55).matches("[0-9a-f]{2}")) return "bad flags";
        return null;
    }

    // ---------------------------------------------------------------- test runner (do not change)
    // Input lines:
    //   span <16 hex>          the span id of the outgoing call
    //   new-trace <32 hex>     the trace id to use when a new trace starts
    //   sample-new true|false  this service's sampling decision for a new trace
    //   in <header>            one incoming traceparent ("in -" = no header); prints one line
    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        String span = null, newTrace = null;
        boolean sampleNew = false;
        try {
            for (String line : input.lines().filter(l -> !l.isBlank()).toList()) {
                int space = line.indexOf(' ');
                String cmd = line.substring(0, space), arg = line.substring(space + 1);
                switch (cmd) {
                    case "span" -> span = arg.strip();
                    case "new-trace" -> newTrace = arg.strip();
                    case "sample-new" -> sampleNew = Boolean.parseBoolean(arg.strip());
                    case "in" -> System.out.println(outgoing(arg.equals("-") ? null : arg, span, newTrace, sampleNew));
                    default -> throw new IllegalArgumentException("unknown line " + line);
                }
            }
        } catch (RuntimeException e) {
            System.out.println("error: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }
}
