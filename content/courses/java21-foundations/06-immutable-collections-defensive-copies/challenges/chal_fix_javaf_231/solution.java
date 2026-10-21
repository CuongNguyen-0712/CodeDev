import java.util.ArrayList;
import java.util.List;

/**
 * Mekong Books checkout: one CheckoutService serves many customers, one after another.
 *
 * The service keeps ONE reusable cart buffer: add() puts a line into it, checkout() saves an
 * Order with the lines of the cart and then clears the cart for the next customer.
 *
 * Bug reports from the warehouse:
 *   - saved orders lose their books, or show the books of the customer who is shopping now;
 *   - a free gift added to one order also turns up in the next customer's order;
 *   - the old promotions module (in the test runner, see "promo" below) calls
 *     order.lines().add(...) and silently changes saved orders.
 *
 * Requirements (fix the code above the test runner; do not change the runner):
 *   1. An Order never changes after it is created: not when the list it was built from is
 *      cleared or filled again later, and not through order.lines().
 *   2. order.lines() returns a list that cannot be modified: add(...) on it throws
 *      UnsupportedOperationException.
 *   3. gift(id, isbn) REPLACES the saved order that has this id with a new Order: same id, same
 *      position in saved(), the same lines followed by one new line (isbn, qty 1). No other order
 *      and no cart changes. If no saved order has this id, it throws
 *      IllegalArgumentException("no order <id>").
 *   4. Already correct, keep it: order ids are MB-1001, MB-1002, ... in checkout order, and
 *      checkout() with an empty cart throws IllegalStateException("cart is empty").
 *
 * Input (stdin), one command per line; blank lines are ignored:
 *   add <isbn> <qty>     add a line to the current cart (prints nothing)
 *   checkout             prints "checkout <id>: <n> line(s)"
 *   gift <id> <isbn>     calls service.gift(id, isbn), then prints "gift added to <id>"
 *   promo <id> <isbn>    old promotions module: calls order.lines().add(...) on the saved order;
 *                        prints "error: order <id> is read-only" when that throws
 *                        UnsupportedOperationException, "promo added to <id>" when the list
 *                        accepted it, "error: no order <id>" when there is no such order
 * An exception thrown by the service prints "error: <message>" (or the exception's simple class
 * name when it has no message). After the last command the runner prints "orders:" and every
 * saved order, one per line:  <id>: <isbn> x<qty>, <isbn> x<qty>   or   <id>: (no lines)
 *
 * Example input:              Expected output:
 *   add 9786041000011 2         checkout MB-1001: 1 line(s)
 *   checkout                    gift added to MB-1001
 *   gift MB-1001 GIFT-BM        error: order MB-1001 is read-only
 *   promo MB-1001 PROMO-01      orders:
 *   add 9786041000028 1         MB-1001: 9786041000011 x2, GIFT-BM x1
 */
public class Main {

    record OrderLine(String isbn, int qty) {}

    record Order(String id, List<OrderLine> lines) {
        Order {
            lines = List.copyOf(lines); // own unmodifiable copy: later changes to the caller's list do not reach it
        }
    }

    static class CheckoutService {
        private final List<OrderLine> cart = new ArrayList<>(); // reused for every customer
        private final List<Order> saved = new ArrayList<>();
        private int nextNo = 1001;

        void add(String isbn, int qty) {
            cart.add(new OrderLine(isbn, qty));
        }

        Order checkout() {
            if (cart.isEmpty()) {
                throw new IllegalStateException("cart is empty");
            }
            Order order = new Order("MB-" + nextNo++, cart);
            saved.add(order);
            cart.clear(); // ready for the next customer
            return order;
        }

        void gift(String id, String isbn) {
            for (int i = 0; i < saved.size(); i++) {
                Order order = saved.get(i);
                if (order.id().equals(id)) {
                    List<OrderLine> withGift = new ArrayList<>(order.lines());
                    withGift.add(new OrderLine(isbn, 1));
                    saved.set(i, new Order(id, withGift));
                    return;
                }
            }
            throw new IllegalArgumentException("no order " + id);
        }

        List<Order> saved() {
            return saved;
        }
    }

    // ---------------------------------------------------------------- test runner (do not change)
    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        CheckoutService service = new CheckoutService();
        for (String raw : input.split("\n")) {
            String[] w = raw.trim().split("\\s+");
            if (w[0].isEmpty()) continue;
            try {
                switch (w[0]) {
                    case "add" -> service.add(w[1], Integer.parseInt(w[2]));
                    case "checkout" -> {
                        Order o = service.checkout();
                        System.out.println("checkout " + o.id() + ": " + o.lines().size() + " line(s)");
                    }
                    case "gift" -> {
                        service.gift(w[1], w[2]);
                        System.out.println("gift added to " + w[1]);
                    }
                    case "promo" -> promotionsModule(service, w[1], w[2]);
                    default -> System.out.println("error: unknown command " + w[0]);
                }
            } catch (RuntimeException e) {
                String msg = e.getMessage();
                System.out.println("error: " + (msg != null ? msg : e.getClass().getSimpleName()));
            }
        }
        System.out.println("orders:");
        for (Order o : service.saved()) {
            System.out.println(format(o));
        }
    }

    // Old promotions code that still tries to change saved orders in place.
    static void promotionsModule(CheckoutService service, String id, String isbn) {
        for (Order o : service.saved()) {
            if (o.id().equals(id)) {
                try {
                    o.lines().add(new OrderLine(isbn, 1));
                    System.out.println("promo added to " + id);
                } catch (UnsupportedOperationException e) {
                    System.out.println("error: order " + id + " is read-only");
                }
                return;
            }
        }
        System.out.println("error: no order " + id);
    }

    static String format(Order o) {
        if (o.lines().isEmpty()) return o.id() + ": (no lines)";
        StringBuilder sb = new StringBuilder(o.id()).append(": ");
        for (int i = 0; i < o.lines().size(); i++) {
            OrderLine l = o.lines().get(i);
            if (i > 0) sb.append(", ");
            sb.append(l.isbn()).append(" x").append(l.qty());
        }
        return sb.toString();
    }
}
