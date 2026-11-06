import java.util.*;

/**
 * Rice Rocket order-service: placing an order and relaying its events to Kafka (topic orders.v1).
 *
 * Last week's version published OrderPlaced from inside the request transaction and its relay
 * lost or doubled events. Three things must hold:
 *   - placeOrder: the order and its OrderPlaced event are saved in ONE database transaction
 *     (the outbox table), and nothing is sent to Kafka from the request. A rolled-back order
 *     must never produce an event; Kafka being down must not stop orders being taken.
 *   - CLAIM_SQL: the query each relay pod runs to claim a batch of unsent events. Two pods poll
 *     at the same time: a row claimed by one pod must not be published by the other, and
 *     neither pod may sit waiting on the other's locks.
 *   - relayOnce: publish the claimed events in id order with the order id as the Kafka key, and
 *     mark a row sent only after Kafka acknowledged it. If Kafka fails mid-batch, the rest of
 *     the batch stays unsent for the next poll.
 *
 * The database (Db, Tx) and Kafka (Broker) are stand-ins in the test runner below. Tx.query
 * understands only a SELECT on the outbox table: WHERE sent_at IS NULL, optional ORDER BY id,
 * LIMIT ?, and optional FOR UPDATE / FOR UPDATE SKIP LOCKED, as PostgreSQL treats them.
 */
public class Main {
    static final String TOPIC = "orders.v1";

    // [ ] The query a relay pod uses to claim unsent events

    /** POST /orders. Throws DbException when the order cannot be saved. */
    static void placeOrder(Db db, Broker broker, String orderId, String customer) {
        // [ ] Save the order and its event as one decision
    }

    /** One poll of a relay pod. Returns how many events it published. */
    static int relayOnce(Db db, Broker broker, int batchSize) {
        Tx tx = db.begin();
        int sent = 0;
        for (OutboxRow row : tx.query(CLAIM_SQL, batchSize)) {
            // [ ] Publish one claimed event, then record it as sent
        }
        tx.commit();
        return sent;
    }

    // ---------------------------------------------------------------- test runner (do not change)
    // Input: one command per line.
    //   place <orderId> <customer>   POST /orders (a repeated orderId or the customer "-" fails at commit)
    //   kafka down | kafka up         Kafka refuses / accepts every send
    //   kafka fail-after <n>          the next n sends succeed, then Kafka goes down
    //   relay <batch>                 one relay pod polls once
    //   relay-pair <batch>            pods A and B poll at the same time: B polls while A is publishing
    // Output: one line per failed place, then a report of what reached Kafka.
    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        Db db = new Db();
        Broker broker = new Broker();
        try {
            for (String line : input.lines().map(String::strip).filter(l -> !l.isEmpty()).toList()) {
                String[] p = line.split("\\s+");
                switch (p[0]) {
                    case "place" -> {
                        try {
                            placeOrder(db, broker, p[1], p[2]);
                        } catch (DbException | BrokerException e) {
                            System.out.println("place " + p[1] + ": " + e.getMessage());
                        }
                    }
                    case "kafka" -> {
                        if (p[1].equals("down")) broker.okLeft = 0;
                        else if (p[1].equals("up")) broker.okLeft = Integer.MAX_VALUE;
                        else broker.okLeft = Integer.parseInt(p[2]);
                    }
                    case "relay" -> relayOnce(db, broker, Integer.parseInt(p[1]));
                    case "relay-pair" -> {
                        int batch = Integer.parseInt(p[1]);
                        broker.onFirstSend = () -> relayOnce(db, broker, batch); // pod B polls while pod A publishes
                        relayOnce(db, broker, batch);
                        broker.onFirstSend = null;
                    }
                    default -> throw new IllegalArgumentException("unknown command " + p[0]);
                }
            }
            db.report(broker);
        } catch (RuntimeException e) {
            System.out.println("error: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }
}

record OutboxRow(long id, String aggregateId, String type) {}

class DbException extends RuntimeException {
    DbException(String message) { super(message); }
}

class BrokerException extends RuntimeException {
    BrokerException(String message) { super(message); }
}

/** Kafka stand-in: records what was acknowledged. */
class Broker {
    int okLeft = Integer.MAX_VALUE;
    Runnable onFirstSend;
    final List<String[]> published = new ArrayList<>(); // [key, value]

    void send(String topic, String key, String value) {
        if (onFirstSend != null) { Runnable r = onFirstSend; onFirstSend = null; r.run(); }
        if (okLeft <= 0) throw new BrokerException("kafka unavailable: Broker transport failure");
        okLeft--;
        published.add(new String[] { key, value });
    }
}

/** PostgreSQL stand-in: committed tables, row locks held until commit or rollback. */
class Db {
    final Map<String, String> orders = new LinkedHashMap<>();
    final List<long[]> outbox = new ArrayList<>();          // [id, sent 0/1]
    final Map<Long, String[]> outboxData = new HashMap<>(); // id -> [aggregateId, type]
    final Map<Long, Tx> locks = new HashMap<>();
    long nextId = 1;
    int waits = 0;

    Tx begin() { return new Tx(this); }

    void report(Broker broker) {
        Map<String, Integer> perEvent = new LinkedHashMap<>();
        for (String[] m : broker.published) perEvent.merge(m[0] + ":" + m[1], 1, Integer::sum);
        int ghosts = 0, duplicates = 0;
        for (Map.Entry<String, Integer> e : perEvent.entrySet()) {
            if (!orders.containsKey(e.getKey().split(":")[0])) ghosts++;
            duplicates += e.getValue() - 1;
        }
        int pending = 0, lost = 0;
        for (String id : orders.keySet()) {
            boolean published = perEvent.containsKey(id + ":OrderPlaced");
            boolean unsent = outbox.stream().anyMatch(r -> r[1] == 0 && outboxData.get(r[0])[0].equals(id));
            if (unsent) pending++;
            else if (!published) lost++;
        }
        System.out.println("orders: " + String.join(" ", orders.keySet()));
        List<String> seen = new ArrayList<>();
        for (String[] m : broker.published) seen.add(m[0] + ":" + m[1]);
        System.out.println("published: " + (seen.isEmpty() ? "-" : String.join(" ", seen)));
        System.out.println("events for orders that do not exist: " + ghosts);
        System.out.println("orders whose event is lost: " + lost);
        System.out.println("events still waiting in the outbox: " + pending);
        System.out.println("duplicate events: " + duplicates);
        System.out.println("relay waits on another pod's locks: " + waits);
    }
}

class Tx {
    final Db db;
    final List<String[]> newOrders = new ArrayList<>();
    final List<String[]> newEvents = new ArrayList<>();
    final List<Long> sent = new ArrayList<>();
    boolean open = true;

    Tx(Db db) { this.db = db; }

    void insertOrder(String orderId, String customer) { newOrders.add(new String[] { orderId, customer }); }

    void insertOutbox(String aggregateId, String type) { newEvents.add(new String[] { aggregateId, type }); }

    List<OutboxRow> query(String sql, int limit) {
        String s = sql.replaceAll("\\s+", " ").trim().toUpperCase(Locale.ROOT);
        if (!s.startsWith("SELECT ") || !s.contains(" FROM OUTBOX ") || !s.contains("WHERE SENT_AT IS NULL") || !s.contains("LIMIT ?")) {
            throw new DbException("this exercise's database only runs: SELECT ... FROM outbox WHERE sent_at IS NULL [ORDER BY id] LIMIT ? [FOR UPDATE [SKIP LOCKED]]");
        }
        boolean forUpdate = s.contains("FOR UPDATE");
        boolean skipLocked = s.contains("SKIP LOCKED");
        List<long[]> rows = new ArrayList<>(db.outbox.stream().filter(r -> r[1] == 0).toList());
        if (!s.contains("ORDER BY ID")) rows.sort(Comparator.comparingInt(r -> Long.hashCode(r[0] * 2654435761L))); // no ORDER BY: no guaranteed order
        List<OutboxRow> out = new ArrayList<>();
        for (long[] r : rows) {
            if (out.size() == limit) break;
            Tx holder = db.locks.get(r[0]);
            if (forUpdate && holder != null && holder != this) {
                if (skipLocked) continue;
                db.waits++; // FOR UPDATE without SKIP LOCKED blocks until the other pod commits
                return out;
            }
            if (forUpdate) db.locks.put(r[0], this);
            String[] d = db.outboxData.get(r[0]);
            out.add(new OutboxRow(r[0], d[0], d[1]));
        }
        return out;
    }

    void markSent(long id) { sent.add(id); }

    void commit() {
        if (!open) throw new DbException("transaction already ended");
        for (String[] o : newOrders) {
            if (o[1].equals("-")) {
                rollback();
                throw new DbException("ERROR: null value in column \"customer_id\" of relation \"orders\" violates not-null constraint");
            }
            if (db.orders.containsKey(o[0])) {
                rollback();
                throw new DbException("ERROR: duplicate key value violates unique constraint \"orders_pkey\"");
            }
        }
        for (String[] o : newOrders) db.orders.put(o[0], o[1]);
        for (String[] e : newEvents) {
            long id = db.nextId++;
            db.outbox.add(new long[] { id, 0 });
            db.outboxData.put(id, e);
        }
        for (long id : sent) for (long[] r : db.outbox) if (r[0] == id) r[1] = 1;
        end();
    }

    void rollback() { if (open) end(); }

    private void end() {
        open = false;
        db.locks.values().removeIf(t -> t == this);
    }
}
