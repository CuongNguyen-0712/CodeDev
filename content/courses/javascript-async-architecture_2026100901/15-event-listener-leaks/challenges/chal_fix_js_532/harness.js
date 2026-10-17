// Harness: Fix the leaking unmount()
// target is a real EventTarget that also counts its live listeners (same matching rules as the
// DOM: type + listener + capture; once and signal are honoured). store counts live subscribers,
// timers count live intervals. Steps:
//   { op: "mount", as }    -> mountWidget(target, store, timers)
//   { op: "unmount", as }  -> that widget's unmount()
//   { op: "interact" }     -> one click, an Escape keydown, a new price, 5 s of clock time
//   { op: "report" }       -> snapshot of live listeners / subscriptions / intervals and every view
async function __harness(input) {
    class CountingTarget extends EventTarget {
        constructor() {
            super();
            this.records = [];
        }
        addEventListener(type, listener, options) {
            if (!listener) return;
            const capture = typeof options === "boolean" ? options : Boolean(options && options.capture);
            const once = typeof options === "object" && options !== null && Boolean(options.once);
            const signal = typeof options === "object" && options !== null ? options.signal : undefined;
            if (signal && signal.aborted) return;
            if (this.records.some((r) => r.type === type && r.listener === listener && r.capture === capture)) return;

            const record = { type, listener, capture };
            const target = this;
            record.wrapper = function (event) {
                if (once) target.drop(record);
                return typeof listener === "function" ? listener.call(this, event) : listener.handleEvent(event);
            };
            this.records.push(record);
            super.addEventListener(type, record.wrapper, { capture, once });
            if (signal) signal.addEventListener("abort", () => this.removeEventListener(type, listener, { capture }), { once: true });
        }
        removeEventListener(type, listener, options) {
            const capture = typeof options === "boolean" ? options : Boolean(options && options.capture);
            const record = this.records.find((r) => r.type === type && r.listener === listener && r.capture === capture);
            if (record) this.drop(record);
        }
        drop(record) {
            const index = this.records.indexOf(record);
            if (index === -1) return;
            this.records.splice(index, 1);
            super.removeEventListener(record.type, record.wrapper, { capture: record.capture });
        }
    }

    const target = new CountingTarget();

    const subscribers = new Set();
    const store = {
        subscribe(listener) {
            const entry = { listener };
            subscribers.add(entry);
            return () => { subscribers.delete(entry); };
        },
        push(price) {
            for (const entry of [...subscribers]) entry.listener(price);
        },
    };

    let now = 0;
    let seq = 0;
    const intervals = new Map();
    const timers = {
        setInterval(callback, ms) {
            const id = ++seq;
            const every = Math.max(1, Number(ms) || 1);
            intervals.set(id, { callback, every, next: now + every });
            return id;
        },
        clearInterval(id) {
            intervals.delete(id);
        },
    };
    function advance(ms) {
        const end = now + ms;
        for (let guard = 0; guard < 10000; guard++) {
            let due = null;
            for (const [id, t] of intervals) {
                if (t.next <= end && (!due || t.next < due[1].next)) due = [id, t];
            }
            if (!due) break;
            now = due[1].next;
            due[1].next += due[1].every;
            due[1].callback();
        }
        now = end;
    }

    const widgets = {};
    let price = 100;
    const reports = [];

    for (const step of input.steps || []) {
        if (step.op === "mount") {
            widgets[step.as] = mountWidget(target, store, timers);
        } else if (step.op === "unmount") {
            widgets[step.as].unmount();
        } else if (step.op === "interact") {
            target.dispatchEvent(new Event("click"));
            const key = new Event("keydown");
            key.key = "Escape";
            target.dispatchEvent(key);
            store.push(price++);
            advance(5000);
        } else if (step.op === "report") {
            const views = {};
            for (const [name, widget] of Object.entries(widgets)) views[name] = { ...widget.view };
            reports.push({
                listeners: target.records.length,
                subscriptions: subscribers.size,
                intervals: intervals.size,
                views,
            });
        }
    }
    return reports;
}
