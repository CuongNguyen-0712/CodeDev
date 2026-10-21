/**
 * Mekong Books shipping fee calculator.
 *
 * Each input line is one order: METHOD KG REGION, separated by one or more spaces.
 *   METHOD  shipping method name, in any letter case: "EXPRESS", "express", "Express" ...
 *   KG      parcel weight in whole kilograms (1 or more)
 *   REGION  delivery region code, for example HN, HCM, DN, CT, HUE
 * Blank lines are ignored.
 *
 * Write two methods:
 *
 *   parseMethod(text)  returns the ShippingMethod whose name matches text, ignoring letter case,
 *                      or null if text is not a method name. It must never throw.
 *
 *   fee(method, kg, region)  returns the shipping fee in VND (a long), using a switch expression:
 *     STANDARD  20,000 + 5,000 per kg
 *     EXPRESS   35,000 + 10,000 per kg
 *     PICKUP    0 (the customer collects the parcel in a store)
 *     Delivery outside HN and HCM (any other region code) adds 15,000 to STANDARD and EXPRESS.
 *     PICKUP stays 0 in every region.
 *
 * The runner prints one line per order and a summary line:
 *   EXPRESS 3kg DN: 80000            (method name, weight, region, fee)
 *   error: unknown method DRONE      (parseMethod returned null; the text is printed as typed)
 *   orders: 1, errors: 1, total: 80000
 *
 * Example input:            Output:
 *   express 3 DN              EXPRESS 3kg DN: 80000
 *   DRONE 1 HN                error: unknown method DRONE
 *                             orders: 1, errors: 1, total: 80000
 */
public class Main {
    enum ShippingMethod { STANDARD, EXPRESS, PICKUP }

    static ShippingMethod parseMethod(String text) {
        try {
            return ShippingMethod.valueOf(text.toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    static long fee(ShippingMethod method, int kg, String region) {
        long outsideCity = region.equals("HN") || region.equals("HCM") ? 0 : 15_000;
        return switch (method) {
            case STANDARD -> 20_000 + 5_000L * kg + outsideCity;
            case EXPRESS -> 35_000 + 10_000L * kg + outsideCity;
            case PICKUP -> 0;
        };
    }

    // ---------------------------------------------------------------- test runner (do not change)
    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        int orders = 0;
        int errors = 0;
        long total = 0;
        for (String line : input.split("\n")) {
            if (line.isBlank()) {
                continue;
            }
            String[] parts = line.trim().split("\s+");
            try {
                ShippingMethod method = parseMethod(parts[0]);
                if (method == null) {
                    System.out.println("error: unknown method " + parts[0]);
                    errors++;
                    continue;
                }
                int kg = Integer.parseInt(parts[1]);
                long f = fee(method, kg, parts[2]);
                System.out.println(method.name() + " " + kg + "kg " + parts[2] + ": " + f);
                orders++;
                total += f;
            } catch (RuntimeException e) {
                System.out.println("error: " + e.getClass().getSimpleName() + ": " + e.getMessage());
                errors++;
            }
        }
        System.out.println("orders: " + orders + ", errors: " + errors + ", total: " + total);
    }
}
