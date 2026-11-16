const MAX_BYTES = 32;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const PICTOGRAPH = /\p{Extended_Pictographic}/u;
const FLAG = /^\p{Regional_Indicator}{2}$/u; // flags are two regional indicators, which are not pictographs

/** True for exactly one emoji grapheme (ZWJ sequences, skin tones and flags included), at most 32 UTF-8 bytes. */
export function isSingleEmoji(value) {
    if (typeof value !== "string" || !value || new TextEncoder().encode(value).length > MAX_BYTES) return false;
    const graphemes = [...segmenter.segment(value)];
    return graphemes.length === 1 && (PICTOGRAPH.test(value) || FLAG.test(value));
}
