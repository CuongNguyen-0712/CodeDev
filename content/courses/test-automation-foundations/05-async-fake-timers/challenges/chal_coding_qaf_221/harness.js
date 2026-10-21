// Harness: Build a fake clock
// Calls the learner's createFakeClock() and drives it with one scenario: the rules checked
// directly, or real callback-style code (debounce, retry with backoff, timeout) that takes the
// clock as a parameter.
//   input:  { scenario: "<name>" }
//   output: a JSON object describing what ran and when, or "failed: <message>"
async function __harness(input) {
  function makeClock(startMs) {
    const clock = startMs === undefined ? createFakeClock() : createFakeClock(startMs);
    for (const name of ["now", "setTimeout", "clearTimeout", "tick"]) {
      if (!clock || typeof clock[name] !== "function") {
        throw new Error(`createFakeClock() must return an object with a ${name}() method`);
      }
    }
    return clock;
  }

  // --- Code under test: written against an injected clock, as production code would be. ---

  function debounce(fn, waitMs, clock) {
    let id = null;
    return (...args) => {
      clock.clearTimeout(id);
      id = clock.setTimeout(() => {
        id = null;
        fn(...args);
      }, waitMs);
    };
  }

  // task(callback) reports (error) or (null, value). Retries failures `retries` times with
  // exponential backoff: baseMs, 2 * baseMs, 4 * baseMs ...
  function retryWithBackoff(task, { retries, baseMs }, clock, done) {
    const attempt = (n) => {
      task((error, value) => {
        if (!error) return done(null, value);
        if (n >= retries) return done(error);
        clock.setTimeout(() => attempt(n + 1), baseMs * 2 ** n);
      });
    };
    attempt(0);
  }

  // Calls back with the work's result, or with a timeout error after `ms` - never both.
  function callWithTimeout(work, ms, clock, callback) {
    let timedOut = false;
    const id = clock.setTimeout(() => {
      timedOut = true;
      callback(new Error(`timed out after ${ms} ms`));
    }, ms);
    work((error, value) => {
      if (timedOut) return; // too late: the caller has already moved on
      clock.clearTimeout(id);
      callback(error, value);
    });
  }

  // --- Scenarios ---

  const scenarios = {
    // Order of due times, the exact boundary, a non-zero start, now() after each tick.
    basic() {
      const clock = makeClock(1000);
      const log = [];
      clock.setTimeout(() => log.push("a@" + clock.now()), 300);
      clock.setTimeout(() => log.push("b@" + clock.now()), 100);
      clock.tick(99);
      const after99 = { log: [...log], now: clock.now() };
      clock.tick(1);
      clock.tick(500);
      return { after99, log, now: clock.now() };
    },

    // One long tick: each callback must see its own due time.
    nowDuringCallback() {
      const clock = makeClock(0);
      const log = [];
      clock.setTimeout(() => log.push("receipt@" + clock.now()), 300);
      clock.setTimeout(() => log.push("email@" + clock.now()), 500);
      clock.setTimeout(() => log.push("audit@" + clock.now()), 200);
      clock.tick(1000);
      return { log, now: clock.now() };
    },

    // Timers scheduled by callbacks: in the same tick when due by its end, later otherwise.
    nestedTimers() {
      const clock = makeClock(0);
      const log = [];
      clock.setTimeout(() => {
        log.push("A@" + clock.now());
        clock.setTimeout(() => {
          log.push("B@" + clock.now());
          clock.setTimeout(() => log.push("D@" + clock.now()));
        }, 100);
        clock.setTimeout(() => log.push("C@" + clock.now()), 5000);
      }, 100);
      clock.tick(1000);
      const afterFirstTick = { log: [...log], now: clock.now() };
      clock.tick(4100);
      return { afterFirstTick, log, now: clock.now() };
    },

    // Ties run in scheduling order; clearTimeout before and during a tick; no-op ids.
    tiesAndClear() {
      const clock = makeClock(0);
      const log = [];
      const a = clock.setTimeout(() => log.push("a@" + clock.now()), 50);
      const b = clock.setTimeout(() => log.push("b@" + clock.now()), 50);
      const c = clock.setTimeout(() => log.push("c@" + clock.now()), 50);
      const d = clock.setTimeout(() => log.push("d@" + clock.now()), 50);
      const x = clock.setTimeout(() => {
        log.push("x@" + clock.now());
        clock.clearTimeout(c);
      }, 10);
      const distinctIds = new Set([a, b, c, d, x]).size === 5;
      clock.clearTimeout(b);
      clock.clearTimeout(123456);
      clock.clearTimeout(undefined);
      clock.tick(100);
      clock.clearTimeout(a); // already ran
      clock.setTimeout(() => log.push("e@" + clock.now()), 0);
      clock.tick(0);
      return { distinctIds, log, now: clock.now() };
    },

    // A search box: only the last keystroke within 300 ms is sent.
    debounce() {
      const clock = makeClock(0);
      const sent = [];
      const onInput = debounce((query) => sent.push(query + "@" + clock.now()), 300, clock);
      onInput("s");
      clock.tick(100);
      onInput("sh");
      clock.tick(150);
      onInput("sho");
      clock.tick(299);
      const justBefore = [...sent];
      clock.tick(1);
      onInput("shoe");
      clock.tick(1000);
      return { justBefore, sent, now: clock.now() };
    },

    // Payment capture with backoff 1 s, 2 s, 4 s, driven by ONE long tick.
    retry() {
      const run = (failures) => {
        const clock = makeClock(0);
        const attempts = [];
        let outcome = "pending";
        const capture = (callback) => {
          attempts.push(clock.now());
          if (attempts.length <= failures) callback(new Error("503"));
          else callback(null, "captured");
        };
        retryWithBackoff(capture, { retries: 3, baseMs: 1000 }, clock, (error, value) => {
          outcome = (error ? error.message : value) + "@" + clock.now();
        });
        clock.tick(60000);
        return { attempts, outcome };
      };
      return { alwaysDown: run(Infinity), upOnThirdTry: run(2) };
    },

    // A shipping quote with a 500 ms timeout: a fast and a slow provider.
    timeout() {
      const run = (responseMs) => {
        const clock = makeClock(0);
        const results = [];
        const quote = (callback) => clock.setTimeout(() => callback(null, "quote"), responseMs);
        callWithTimeout(quote, 500, clock, (error, value) => {
          results.push((error ? error.message : value) + "@" + clock.now());
        });
        clock.tick(2000);
        return results;
      };
      return { fast: run(300), slow: run(800) };
    },

    // Defaults: start 0, a missing ms means 0, tick(0), small ticks add up exactly.
    defaults() {
      const clock = makeClock();
      const log = [];
      const start = clock.now();
      clock.setTimeout(() => log.push("zero@" + clock.now()));
      clock.setTimeout(() => log.push("half@" + clock.now()), 500);
      clock.tick(0);
      clock.tick(250);
      clock.tick(249);
      const before = [...log];
      clock.tick(1);
      return { start, before, log, now: clock.now() };
    },
  };

  const scenario = scenarios[input.scenario];
  if (!scenario) throw new Error(`unknown scenario ${input.scenario}`);
  try {
    return scenario();
  } catch (error) {
    return `failed: ${error && error.message}`;
  }
}
