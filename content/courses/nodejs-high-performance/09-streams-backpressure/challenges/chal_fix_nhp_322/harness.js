// Harness: Fix the exporter that ignores backpressure
// `out` is a fake Writable: chunks go into an in-memory buffer, and a slow "client"
// flushes the whole buffer on each macrotask (setTimeout 0) - so it only gets to run
// while the exporter is actually waiting. write() returns false once the buffer holds
// highWaterMark chunks, and 'drain' fires after a flush that followed a false.
// `rows` is an async generator; with pageSize set it pauses every pageSize rows like a
// database cursor fetching the next page.
// Output: { rows, inOrder, header, ended, peakBuffered }.
async function __harness(input) {
    const highWaterMark = Number(input.highWaterMark) || 16;
    const total = Number(input.rows) || 0;
    const pageSize = Number(input.pageSize) || 0;

    const buffer = [];
    const received = [];
    let peak = 0;
    let needDrain = false;
    let ended = false;
    let writeAfterEnd = false;
    let drainListeners = [];
    let flushScheduled = false;

    const flush = () => {
        flushScheduled = false;
        received.push(...buffer.splice(0));
        if (needDrain) {
            needDrain = false;
            const listeners = drainListeners;
            drainListeners = [];
            for (const cb of listeners) cb();
        }
    };
    const scheduleFlush = () => {
        if (!flushScheduled) {
            flushScheduled = true;
            setTimeout(flush, 0);
        }
    };

    const out = {
        write(chunk) {
            if (ended) writeAfterEnd = true;
            buffer.push(String(chunk));
            peak = Math.max(peak, buffer.length);
            scheduleFlush();
            const ok = buffer.length < highWaterMark;
            if (!ok) needDrain = true;
            return ok;
        },
        once(event, cb) {
            if (event === "drain") drainListeners.push(cb);
        },
        on(event, cb) {
            if (event === "drain") drainListeners.push(cb);
        },
        end(chunk) {
            if (chunk !== undefined) out.write(chunk);
            ended = true;
            received.push(...buffer.splice(0));
        },
    };

    async function* ledgerRows() {
        for (let i = 1; i <= total; i++) {
            if (pageSize && i > 1 && (i - 1) % pageSize === 0) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
            yield { id: i, walletId: `w-${(i % 7) + 1}`, amount: (i * 37) % 1000, createdAt: "2026-10-16" };
        }
    }

    await exportLedger(ledgerRows(), out);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const lines = received.join("").split("\n").filter((line) => line.length > 0);
    const header = lines[0] === "id,wallet_id,amount,created_at";
    const dataLines = header ? lines.slice(1) : lines;
    const inOrder = dataLines.length === total
        && dataLines.every((line, index) => line.split(",")[0] === String(index + 1));

    return {
        rows: dataLines.length,
        inOrder,
        header,
        ended: ended && !writeAfterEnd,
        peakBuffered: peak <= highWaterMark ? "within highWaterMark" : `${peak} chunks (limit ${highWaterMark})`,
    };
}
