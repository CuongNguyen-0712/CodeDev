import java.util.List;
import java.util.Locale;

/**
 * Mekong Books checkout receipt.
 *
 * Input (stdin), one order:
 *   line 1      the coupon code exactly as the customer typed it. It may have spaces around it,
 *               any mix of upper and lower case, or be empty / only spaces (no coupon).
 *   next lines  one order line each: "QTY x UNIT_PRICE TITLE", for example "2 x 120000 Clean Code".
 *               QTY and UNIT_PRICE are whole numbers that fit in an int; prices are whole dong.
 *
 * Write the four methods below. The test runner at the bottom reads the input, calls them and
 * prints the receipt.
 *
 *   lineTotal(quantity, unitPrice)   quantity x unitPrice as a long. A school can order
 *                                    25,000 copies of a 120,000 VND book: 3,000,000,000 VND.
 *   discountPercent(couponCode)      the percent off for the code the customer typed:
 *                                    BOOK10 -> 10, SCHOOL5 -> 5, anything else (also empty) -> 0.
 *                                    Ignore spaces around the code and upper/lower case:
 *                                    " book10 " is BOOK10. "BOOK20" or "BOOK 10" give 0.
 *   discountAmount(subtotal, percent) percent of subtotal, rounded down to whole dong,
 *                                    with integer arithmetic only (no double).
 *                                    discountAmount(299_997, 5) -> 14_999.
 *   money(amount)                    the amount with a comma every three digits, then " VND",
 *                                    for any locale: money(3_000_000_000L) -> "3,000,000,000 VND".
 *
 * Example input:
 *   BOOK10
 *   2 x 120000 Clean Code
 *   1 x 89000 De Men Phieu Luu Ky
 *
 * Expected output:
 *   Mekong Books receipt
 *   2 x Clean Code: 240,000 VND
 *   1 x De Men Phieu Luu Ky: 89,000 VND
 *   Subtotal: 329,000 VND
 *   Discount 10%: -32,900 VND
 *   Total: 296,100 VND
 *
 * With an empty coupon line the discount line is "Coupon: none"; with a code that gives 0 percent
 * it is "Coupon not applied: BOOK20" (the code with the spaces around it removed).
 */
public class Main {

    static long lineTotal(int quantity, int unitPrice) {
        // Widen to long BEFORE multiplying: int * int overflows above 2,147,483,647.
        return (long) quantity * unitPrice;
    }

    static int discountPercent(String couponCode) {
        String code = couponCode.strip().toUpperCase(Locale.ROOT);
        if (code.equals("BOOK10")) {
            return 10;
        }
        if (code.equals("SCHOOL5")) {
            return 5;
        }
        return 0;
    }

    static long discountAmount(long subtotal, int percent) {
        // Multiply first, divide last: long division rounds toward zero (down for amounts >= 0).
        return subtotal * percent / 100;
    }

    static String money(long amount) {
        return String.format(Locale.ROOT, "%,d VND", amount);
    }

    // ---------------------------------------------------------------- test runner (do not change)
    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        List<String> lines = input.lines().toList();
        String couponCode = lines.isEmpty() ? "" : lines.get(0);
        try {
            System.out.println("Mekong Books receipt");
            long subtotal = 0;
            for (String line : lines.subList(Math.min(1, lines.size()), lines.size())) {
                if (line.isBlank()) {
                    continue;
                }
                String[] parts = line.strip().split(" ", 4);   // QTY, "x", UNIT_PRICE, TITLE
                int quantity = Integer.parseInt(parts[0]);
                int unitPrice = Integer.parseInt(parts[2]);
                long total = lineTotal(quantity, unitPrice);
                subtotal += total;
                System.out.println(quantity + " x " + parts[3] + ": " + money(total));
            }
            System.out.println("Subtotal: " + money(subtotal));
            int percent = discountPercent(couponCode);
            long discount = 0;
            if (percent > 0) {
                discount = discountAmount(subtotal, percent);
                System.out.println("Discount " + percent + "%: -" + money(discount));
            } else if (couponCode.isBlank()) {
                System.out.println("Coupon: none");
            } else {
                System.out.println("Coupon not applied: " + couponCode.strip());
            }
            System.out.println("Total: " + money(subtotal - discount));
        } catch (RuntimeException e) {
            System.out.println("error: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }
}
