import crypto from 'crypto';

const EPOCH = 1704067200000n;

// Sonyflake config
const MACHINE_ID_BITS = 16n;
const SEQUENCE_BITS = 8n;

const MAX_SEQUENCE =
    (1n << SEQUENCE_BITS) - 1n;

const MACHINE_ID_SHIFT = SEQUENCE_BITS;

const TIMESTAMP_SHIFT =
    MACHINE_ID_BITS + SEQUENCE_BITS;

const TIME_UNIT = 10n;

// IMPORTANT:
// mỗi instance phải khác nhau
const MACHINE_ID = BigInt(
    process.env.MACHINE_ID || 1
);

let sequence = 0n;
let lastTimestamp = -1n;

function timestamp() {
    return (
        (BigInt(Date.now()) - EPOCH) /
        TIME_UNIT
    );
}

function waitNextTimestamp(lastTs) {
    let ts = timestamp();

    while (ts <= lastTs) {
        ts = timestamp();
    }

    return ts;
}

export function generateSonyflake() {
    let ts = timestamp();

    // clock moved backwards
    if (ts < lastTimestamp) {
        throw new Error(
            'Clock moved backwards'
        );
    }

    if (ts === lastTimestamp) {
        sequence =
            (sequence + 1n) &
            MAX_SEQUENCE;

        // overflow sequence
        if (sequence === 0n) {
            ts = waitNextTimestamp(
                lastTimestamp
            );
        }
    } else {
        // randomize sequence
        sequence = BigInt(
            crypto.randomInt(0, 16)
        );
    }

    lastTimestamp = ts;

    const id =
        (ts << TIMESTAMP_SHIFT) |
        (MACHINE_ID << MACHINE_ID_SHIFT) |
        sequence;

    return id.toString();
}