import java.util.*;

/**
 * Rice Rocket menu cache: GET /restaurants/{id}/menu in front of PostgreSQL (cache-aside).
 *
 * Loading one menu from the database takes 200 ms. At lunch hundreds of requests per second ask
 * for the same few menus. Write the three callbacks the cache layer calls:
 *
 *   onRequest(cache, db, key, now)   answers how the request is served:
 *     "hit"    a cached copy is fresh (now < refreshAt)
 *     "stale"  a cached copy is past refreshAt but not expired: serve it and, unless a load for
 *              this key is already running, start one in the background (refresh ahead)
 *     "wait"   no usable copy, but a load for this key is running: join it (one load per key)
 *     "load"   no usable copy and no load running: start one (db.startLoad)
 *   onLoaded(cache, key, value, now) a load finished: cache the value until now + TTL_MS plus a
 *     per-key jitter of up to JITTER_MS (the key hash spread by the golden-ratio constant 0x9E3779B1,
 *     modulo JITTER_MS), so menus loaded
 *     together do not all expire together; refresh starts REFRESH_BEFORE_MS before that.
 *   onPriceChange(cache, db, key, price, now) a restaurant changed a price: commit the change, then
 *     drop the cached menu. A request may arrive while the change is being committed.
 *
 * Cache, Db and the request schedule are stand-ins in the test runner below.
 */
public class Main {
    static final long TTL_MS = 60_000;
    static final long REFRESH_BEFORE_MS = 10_000;
    static final int JITTER_MS = 6_000;

    static String onRequest(Cache cache, Db db, String key, long now) {
        Cache.Entry e = cache.get(key);
        // @piece serve-cached: Serve a cached menu, refreshing it ahead of expiry
        if (e != null && now < e.refreshAt()) return "hit";
        if (e != null && now < e.expiresAt()) {
            if (!cache.loading(key)) db.startLoad(cache, key, now);
            return "stale";
        }
        // @end
        // @piece coalesce: Join a load of this menu that is already running
        if (cache.loading(key)) return "wait";
        // @end
        db.startLoad(cache, key, now);
        return "load";
    }

    static void onLoaded(Cache cache, String key, String value, long now) {
        // @piece expiry-with-jitter: When this copy expires, and when its refresh starts
        long expiresAt = now + TTL_MS + Math.floorMod(key.hashCode() * 0x9E3779B1, JITTER_MS);
        cache.put(key, value, expiresAt - REFRESH_BEFORE_MS, expiresAt);
        // @end
    }

    static void onPriceChange(Cache cache, Db db, String key, long price, long now) {
        // @piece invalidate-on-write: Change the price, then drop the cached menu
        db.updatePrice(key, price, now);
        cache.evict(key);
        // @end
    }

    // ---------------------------------------------------------------- test runner (do not change)
    // Input lines (times in ms):
    //   burst <key> <start> <count> <every>   count requests for key, one every <every> ms from start
    //   keys <prefix> <n> <start> <count> <every>   the same burst for keys prefix0 .. prefix(n-1)
    //   update <key> <time> <price>           a price change; one request for key lands mid-commit
    // A database load takes 200 ms and returns the menu as of its start.
    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        Sim sim = new Sim();
        try {
            for (String line : input.lines().map(String::strip).filter(l -> !l.isEmpty()).toList()) {
                String[] p = line.split("\\s+");
                switch (p[0]) {
                    case "burst" -> sim.burst(p[1], Long.parseLong(p[2]), Integer.parseInt(p[3]), Long.parseLong(p[4]));
                    case "keys" -> {
                        for (int i = 0; i < Integer.parseInt(p[2]); i++) sim.burst(p[1] + i, Long.parseLong(p[3]), Integer.parseInt(p[4]), Long.parseLong(p[5]));
                    }
                    case "update" -> sim.events.add(new long[] { Long.parseLong(p[2]), 1, sim.keyId(p[1]), Long.parseLong(p[3]) });
                    default -> throw new IllegalArgumentException("unknown line " + line);
                }
            }
            sim.run();
        } catch (RuntimeException e) {
            System.out.println("error: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }
}

class Cache {
    record Entry(String value, long refreshAt, long expiresAt) {}

    final Map<String, Entry> entries = new HashMap<>();
    final Map<String, Integer> running = new HashMap<>();

    Entry get(String key) { return entries.get(key); }

    boolean loading(String key) { return running.getOrDefault(key, 0) > 0; }

    void put(String key, String value, long refreshAt, long expiresAt) { entries.put(key, new Entry(value, refreshAt, expiresAt)); }

    void evict(String key) { entries.remove(key); }
}

class Db {
    final Sim sim;
    final Map<String, Long> prices = new HashMap<>();

    Db(Sim sim) { this.sim = sim; }

    String read(String key) { return "price=" + prices.getOrDefault(key, 50_000L); }

    void startLoad(Cache cache, String key, long now) {
        cache.running.merge(key, 1, Integer::sum);
        sim.loads.add(new Object[] { key, read(key), now + 200, now, new ArrayList<long[]>() });
        sim.loadStarts.add(now);
    }

    void updatePrice(String key, long price, long now) {
        sim.request(key, now); // a request lands while the UPDATE is being committed
        prices.put(key, price);
        sim.changedAt.put(key, now);
    }
}

class Sim {
    final Cache cache = new Cache();
    final Db db = new Db(this);
    final List<long[]> events = new ArrayList<>(); // [time, kind 0=request 1=update, key id, price]
    final List<String> keys = new ArrayList<>();
    final List<Object[]> loads = new ArrayList<>(); // [key, value, doneAt, startedAt, waiters]
    final List<Long> loadStarts = new ArrayList<>();
    final Map<String, Long> changedAt = new HashMap<>();
    final Map<String, Integer> served = new TreeMap<>();
    int requests = 0, maxRunning = 0, oldPrice = 0;

    long keyId(String key) {
        if (!keys.contains(key)) keys.add(key);
        return keys.indexOf(key);
    }

    void burst(String key, long start, int count, long every) {
        long id = keyId(key);
        for (int i = 0; i < count; i++) events.add(new long[] { start + i * every, 0, id, 0 });
    }

    void finishLoadsUntil(long t) {
        loads.sort(Comparator.comparingLong(l -> (long) l[2]));
        while (!loads.isEmpty() && (long) loads.get(0)[2] <= t) {
            Object[] l = loads.remove(0);
            String key = (String) l[0];
            cache.running.merge(key, -1, Integer::sum);
            Main.onLoaded(cache, key, (String) l[1], (long) l[2]);
            checkPrice(key, (String) l[1], (long) l[2]);
        }
    }

    void checkPrice(String key, String value, long at) {
        Long changed = changedAt.get(key);
        if (changed != null && at > changed + 1_000 && !value.equals(db.read(key))) oldPrice++;
    }

    void request(String key, long now) {
        requests++;
        int running = loads.size();
        String how = Main.onRequest(cache, db, key, now);
        served.merge(how, 1, Integer::sum);
        maxRunning = Math.max(maxRunning, loads.size());
        if (how.equals("hit") || how.equals("stale")) {
            Cache.Entry e = cache.get(key);
            if (e == null) throw new IllegalStateException("\"" + how + "\" for " + key + " but nothing is cached");
            checkPrice(key, e.value(), now);
        } else if (how.equals("wait") && running == 0 && !cache.loading(key)) {
            throw new IllegalStateException("\"wait\" for " + key + " but no load is running");
        }
    }

    void run() {
        events.sort(Comparator.<long[]>comparingLong(e -> e[0]).thenComparingLong(e -> e[1]));
        for (long[] e : events) {
            finishLoadsUntil(e[0]);
            String key = keys.get((int) e[2]);
            if (e[1] == 0) request(key, e[0]);
            else Main.onPriceChange(cache, db, key, e[3], e[0]);
        }
        finishLoadsUntil(Long.MAX_VALUE);
        int busiest = 0;
        for (long s : loadStarts) {
            if (s < 30_000) continue; // after the cold start
            int inSecond = 0;
            for (long o : loadStarts) if (o >= s && o < s + 1_000) inSecond++;
            busiest = Math.max(busiest, inSecond);
        }
        StringBuilder kinds = new StringBuilder();
        for (String k : List.of("hit", "stale", "wait", "load")) kinds.append(kinds.length() == 0 ? "" : ", ").append(k).append(' ').append(served.getOrDefault(k, 0));
        System.out.println("requests: " + requests + " (" + kinds + ")");
        System.out.println("database loads: " + loadStarts.size() + ", at most " + maxRunning + " at once");
        System.out.println("loads started in the busiest second after the first 30 s: " + busiest);
        System.out.println("old price served more than 1 s after a change: " + oldPrice);
    }
}
