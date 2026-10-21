// Known wrong: treats a gift card like a card and charges 2% (at least 3,000), but gift cards are Mekong Books' own money and have no fee.
/**
 * Mekong Books - daily settlement report.
 *
 * Every payment of the day is one input line: TYPE ID AMOUNT, separated by spaces, amounts in whole VND.
 *   CARD 4242 250000          a card payment (ID = last 4 digits of the card)
 *   BANK VCB 1200000          a bank transfer (ID = the customer's bank)
 *   EWALLET MOMO 99000        an e-wallet payment (ID = MOMO, ZALOPAY, SHOPEEPAY, ...)
 *   GIFT GC-001 50000         a Mekong Books gift card (ID = gift card code)
 * The runner turns each line into a record of the sealed interface Payment (below) and calls fee(p).
 *
 * Write fee(Payment p): the processing fee the provider charges Mekong Books, in VND, as a long.
 * Use a switch over the sealed Payment with record patterns and `when` guards, without `default`,
 * so that the compiler tells you when a new payment type is added. Rules (integer arithmetic only):
 *   - Card:          2% of the amount, rounded down (amount * 2 / 100), but at least 3,000.
 *   - BankTransfer:  amount below 500,000            -> 2,200
 *                    500,000 up to 999,999           -> 5,500
 *                    1,000,000 or more               -> 0
 *   - EWallet:       provider "ZALOPAY": 1% of the amount, rounded down (amount / 100).
 *                    any other provider: 1.5%, rounded down (amount * 15 / 1000).
 *   - GiftCard:      0 (it is Mekong Books' own money).
 * Multiply before you divide: 250,050 * 2 / 100 = 5,001, but 250,050 / 100 * 2 = 5,000.
 *
 * Output (printed by the runner): one line per payment, "TYPE ID amount fee fee", then a TOTAL line,
 * numbers with "," thousands separators.
 *
 * Example input:
 *   CARD 4242 250000
 *   CARD 1111 99000
 *   EWALLET ZALOPAY 99900
 * Example output:
 *   CARD 4242 250,000 fee 5,000
 *   CARD 1111 99,000 fee 3,000
 *   EWALLET ZALOPAY 99,900 fee 999
 *   TOTAL 448,900 fee 8,999
 */
import java.util.Locale;

public class Main {

    // ---------------------------------------------------------------- payment types (do not change)
    sealed interface Payment
            permits Card, BankTransfer, EWallet, GiftCard {}

    record Card(String last4, long amount)           implements Payment {}
    record BankTransfer(String bank, long amount)    implements Payment {}
    record EWallet(String provider, long amount)     implements Payment {}
    record GiftCard(String code, long amount)        implements Payment {}

    // ---------------------------------------------------------------- your code
    static long fee(Payment p) {
        return switch (p) {
            case Card(String last4, long amount) -> Math.max(amount * 2 / 100, 3_000);
            case BankTransfer(String bank, long amount) when amount < 500_000 -> 2_200;
            case BankTransfer(String bank, long amount) when amount < 1_000_000 -> 5_500;
            case BankTransfer(String bank, long amount) -> 0;
            case EWallet(String provider, long amount) when provider.equals("ZALOPAY") -> amount / 100;
            case EWallet(String provider, long amount) -> amount * 15 / 1000;
            case GiftCard(String code, long amount) -> Math.max(amount * 2 / 100, 3_000);   // same as a card
        };
    }

    // ---------------------------------------------------------------- test runner (do not change)
    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        long totalAmount = 0;
        long totalFee = 0;
        for (String line : input.split("\n")) {
            String[] parts = line.trim().split("\s+");
            if (parts.length == 1 && parts[0].isEmpty()) {
                continue;                                   // blank line
            }
            if (parts.length != 3) {
                System.out.println("error: expected TYPE ID AMOUNT, got \"" + line.trim() + "\"");
                continue;
            }
            long amount = Long.parseLong(parts[2]);
            Payment p = switch (parts[0]) {
                case "CARD" -> new Card(parts[1], amount);
                case "BANK" -> new BankTransfer(parts[1], amount);
                case "EWALLET" -> new EWallet(parts[1], amount);
                case "GIFT" -> new GiftCard(parts[1], amount);
                default -> null;
            };
            if (p == null) {
                System.out.println("error: unknown payment type " + parts[0]);
                continue;
            }
            String head = String.format(Locale.ROOT, "%s %s %,d", parts[0], parts[1], amount);
            try {
                long f = fee(p);
                totalAmount += amount;
                totalFee += f;
                System.out.println(head + String.format(Locale.ROOT, " fee %,d", f));
            } catch (RuntimeException e) {
                System.out.println(head + " error: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            }
        }
        System.out.println(String.format(Locale.ROOT, "TOTAL %,d fee %,d", totalAmount, totalFee));
    }
}
