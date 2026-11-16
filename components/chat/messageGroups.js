// Consecutive messages from one sender within GROUP_GAP_MS form a group: the thread shows the avatar
// and the time once (on the last message), the sender's name once (on the first), and keeps the
// rows of a group close together.
export const GROUP_GAP_MS = 5 * 60 * 1000;

// A message still being sent has no createdAt yet: it belongs to "now".
const at = (message) => Date.parse(message?.createdAt) || Date.now();

const together = (a, b) => Boolean(a && b)
    && a.sender?.id != null && a.sender.id === b.sender?.id
    && Math.abs(at(b) - at(a)) < GROUP_GAP_MS;

/** [{ groupStart, groupEnd }] for each message, in order. */
export function groupFlags(messages) {
    return messages.map((message, index) => ({
        groupStart: !together(messages[index - 1], message),
        groupEnd: !together(message, messages[index + 1]),
    }));
}
